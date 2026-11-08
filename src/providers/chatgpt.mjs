import http from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { ConnectorError, fail } from "../core/errors.mjs";
import { sseEvents } from "../core/sse.mjs";

const AUTH = "https://auth.openai.com";
const TOKEN = `${AUTH}/api/accounts/oauth/token`;
const RESOURCE = "https://api.openai.com/v1";
const random = () => randomBytes(32).toString("base64url");
const sha = (value) => createHash("sha256").update(value).digest("base64url");
const scopes =
  "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";

export function validateCallback(url, pending) {
  if (
    url.pathname !== "/auth/callback" ||
    url.searchParams.get("state") !== pending.state
  )
    fail("oauth_state", "The sign-in callback could not be verified.", 403);
  if (url.searchParams.has("error"))
    fail("oauth_declined", "Sign-in was cancelled or permission was declined.");
  const issued = url.searchParams.get("client_id") || pending.clientId;
  if (
    !issued ||
    issued === "dynamic_agent_client" ||
    (pending.clientId && issued !== pending.clientId) ||
    !url.searchParams.get("code")
  )
    fail(
      "oauth_client",
      "The sign-in registration is incomplete or does not match.",
      403,
    );
  return { clientId: issued, code: url.searchParams.get("code") };
}
export async function verifyIdentity(
  tokens,
  { clientId, nonce, expected },
  jwks,
  issuer = AUTH,
) {
  if (
    typeof tokens.id_token !== "string" ||
    typeof tokens.access_token !== "string" ||
    !tokens.scope?.split(" ").includes("chatgpt.tokens.use.direct")
  )
    fail(
      "plan_permission_required",
      "Sign in again and allow ChatGPT plan usage.",
    );
  const { payload } = await jwtVerify(tokens.id_token, jwks, {
    issuer,
    audience: clientId,
    algorithms: ["RS256", "ES256"],
    requiredClaims: ["exp", "sub", "nonce"],
  });
  if (
    payload.nonce !== nonce ||
    !payload.sub ||
    (expected &&
      (payload.sub !== expected.subject ||
        payload.iss !== expected.issuer ||
        clientId !== expected.clientId))
  )
    fail(
      "oauth_identity",
      "The signed-in account did not match the selected account.",
      403,
    );
  return {
    issuer: payload.iss,
    subject: payload.sub,
    email:
      typeof payload.email === "string" ? payload.email : "ChatGPT account",
  };
}

