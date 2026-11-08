import test from "node:test";
import http from "node:http";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { ConnectorController } from "../src/core/controller.mjs";
import { createConnectorServer } from "../src/core/server.mjs";
import {
  checkSchema,
  generationInput,
  originOf,
} from "../src/core/validation.mjs";
import { sseEvents } from "../src/core/sse.mjs";

const origin = "https://example.test";
const profile = {
  id: "test",
  status: "ready",
  provider: "fake",
  billing: "test only",
  model: "fake",
  capabilities: ["text", "image", "structuredOutput", "streaming"],
};
function setup(
  t,
  generate = async () => ({ output: "hello", provider: "fake", toolCalls: 0 }),
) {
  let now = Date.now();
  const providers = {
    getPublic: () => profile,
    publicProfiles: () => [profile],
    generate,
  };
  const c = new ConnectorController({ providers, now: () => now });
  t.after(() => c.close());
  const pair = (site = origin, requires = ["text"]) => {
    const verifier = randomBytes(32).toString("base64url");
    const p = c.createPairing(site, {
      name: "Test app",
      purpose: "Test inference",
      requires,
      codeChallenge: createHash("sha256").update(verifier).digest("base64url"),
    });
    return { ...p, verifier, site };
  };
  const approve = (p) => {
    c.approve(p.pairingId, "test", { minutes: 15, requests: 5 });
    return c.exchange(p.site, {
      pairingId: p.pairingId,
      codeVerifier: p.verifier,
    });
  };
  return { c, pair, approve, advance: (ms) => (now += ms) };
}
const request = (id = "request-123") =>
  generationInput({
    requestId: id,
    messages: [{ role: "user", content: "hello" }],
  });
