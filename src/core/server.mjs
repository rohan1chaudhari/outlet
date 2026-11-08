import http from "node:http";
import { ConnectorError, publicError, fail } from "./errors.mjs";
import {
  DEFAULT_PORT,
  PROTOCOL_VERSION,
  originOf,
  exchangeInput,
  generationInput,
} from "./validation.mjs";

async function readJSON(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || ""))
    fail("invalid_content_type", "Use application/json.", 415);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 6 * 1024 * 1024)
      fail("request_too_large", "The request is too large.", 413);
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error();
    return body;
  } catch {
    fail("invalid_json", "Send a JSON object.");
  }
}
export function createConnectorServer(
  controller,
  { port = DEFAULT_PORT } = {},
) {
  const server = http.createServer(async (req, res) => {
    const json = (status, body) => {
      if (!res.writableEnded) {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
      }
    };
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    try {
      const boundPort = server.address()?.port || port;
      if (
        ![`127.0.0.1:${boundPort}`, `localhost:${boundPort}`].includes(
          req.headers.host,
        )
      )
        fail("invalid_host", "Use the connector loopback address.", 403);
      const origin = originOf(req.headers.origin);
      const url = new URL(req.url, `http://127.0.0.1:${boundPort}`);
      if (url.origin !== `http://127.0.0.1:${boundPort}`)
        fail("invalid_request", "Invalid request target.", 403);
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Allow-Private-Network": "true",
          "Access-Control-Max-Age": "300",
        });
        return res.end();
      }
      if (req.method === "GET" && url.pathname === "/v1/info")
        return json(200, {
          service: "bring-ai",
          protocolVersion: PROTOCOL_VERSION,
          version: "0.1.0",
          transports: ["http-sse"],
        });
      if (req.method === "POST" && url.pathname === "/v1/pairings")
        return json(201, controller.createPairing(origin, await readJSON(req)));
      if (req.method === "POST" && url.pathname === "/v1/pairings/exchange") {
        const result = controller.exchange(
          origin,
          exchangeInput(await readJSON(req)),
        );
        return json(result.pending ? 202 : 200, result);
      }
      const token = /^Bearer ([A-Za-z0-9_-]+)$/.exec(
        req.headers.authorization || "",
      )?.[1];
      const grant = controller.authenticate(origin, token);
      if (req.method === "DELETE" && url.pathname === "/v1/session") {
        controller.revoke(grant.id);
        return json(200, { ok: true });
      }
      const statusMatch = /^\/v1\/requests\/([A-Za-z0-9_-]{8,100})$/.exec(
        url.pathname,
      );
      if (req.method === "GET" && statusMatch)
        return json(200, controller.requestStatus(grant, statusMatch[1]));
      if (req.method === "DELETE" && statusMatch) {
        controller.cancel(grant, statusMatch[1]);
        return json(200, { ok: true });
      }
      if (req.method !== "POST" || url.pathname !== "/v1/generate")
        fail("not_found", "Unknown connector operation.", 404);
      const body = generationInput(await readJSON(req));
      // Authority is rechecked after body streaming, not only before it.
      controller.authenticate(origin, token);
      const abort = new AbortController();
      const onClose = () => {
        if (!res.writableEnded) abort.abort();
      };
      res.once("close", onClose);
      let started = false;
      const emit = (event, data) => {
        if (res.destroyed || res.writableEnded) return;
        if (!started) {
          started = true;
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "X-Accel-Buffering": "no",
          });
        }
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      try {
        await controller.generate(grant, body, abort.signal, emit);
      } finally {
        res.off("close", onClose);
        if (started && !res.writableEnded) res.end();
      }
    } catch (error) {
      if (!res.headersSent)
        json(error instanceof ConnectorError ? error.status : 500, {
          error: publicError(error),
        });
      else if (!res.writableEnded) res.end();
    }
  });
  server.requestTimeout = 135000;
  server.headersTimeout = 10000;
  return server;
}