export class ChatGPTProvider {
  constructor(
    vault,
    { fetcher = fetch, openExternal, onChange = () => {} } = {},
  ) {
    this.vault = vault;
    this.fetch = fetcher;
    this.openExternal = openExternal;
    this.onChange = onChange;
    this.refreshes = new Map();
    this.pending = null;
  }
  async discovery() {
    if (!this.metadata) {
      const response = await this.fetch(
        `${AUTH}/.well-known/openid-configuration`,
        { signal: AbortSignal.timeout(15000) },
      );
      if (!response.ok)
        fail(
          "oauth_unavailable",
          "ChatGPT sign-in is temporarily unavailable.",
          503,
        );
      const meta = await response.json();
      if (meta.issuer !== AUTH || new URL(meta.jwks_uri).origin !== AUTH)
        fail("oauth_metadata", "Unexpected sign-in metadata.", 502);
      this.metadata = meta;
      this.jwks = createRemoteJWKSet(new URL(meta.jwks_uri));
    }
    return this.metadata;
  }
  async token(form) {
    const response = await this.fetch(TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    if (!response.ok)
      throw new ConnectorError(
        result.error === "invalid_grant"
          ? "sign_in_required"
          : "oauth_unavailable",
        result.error === "invalid_grant"
          ? "This session has ended. Sign in again."
          : "ChatGPT sign-in could not be completed. Try again shortly.",
        response.status === 400 ? 401 : 503,
      );
    if (
      !result.access_token ||
      result.token_type?.toLowerCase() !== "bearer" ||
      !Number.isFinite(result.expires_in) ||
      result.expires_in <= 0
    )
      fail("invalid_tokens", "The provider returned an invalid session.", 502);
    return result;
  }
  mergeTokens(account, tokens) {
    return {
      ...account,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || account.refreshToken,
      idToken: tokens.id_token || account.idToken,
      scopes: tokens.scope ? tokens.scope.split(" ") : account.scopes,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      earliestRefreshAt: tokens.earliest_refresh_at
        ? Number(tokens.earliest_refresh_at) * 1000
        : 0,
      status: "ready",
    };
  }
  async signIn(accountId) {
    if (this.pending)
      fail("sign_in_busy", "Finish or cancel the current sign-in first.", 409);
    const expected = accountId
      ? this.vault.data.accounts.find((a) => a.id === accountId)
      : undefined;
    if (accountId && !expected)
      fail("account_unknown", "This saved account no longer exists.");
    await this.vault.save();
    await this.discovery();
    const state = random(),
      nonce = random(),
      verifier = random();
    const pending = { state, nonce, clientId: expected?.clientId };
    const server = http.createServer();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const redirect = `http://127.0.0.1:${server.address().port}/auth/callback`;
    const authorization = new URL(`${AUTH}/api/accounts/authorize`);
    const params = {
      client_id: expected?.clientId || "dynamic_agent_client",
      ext_agent_host_id: this.vault.data.hostId,
      response_type: "code",
      redirect_uri: redirect,
      scope: scopes,
      resource: RESOURCE,
      state,
      nonce,
      code_challenge_method: "S256",
      code_challenge: sha(verifier),
    };
    if (!expected) params.agent_name_hint = "Bring AI";
    if (expected?.idToken) params.id_token_hint = expected.idToken;
    if (expected?.email) params.login_hint = expected.email;
    authorization.search = new URLSearchParams(params).toString();
    return await new Promise((resolve, reject) => {
      let done = false,
        handling = false;
      const finish = (error, value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        server.close();
        server.closeAllConnections();
        this.pending = null;
        this.onChange();
        error ? reject(error) : resolve(value);
      };
      const timer = setTimeout(
        () =>
          finish(
            new ConnectorError(
              "oauth_timeout",
              "Sign-in timed out. Try again.",
            ),
          ),
        600000,
      );
      this.pending = {
        cancel: () =>
          finish(new ConnectorError("oauth_cancelled", "Sign-in cancelled.")),
      };
      this.onChange();
      server.on("request", async (req, res) => {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader(
          "Content-Security-Policy",
          "default-src 'none'; style-src 'unsafe-inline'",
        );
        res.setHeader("Referrer-Policy", "no-referrer");
        if (
          req.headers.host !== `127.0.0.1:${server.address()?.port}` ||
          req.method !== "GET" ||
          handling
        ) {
          res.writeHead(400);
          return res.end("Invalid sign-in callback.");
        }
        let callback;
        try {
          callback = validateCallback(new URL(req.url, redirect), pending);
        } catch (e) {
          res.writeHead(400);
          res.end("Sign-in could not be verified. Return to Bring AI.");
          if (e.code !== "oauth_state") finish(e);
          return;
        }
        handling = true;
        try {
          const tokens = await this.token({
            grant_type: "authorization_code",
            client_id: callback.clientId,
            code: callback.code,
            code_verifier: verifier,
            redirect_uri: redirect,
            resource: RESOURCE,
          });
          const identity = await verifyIdentity(
            tokens,
            { clientId: callback.clientId, nonce, expected },
            this.jwks,
          );
          if (done) {
            res.end("This sign-in attempt has ended.");
            return;
          }
          const prior =
            expected ||
            this.vault.data.accounts.find(
              (a) =>
                a.clientId === callback.clientId &&
                a.subject === identity.subject &&
                a.issuer === identity.issuer,
            );
          const account = this.mergeTokens(
            {
              ...prior,
              ...identity,
              id: prior?.id || random(),
              clientId: callback.clientId,
              models: prior?.models || [],
              model: prior?.model,
            },
            tokens,
          );
          this.vault.data.accounts = this.vault.data.accounts
            .filter((a) => a.id !== account.id)
            .concat(account);
          await this.vault.save();
          res.end(
            '<!doctype html><title>Connected · Bring AI</title><body style="font:18px system-ui;padding:64px"><h1>You’re connected.</h1><p>Return to Bring AI. You can close this tab.</p>',
          );
          // Finish after the callback page is flushed.
          setImmediate(() => finish(null, account));
        } catch (e) {
          res.writeHead(400);
          res.end(
            "Sign-in could not be completed. Return to Bring AI for details.",
          );
          setImmediate(() => finish(e));
        }
      });
      this.openExternal(authorization.href).catch(() =>
        finish(
          new ConnectorError(
            "browser_unavailable",
            "Could not open the system browser. Try again.",
          ),
        ),
      );
    });
  }
  cancelSignIn() {
    this.pending?.cancel();
  }
  async access(account) {
    if (account.status === "signed_out")
      fail("sign_in_required", "Sign in to this account again.", 401);
    if (account.expiresAt > Date.now() + 60000) return account.accessToken;
    if (!this.refreshes.has(account.id)) {
      const task = (async () => {
        if (!account.refreshToken)
          fail("sign_in_required", "Sign in to this account again.", 401);
        if (account.earliestRefreshAt > Date.now())
          fail(
            "refresh_pending",
            "The provider has asked this session to wait before refreshing.",
            503,
          );
        try {
          const tokens = await this.token({
            grant_type: "refresh_token",
            client_id: account.clientId,
            refresh_token: account.refreshToken,
            resource: RESOURCE,
          });
          const next = this.mergeTokens(account, tokens);
          if (!next.scopes?.includes("chatgpt.tokens.use.direct"))
            fail(
              "sign_in_required",
              "ChatGPT plan permission is no longer enabled.",
              401,
            );
          Object.assign(account, next);
          await this.vault.save();
          return account.accessToken;
        } catch (e) {
          if (e.code === "sign_in_required") {
            account.status = "signed_out";
            delete account.accessToken;
            delete account.refreshToken;
            await this.vault.save();
            this.onChange();
          }
          throw e;
        }
      })().finally(() => this.refreshes.delete(account.id));
      this.refreshes.set(account.id, task);
    }
    return this.refreshes.get(account.id);
  }
  async models(account) {
    const token = await this.access(account);
    const response = await this.fetch(`${RESOURCE}/models`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      fail(
        "model_catalog_unavailable",
        "Could not load models for this account. Check its ChatGPT plan access.",
        502,
      );
    const result = await response.json();
    const models = (result.models || [])
      .filter((m) => m.visibility === "list" && typeof m.slug === "string")
      .map((m) => ({ id: m.slug, name: m.display_name || m.slug }));
    if (!models.length)
      fail("no_models", "This account has no available models.", 503);
    account.models = models;
    if (!models.some((m) => m.id === account.model))
      account.model = models[0].id;
    await this.vault.save();
    return models;
  }
  async generate(
    account,
    { messages, attachments, outputSchema, model, signal, onText },
  ) {
    const token = await this.access(account);
    const input = messages.map((m) => ({
      role: m.role === "system" ? "developer" : m.role,
      content: m.content,
    }));
    if (attachments.length) {
      const index = input.findLastIndex((m) => m.role === "user");
      if (index === -1) fail("invalid_request", "Images need a user message.");
      input[index].content = [
        { type: "input_text", text: input[index].content },
        ...attachments.map((a) => ({
          type: "input_image",
          image_url: `data:${a.mime};base64,${a.data}`,
        })),
      ];
    }
    const body = {
      model,
      input,
      store: false,
      stream: true,
      ...(outputSchema
        ? {
            text: {
              format: {
                type: "json_schema",
                name: "app_response",
                schema: outputSchema,
                strict: false,
              },
            },
          }
        : {}),
    };
    const response = await this.fetch(`${RESOURCE}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok)
      fail(
        "inference_unavailable",
        response.status === 429
          ? "Your ChatGPT usage limit has been reached. Check ChatGPT Settings → Usage."
          : "ChatGPT could not accept this request. Check the connection and model.",
        response.status === 429 ? 429 : 502,
      );
    let text = "",
      completed = false,
      usage;
    for await (const frame of sseEvents(response.body)) {
      if (frame.data === "[DONE]") continue;
      const event = JSON.parse(frame.data);
      if (event.type === "response.output_text.delta") {
        text += event.delta;
        onText?.(event.delta);
        if (text.length > 300000)
          fail("response_too_large", "The response exceeded the limit.", 502);
      }
      if (
        ["error", "response.failed", "response.incomplete"].includes(event.type)
      )
        fail(
          "inference_failed",
          "ChatGPT did not complete this request. Check plan usage or try a shorter prompt.",
          502,
        );
      if (event.type === "response.completed") {
        completed = true;
        usage = event.response?.usage;
      }
    }
    if (!completed)
      fail(
        "interrupted",
        "The response stream ended before completion. Check request status before trying again.",
        502,
      );
    try {
      return {
        output: outputSchema ? JSON.parse(text) : text,
        provider: "chatgpt",
        toolCalls: 0,
        usage,
      };
    } catch {
      fail("invalid_model_output", "The model returned invalid JSON.", 502);
    }
  }
  async signOut(account) {
    // Serialize with an in-flight rotating-token refresh.
    await this.refreshes.get(account.id)?.catch(() => {});
    let confirmed = false;
    if (account.refreshToken)
      try {
        const meta = await this.discovery();
        if (new URL(meta.revocation_endpoint).origin !== AUTH)
          throw new Error();
        const res = await this.fetch(meta.revocation_endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            token: account.refreshToken,
            token_type_hint: "refresh_token",
            client_id: account.clientId,
          }),
          signal: AbortSignal.timeout(15000),
        });
        confirmed = res.ok;
      } catch {}
    delete account.accessToken;
    delete account.refreshToken;
    delete account.idToken;
    account.status = "signed_out";
    await this.vault.save();
    return { confirmed };
  }
}
