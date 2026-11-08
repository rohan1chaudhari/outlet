import Ajv from "ajv";
import { fail } from "./errors.mjs";

export const PROTOCOL_VERSION = 1;
export const CAPABILITIES = ["text", "image", "structuredOutput", "streaming"];
export const DEFAULT_PORT = 4360;
const ajv = new Ajv({
  strict: false,
  allErrors: false,
  validateFormats: false,
  ownProperties: true,
});
export function originOf(value) {
  if (typeof value !== "string" || value.length > 512)
    fail("invalid_origin", "A valid app origin is required.", 403);
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("invalid_origin", "A valid app origin is required.", 403);
  }
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (
    url.origin !== value ||
    url.username ||
    url.password ||
    !(url.protocol === "https:" || (url.protocol === "http:" && loopback))
  ) {
    fail(
      "invalid_origin",
      "Apps must use HTTPS, or HTTP on localhost for development.",
      403,
    );
  }
  return url.origin;
}
function record(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value, allowed) {
  if (
    !record(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    fail("invalid_request", "The request contains unsupported fields.");
}
export function pairingInput(body) {
  exactKeys(body, ["name", "purpose", "requires", "codeChallenge"]);
  if (
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.length > 80
  )
    fail("invalid_request", "An app name is required (80 characters maximum).");
  if (
    typeof body.purpose !== "string" ||
    !body.purpose.trim() ||
    body.purpose.length > 240
  )
    fail(
      "invalid_request",
      "Explain why this app needs AI (240 characters maximum).",
    );
  if (!/^[A-Za-z0-9_-]{43}$/.test(body.codeChallenge || ""))
    fail("invalid_request", "A SHA-256 pairing challenge is required.");
  if (
    !Array.isArray(body.requires) ||
    body.requires.length > CAPABILITIES.length ||
    body.requires.some((key) => !CAPABILITIES.includes(key))
  )
    fail(
      "unsupported_capability",
      "The app requested unsupported capabilities.",
    );
  return {
    name: body.name.trim(),
    purpose: body.purpose.trim(),
    requires: [...new Set(["text", ...body.requires])],
    codeChallenge: body.codeChallenge,
  };
}
export function exchangeInput(body) {
  exactKeys(body, ["pairingId", "codeVerifier"]);
  if (
    !/^[a-f0-9]{48}$/.test(body.pairingId || "") ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(body.codeVerifier || "")
  )
    fail("invalid_request", "Invalid pairing proof.");
  return body;
}
export function checkSchema(schema) {
  if (
    !record(schema) ||
    schema.type !== "object" ||
    JSON.stringify(schema).length > 32000
  )
    fail("invalid_schema", "Use a bounded JSON object schema.");
  let nodes = 0;
  const allowed = [
    "type",
    "properties",
    "required",
    "additionalProperties",
    "items",
    "enum",
    "const",
    "description",
    "title",
    "minimum",
    "maximum",
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
  ];
  const walk = (value, depth = 0) => {
    if (!record(value) || depth > 10 || ++nodes > 200)
      fail("invalid_schema", "Use a simple, bounded response schema.");
    if (Object.keys(value).some((key) => !allowed.includes(key)))
      fail(
        "invalid_schema",
        "References, patterns and schema combinators are not supported.",
      );
    if (
      value.additionalProperties !== undefined &&
      typeof value.additionalProperties !== "boolean"
    )
      fail("invalid_schema", "additionalProperties must be a boolean.");
    if (value.properties) {
      if (!record(value.properties))
        fail("invalid_schema", "Invalid schema properties.");
      for (const [key, child] of Object.entries(value.properties)) {
        if (["__proto__", "constructor", "prototype"].includes(key))
          fail("invalid_schema", "Unsupported property name.");
        walk(child, depth + 1);
      }
    }
    if (value.items) walk(value.items, depth + 1);
    if (value.enum && (!Array.isArray(value.enum) || value.enum.length > 100))
      fail("invalid_schema", "Limit enum choices to 100.");
  };
  walk(schema);
  try {
    ajv.compile(schema);
  } catch {
    fail("invalid_schema", "The response schema is invalid.");
  } finally {
    ajv.removeSchema(schema);
  }
  return schema;
}
export function generationInput(body) {
  exactKeys(body, ["requestId", "messages", "attachments", "outputSchema"]);
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(body.requestId || ""))
    fail("invalid_request", "A unique request ID is required.");
  if (
    !Array.isArray(body.messages) ||
    !body.messages.length ||
    body.messages.length > 100
  )
    fail("invalid_request", "Provide between 1 and 100 messages.");
  let chars = 0;
  const messages = body.messages.map((message) => {
    exactKeys(message, ["role", "content"]);
    if (
      !["user", "assistant", "developer", "system"].includes(message.role) ||
      typeof message.content !== "string"
    )
      fail("invalid_request", "Messages need a role and plain text content.");
    chars += message.content.length;
    return { role: message.role, content: message.content };
  });
  if (chars < 1 || chars > 100000)
    fail("invalid_request", "Message text must fit within 100,000 characters.");
  const attachments = body.attachments || [];
  if (!Array.isArray(attachments) || attachments.length > 3)
    fail("invalid_request", "Attach up to three images.");
  let imageBytes = 0;
  for (const item of attachments) {
    exactKeys(item, ["mime", "data"]);
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(item.mime) ||
      typeof item.data !== "string" ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(item.data)
    )
      fail("invalid_request", "Use inline JPEG, PNG or WebP images.");
    imageBytes += item.data.length;
  }
  if (imageBytes > 4000000)
    fail("invalid_request", "Images are too large. Resize them first.");
  if (body.outputSchema) checkSchema(body.outputSchema);
  return {
    requestId: body.requestId,
    messages,
    attachments,
    ...(body.outputSchema ? { outputSchema: body.outputSchema } : {}),
  };
}
export function validateOutput(schema, output) {
  if (!schema) return;
  try {
    if (!ajv.compile(schema)(output))
      fail(
        "invalid_model_output",
        "The model returned data that does not match the requested schema.",
        502,
      );
  } finally {
    ajv.removeSchema(schema);
  }
}
