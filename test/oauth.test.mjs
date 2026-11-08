import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, SignJWT } from "jose";
import {
  validateCallback,
  verifyIdentity,
  ChatGPTProvider,
} from "../src/providers/chatgpt.mjs";

test("OAuth rejects state mismatch, dynamic placeholder and returning client mismatch", () => {
  const make = (query) =>
    new URL(`http://127.0.0.1:5555/auth/callback?${query}`);
  assert.throws(
    () =>
      validateCallback(make("state=bad&code=ok&client_id=issued"), {
        state: "good",
      }),
    { code: "oauth_state" },
  );
  assert.throws(() =>
    validateCallback(
      make("state=good&code=ok&client_id=dynamic_agent_client"),
      { state: "good" },
    ),
  );
  assert.throws(() =>
    validateCallback(make("state=good&code=ok&client_id=other"), {
      state: "good",
      clientId: "issued",
    }),
  );
  assert.deepEqual(
    validateCallback(make("state=good&code=ok&client_id=issued"), {
      state: "good",
    }),
    { code: "ok", clientId: "issued" },
  );
});
test("ID token requires a valid signature, audience, issuer, nonce and plan scope", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwt = await new SignJWT({ nonce: "nonce", email: "test@example.test" })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer("https://auth.openai.com")
    .setAudience("issued")
    .setSubject("subject")
    .setExpirationTime("5m")
    .sign(privateKey);
  const tokens = {
    id_token: jwt,
    access_token: "fake",
    scope: "openid chatgpt.tokens.use.direct",
  };
  const identity = await verifyIdentity(
    tokens,
    { clientId: "issued", nonce: "nonce" },
    publicKey,
  );
  assert.equal(identity.subject, "subject");
  await assert.rejects(
    verifyIdentity(tokens, { clientId: "other", nonce: "nonce" }, publicKey),
  );
  await assert.rejects(
    verifyIdentity(tokens, { clientId: "issued", nonce: "wrong" }, publicKey),
    { code: "oauth_identity" },
  );
  await assert.rejects(
    verifyIdentity(
      { ...tokens, scope: "openid" },
      { clientId: "issued", nonce: "nonce" },
      publicKey,
    ),
    { code: "plan_permission_required" },
  );
});
test("rotating refreshes are serialized and latest token is atomically saved", async () => {
  let calls = 0,
    saves = 0;
  const account = {
    id: "test",
    clientId: "issued",
    refreshToken: "old",
    expiresAt: 0,
    scopes: ["chatgpt.tokens.use.direct"],
  };
  const vault = {
    data: { accounts: [account] },
    save: async () => {
      saves++;
    },
  };
  const provider = new ChatGPTProvider(vault, {
    fetcher: async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return Response.json({
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 3600,
        token_type: "Bearer",
      });
    },
  });
  const results = await Promise.all([
    provider.access(account),
    provider.access(account),
  ]);
  assert.deepEqual(results, ["new-access", "new-access"]);
  assert.equal(calls, 1);
  assert.equal(saves, 1);
  assert.equal(account.refreshToken, "new-refresh");
});
test("Responses requests never contain tools, stored state or generation retries; late errors fail", async () => {
  let body;
  const vault = { data: { accounts: [] } };
  const provider = new ChatGPTProvider(vault, {
    fetcher: async (_url, options) => {
      body = JSON.parse(options.body);
      return new Response(
        'data: {"type":"response.output_text.delta","delta":"partial"}\n\ndata: {"type":"response.failed"}\n\n',
      );
    },
  });
  const account = { accessToken: "fake", expiresAt: Date.now() + 3600000 };
  await assert.rejects(
    provider.generate(account, {
      messages: [{ role: "system", content: "hello" }],
      attachments: [],
      model: "test",
      signal: new AbortController().signal,
    }),
    { code: "inference_failed" },
  );
  assert.equal(body.store, false);
  assert.equal(body.stream, true);
  assert.equal(body.tools, undefined);
  assert.equal(body.input[0].role, "developer");
});