test("a website cannot grant its own access; native approval and proof are both required", (t) => {
  const { c, pair, approve } = setup(t);
  const p = pair();
  assert.deepEqual(
    c.exchange(origin, { pairingId: p.pairingId, codeVerifier: p.verifier }),
    { pending: true },
  );
  assert.throws(
    () =>
      c.exchange(origin, {
        pairingId: p.pairingId,
        codeVerifier: "x".repeat(43),
      }),
    { code: "invalid_pairing_proof" },
  );
  assert.throws(
    () =>
      c.exchange("https://other.test", {
        pairingId: p.pairingId,
        codeVerifier: p.verifier,
      }),
    { code: "invalid_pairing_proof" },
  );
  const s = approve(p);
  assert.equal(c.authenticate(origin, s.token).remaining, 5);
  assert.throws(() => c.authenticate("https://other.test", s.token), {
    code: "session_expired",
  });
  assert.equal(JSON.stringify(c.snapshot()).includes(s.token), false);
});
test("reconnecting an approved origin shares its budget; extra capabilities require approval", async (t) => {
  const { c, pair, approve } = setup(t);
  const s = approve(pair());
  const g = c.authenticate(origin, s.token);
  await c.generate(g, request(), null, () => {});
  const p2 = pair();
  assert.equal(p2.status, "approved");
  const s2 = c.exchange(origin, {
    pairingId: p2.pairingId,
    codeVerifier: p2.verifier,
  });
  assert.equal(s2.grantId, s.grantId);
  assert.equal(s2.remaining, 4);
  assert.equal(pair(origin, ["text", "image"]).status, "pending");
  assert.equal(pair("https://other.test").status, "pending");
});
test("expiry and revocation invalidate all app tokens", (t) => {
  const { c, pair, approve, advance } = setup(t);
  const s = approve(pair());
  advance(16 * 60000);
  assert.throws(() => c.authenticate(origin, s.token), {
    code: "session_expired",
  });
  const s2 = approve(pair("https://new.test"));
  c.revoke(s2.grantId);
  assert.throws(() => c.authenticate("https://new.test", s2.token), {
    code: "session_expired",
  });
});
test("request IDs prevent duplicate inference, status recovers the retained result", async (t) => {
  let calls = 0;
  const { c, pair, approve } = setup(t, async () => {
    calls++;
    return { output: "hello" };
  });
  const s = approve(pair());
  const g = c.authenticate(origin, s.token);
  await c.generate(g, request(), null, () => {});
  await assert.rejects(
    c.generate(g, request(), null, () => {}),
    { code: "request_already_submitted" },
  );
  assert.equal(calls, 1);
  assert.equal(c.requestStatus(g, "request-123").result.output, "hello");
});
test("revocation after body parsing cannot retain stale authority", async (t) => {
  const { c, pair, approve } = setup(t);
  const s = approve(pair());
  const g = c.authenticate(origin, s.token);
  c.revoke(g.id);
  await assert.rejects(
    c.generate(g, request(), null, () => {}),
    { code: "session_expired" },
  );
});
test("global concurrency, pause and revocation abort a running provider", async (t) => {
  let started;
  const ready = new Promise((r) => (started = r));
  const { c, pair, approve } = setup(
    t,
    (_id, { signal }) =>
      new Promise((resolve, reject) => {
        started();
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      }),
  );
  const s = approve(pair());
  const g = c.authenticate(origin, s.token);
  const events = [];
  const running = c.generate(g, request(), null, (e, d) => events.push([e, d]));
  await ready;
  await assert.rejects(
    c.generate(g, request("request-456"), null, () => {}),
    { code: "busy" },
  );
  c.pause(true);
  await running;
  assert.equal(events.at(-1)[0], "failed");
  assert.equal(c.requestStatus(g, "request-123").status, "cancelled");
  await assert.rejects(
    c.generate(g, request("request-789"), null, () => {}),
    { code: "paused" },
  );
});
test("capabilities cannot be escalated through a generation request", async (t) => {
  const { c, pair, approve } = setup(t);
  const s = approve(pair());
  const g = c.authenticate(origin, s.token);
  await assert.rejects(
    c.generate(
      g,
      { ...request(), attachments: [{ mime: "image/png", data: "YQ==" }] },
      null,
      () => {},
    ),
    { code: "permission_denied" },
  );
  await assert.rejects(
    c.generate(
      g,
      { ...request(), outputSchema: { type: "object" } },
      null,
      () => {},
    ),
    { code: "permission_denied" },
  );
});
test("invalid structured output fails without returning a completed receipt", async (t) => {
  const { c, pair, approve } = setup(t, async () => ({ output: { wrong: 1 } }));
  const s = approve(pair(origin, ["structuredOutput"]));
  const events = [];
  await c.generate(
    c.authenticate(origin, s.token),
    {
      ...request(),
      outputSchema: {
        type: "object",
        properties: { answer: { type: "string" } },
        required: ["answer"],
      },
    },
    null,
    (e) => events.push(e),
  );
  assert.equal(events.includes("completed"), false);
  assert.equal(events.at(-1), "failed");
});
test("only HTTPS and canonical loopback origins; no null or rebinding hosts", () => {
  for (const value of [
    "null",
    "http://evil.test",
    "https://example.test/path",
    "https://user:pass@example.test",
    "https://example.test/",
  ])
    assert.throws(() => originOf(value));
  assert.equal(originOf("https://example.test"), origin);
  assert.equal(originOf("http://127.0.0.1:4361"), "http://127.0.0.1:4361");
});
test("website cannot supply commands, local paths, provider endpoints or dangerous schemas", () => {
  for (const key of [
    "command",
    "cwd",
    "provider",
    "apiKey",
    "tools",
    "baseURL",
  ])
    assert.throws(() => generationInput({ ...request(), [key]: "untrusted" }));
  for (const extra of [
    { pattern: "(a+)+$" },
    { $ref: "file:///secret" },
    { oneOf: [{}, {}] },
  ])
    assert.throws(
      () =>
        checkSchema({
          type: "object",
          properties: { x: { type: "string", ...extra } },
        }),
      { code: "invalid_schema" },
    );
  assert.doesNotThrow(() =>
    checkSchema({
      type: "object",
      properties: { type: { type: "string" } },
      required: ["type"],
      additionalProperties: false,
    }),
  );
});
test("HTTP API exposes no approval route, validates host/origin, limits disclosure", async (t) => {
  const { c } = setup(t);
  const server = createConnectorServer(c);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  let r = await fetch(`${base}/v1/info`, { headers: { Origin: origin } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), origin);
  assert.equal(JSON.stringify(await r.json()).includes("fake"), false);
  assert.equal((await fetch(`${base}/v1/info`)).status, 403);
  assert.equal(
    await new Promise((resolve) => {
      http.get(
        `${base}/v1/info`,
        { headers: { Origin: origin, Host: "evil.test" } },
        (r) => {
          r.resume();
          resolve(r.statusCode);
        },
      );
    }),
    403,
  );
  assert.equal(
    (
      await fetch(`${base}/v1/approve`, {
        method: "POST",
        headers: { Origin: origin },
      })
    ).status,
    401,
  );
  r = await fetch(base, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Headers": "Authorization, Content-Type",
    },
  });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get("Access-Control-Allow-Credentials"), null);
});
test("SSE handles byte-split UTF-8, CRLF, and multiple data lines", async () => {
  const bytes = new TextEncoder().encode(
    'event: text.delta\r\ndata: {"text":"café"}\r\n\r\nevent: completed\ndata: {}\n\n',
  );
  async function* chunks() {
    for (const b of bytes) yield Uint8Array.of(b);
  }
  const events = [];
  for await (const e of sseEvents(chunks())) events.push(e);
  assert.equal(JSON.parse(events[0].data).text, "café");
  assert.equal(events[1].event, "completed");
});
