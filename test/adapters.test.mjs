import test from "node:test";
import assert from "node:assert/strict";
import { parseCodexOutput } from "../src/providers/codex.mjs";
import { AISession } from "../packages/browser/index.js";
const lines = (events) => events.map((e) => JSON.stringify(e)).join("\n");
const success = [
  { type: "item.completed", item: { type: "agent_message", text: "hello" } },
  { type: "turn.completed", usage: { input_tokens: 1 } },
];

test("Codex startup warning is not a tool operation; actual tools and unsuccessful turns fail", () => {
  const warning = {
    type: "item.completed",
    item: { type: "error", message: "Under-development features enabled" },
  };
  assert.equal(
    parseCodexOutput(lines([warning, ...success]), 0).output,
    "hello",
  );
  for (const type of [
    "command_execution",
    "file_change",
    "mcp_tool_call",
    "web_search",
    "unknown_operation",
  ]) {
    assert.throws(
      () =>
        parseCodexOutput(
          lines([{ type: "item.completed", item: { type } }, ...success]),
          0,
        ),
      { code: "tool_attempt_rejected" },
    );
  }
  assert.throws(() => parseCodexOutput(lines([success[0]]), 0), {
    code: "codex_failed",
  });
  assert.throws(
    () => parseCodexOutput(lines([...success, { type: "turn.failed" }]), 0),
    { code: "codex_failed" },
  );
  assert.throws(() => parseCodexOutput(lines(success), 1), {
    code: "codex_failed",
  });
});
test("browser SDK holds app tokens out of public session info and requires completed stream", async (t) => {
  const original = globalThis.fetch;
  t.after(() => (globalThis.fetch = original));
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(
      'event: text.delta\ndata: {"text":"partial"}\n\nevent: failed\ndata: {"code":"quota","message":"Limit reached"}\n\n',
    );
  };
  const session = new AISession({
    token: "test-only-bearer",
    provider: "fake",
    protocolVersion: 1,
  });
  assert.equal(JSON.stringify(session).includes("test-only-bearer"), false);
  await assert.rejects(
    session.generate({
      messages: [{ role: "user", content: "hi" }],
      requestId: "test-request",
    }),
    { code: "quota", requestId: "test-request" },
  );
  assert.equal(calls, 1);
  globalThis.fetch = async () =>
    new Response('event: text.delta\ndata: {"text":"partial"}\n\n');
  await assert.rejects(
    session.generate({ messages: [{ role: "user", content: "hi" }] }),
    { code: "outcome_unknown" },
  );
});
test("browser SDK returns a successful completed receipt and can recover status without replay", async (t) => {
  const original = globalThis.fetch;
  t.after(() => (globalThis.fetch = original));
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, method: options.method });
    if (url.endsWith("/v1/generate"))
      return new Response(
        'event: completed\ndata: {"output":"hello","requestId":"request-123","remaining":4}\n\n',
      );
    return Response.json({
      requestId: "request-123",
      status: "completed",
      result: { output: "hello" },
    });
  };
  const session = new AISession({ token: "test-only-bearer" });
  assert.equal(
    (
      await session.generate({
        messages: [{ role: "user", content: "hi" }],
        requestId: "request-123",
      })
    ).output,
    "hello",
  );
  assert.equal((await session.status("request-123")).result.output, "hello");
  assert.equal(
    requests.filter((r) => r.url.endsWith("/v1/generate")).length,
    1,
  );
  assert.equal(requests[1].method, "GET");
});
