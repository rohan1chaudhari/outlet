import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { clientPaths } from "./client-paths.mjs";
import { runClient } from "./cli-process.mjs";
import { ConnectorError } from "../core/errors.mjs";
const exec = promisify(execFile);

export async function findClaude() {
  const binaries = clientPaths("claude");
  for (const binary of binaries) {
    try {
      const { stdout } = await exec(
        binary,
        ["--safe-mode", "auth", "status", "--json"],
        { timeout: 8000, maxBuffer: 16000, windowsHide: true },
      );
      return { binary, ready: JSON.parse(stdout).loggedIn === true };
    } catch (error) {
      if (error.code !== "ENOENT")
        return { binary, ready: false };
    }
  }
  return null;
}

export function parseClaudeOutput(stdout, code, schema) {
  let result,
    text = "",
    operations = false;
  for (const line of stdout.split("\n")) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (
      event.type === "system" &&
      event.subtype === "init" &&
      event.tools?.some((tool) => tool !== "StructuredOutput" || !schema)
    )
      operations = true;
    if (event.type === "assistant") {
      for (const block of event.message?.content || []) {
        if (block.type === "text") text += block.text;
        if (
          block.type === "tool_use" &&
          !(schema && block.name === "StructuredOutput")
        )
          operations = true;
      }
    }
    if (event.type === "result") result = event;
  }
  if (operations)
    throw new ConnectorError(
      "tool_attempt_rejected",
      "Claude attempted an unsupported operation.",
      502,
    );
  if (
    result?.is_error &&
    /credit balance|insufficient credits/i.test(result.result || "")
  )
    throw new ConnectorError(
      "claude_usage_unavailable",
      "Claude reports insufficient credits. Check its account or billing.",
      429,
    );
  if (code !== 0 || !result || result.is_error || result.subtype !== "success")
    throw new ConnectorError(
      "claude_failed",
      "Claude could not complete inference. Check its sign-in and usage allowance.",
      502,
    );
  const response = result.result || text;
  let output;
  try {
    output = schema
      ? (result.structured_output ?? JSON.parse(response))
      : response;
  } catch {
    throw new ConnectorError(
      "invalid_model_output",
      "Claude returned invalid JSON.",
      502,
    );
  }
  if (output === undefined || output === "")
    throw new ConnectorError(
      "invalid_model_output",
      "Claude returned an empty response.",
      502,
    );
  return { output, provider: "claude", toolCalls: 0, usage: result.usage };
}

export async function generateClaude(
  binary,
  { messages, attachments, outputSchema, model, signal, onText },
) {
  const dir = await mkdtemp(join(tmpdir(), "bring-ai-claude-"));
  try {
    const args = [
      "--safe-mode",
      "--restricted",
      "--print",
      "--verbose",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--tools",
      "",
      "--permission-prompts",
      "none",
      "--strict-mcp-config",
      "--mcp-config",
      '{"mcpServers":{}}',
      "--no-session-persistence",
      "--no-chrome",
      "--disable-slash-commands",
      "--setting-sources",
      "",
      "--settings",
      '{"disableAllHooks":true}',
      "--system-prompt",
      "Return inference from the supplied messages and images only. No commands, browsing, tools, or local file access.",
    ];
    if (model && model !== "claude-default") args.push("--model", model);
    if (outputSchema) args.push("--json-schema", JSON.stringify(outputSchema));
    const content = [
      ...attachments.map((image) => ({
        type: "image",
        source: { type: "base64", media_type: image.mime, data: image.data },
      })),
      { type: "text", text: JSON.stringify(messages) },
    ];
    const { code, stdout } = await runClient({
      binary,
      args,
      cwd: dir,
      signal,
      input:
        JSON.stringify({ type: "user", message: { role: "user", content } }) +
        "\n",
    });
    const result = parseClaudeOutput(stdout, code, outputSchema);
    onText?.(
      typeof result.output === "string"
        ? result.output
        : JSON.stringify(result.output),
    );
    return result;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
