import { EventEmitter } from "node:events";
import { randomBytes, createHash, randomInt } from "node:crypto";
import { fail, publicError } from "./errors.mjs";
import { pairingInput, validateOutput } from "./validation.mjs";
import { RequestHistory } from "./history.mjs";

const hash = (value) => createHash("sha256").update(value).digest("base64url");
export class ConnectorController extends EventEmitter {
  constructor({ providers, now = Date.now, history = new RequestHistory() }) {
    super();
    this.providers = providers;
    this.now = now;
    this.history = history;
    this.pairings = new Map();
    this.grants = new Map();
    this.tokens = new Map();
    this.requests = new Map();
    this.rates = new Map();
    this.active = null;
    this.paused = false;
    this.cleanupTimer = setInterval(() => this.cleanup(), 15000);
    this.cleanupTimer.unref();
  }
  changed() {
    this.emit("change");
  }
  cleanup() {
    const now = this.now();
    for (const [id, p] of this.pairings)
      if (p.expiresAt <= now) this.pairings.delete(id);
    for (const grant of this.grants.values())
      if (grant.expiresAt <= now) this.revoke(grant.id, "expired");
    for (const [key, value] of this.rates)
      if (value.until <= now) this.rates.delete(key);
    for (const [id, request] of this.requests)
      if (request.status !== "running" && request.updatedAt + 120000 <= now)
        this.requests.delete(id);
  }
  createPairing(origin, input) {
    this.cleanup();
    const body = pairingInput(input);
    for (const p of this.pairings.values())
      if (p.origin === origin && p.codeChallenge === body.codeChallenge)
        return this.pairingReceipt(p);
    const rate = this.rates.get(origin);
    if (rate?.count >= 4 || this.pairings.size >= 24)
      fail(
        "rate_limited",
        "Too many connection requests. Try again shortly.",
        429,
      );
    this.rates.set(origin, {
      count: (rate?.count || 0) + 1,
      until: rate?.until || this.now() + 60000,
    });
    const existing = [...this.grants.values()].find(
      (g) =>
        g.origin === origin &&
        g.remaining > 0 &&
        g.expiresAt > this.now() &&
        body.requires.every((cap) => g.capabilities.includes(cap)),
    );
    const pairing = {
      ...body,
      id: randomBytes(24).toString("hex"),
      origin,
      verificationCode: String(randomInt(100000, 1000000)),
      expiresAt: this.now() + 180000,
      status: existing ? "approved" : "pending",
      grantId: existing?.id,
    };
    this.pairings.set(pairing.id, pairing);
    this.changed();
    return this.pairingReceipt(pairing);
  }
  pairingReceipt(p) {
    return {
      pairingId: p.id,
      verificationCode: p.verificationCode,
      expiresAt: p.expiresAt,
      status: p.status,
      approvalUrl: `bringai://pair/${p.id}`,
    };
  }
  // These methods are called only by the desktop IPC controller, never HTTP.
  approve(pairingId, profileId, { minutes = 30, requests = 20 } = {}) {
    const p = this.pairings.get(pairingId);
    this.requirePending(p);
    const profile = this.providers.getPublic(profileId);
    if (!profile || profile.status !== "ready")
      fail(
        "provider_required",
        "Connect an AI account before approving an app.",
      );
    if (p.requires.some((cap) => !profile.capabilities.includes(cap)))
      fail(
        "unsupported_capability",
        "This connection cannot provide everything the app requires.",
      );
    if (![15, 30, 60].includes(minutes) || ![5, 20, 100].includes(requests))
      fail("invalid_request", "Choose one of the available session limits.");
    const grant = {
      id: randomBytes(16).toString("hex"),
      origin: p.origin,
      name: p.name,
      purpose: p.purpose,
      profileId,
      model: profile.model,
      provider: profile.provider,
      billing: profile.billing,
      capabilities: p.requires,
      createdAt: this.now(),
      expiresAt: this.now() + minutes * 60000,
      remaining: requests,
      initialAllowance: requests,
    };
    this.grants.set(grant.id, grant);
    p.status = "approved";
    p.grantId = grant.id;
    this.changed();
    return grant.id;
  }
  requirePending(p) {
    if (!p || p.expiresAt <= this.now() || p.status !== "pending")
      fail("pairing_expired", "This connection request has expired.", 410);
  }
  deny(id) {
    const p = this.pairings.get(id);
    this.requirePending(p);
    p.status = "denied";
    this.changed();
  }
  exchange(origin, { pairingId, codeVerifier }) {
    const p = this.pairings.get(pairingId);
    if (!p || p.expiresAt <= this.now())
      fail(
        "pairing_expired",
        "Connection request expired. Connect again.",
        410,
      );
    if (p.origin !== origin || hash(codeVerifier) !== p.codeChallenge)
      fail(
        "invalid_pairing_proof",
        "The app could not prove this connection request.",
        403,
      );
    if (p.status === "denied")
      fail("permission_denied", "You declined this app in the connector.", 403);
    if (p.status === "pending") return { pending: true };
    const grant = this.grants.get(p.grantId);
    if (!grant || grant.expiresAt <= this.now())
      fail("session_expired", "The approved session has ended.", 401);
    if (!p.token) {
      p.token = randomBytes(32).toString("base64url");
      this.tokens.set(hash(p.token), grant.id);
    }
    return {
      token: p.token,
      grantId: grant.id,
      expiresAt: grant.expiresAt,
      remaining: grant.remaining,
      provider: grant.provider,
      billing: grant.billing,
      model: grant.model,
      capabilities: grant.capabilities,
      protocolVersion: 1,
    };
  }
  authenticate(origin, token) {
    const grant =
      typeof token === "string" &&
      this.grants.get(this.tokens.get(hash(token)));
    if (!grant || grant.origin !== origin || grant.expiresAt <= this.now())
      fail("session_expired", "Reconnect your AI to authorize this app.", 401);
    return grant;
  }
  async generate(grant, request, signal, emit) {
    // Admission happens after HTTP parsing, using the live grant again.
    if (!this.grants.has(grant.id) || grant.expiresAt <= this.now())
      fail("session_expired", "This app session has ended.", 401);
    if (this.paused)
      fail("paused", "AI access is paused in the desktop connector.", 423);
    if (this.active)
      fail(
        "busy",
        "Your AI is working on another request. Try again shortly.",
        409,
      );
    if (grant.remaining <= 0)
      fail(
        "allowance_exhausted",
        "This app has used its approved request allowance. Reconnect to ask for more.",
        429,
      );
    if (request.attachments.length && !grant.capabilities.includes("image"))
      fail("permission_denied", "This session does not allow images.", 403);
    if (
      request.outputSchema &&
      !grant.capabilities.includes("structuredOutput")
    )
      fail(
        "permission_denied",
        "This session does not allow structured output.",
        403,
      );
    const key = `${grant.id}:${request.requestId}`;
    if (this.requests.has(key))
      fail(
        "request_already_submitted",
        "This request was already submitted. Check its status instead of repeating inference.",
        409,
      );
    if (this.requests.size >= 128)
      fail(
        "busy",
        "The connector request history is full. Try again shortly.",
        429,
      );
    const controller = new AbortController();
    const record = {
      requestId: request.requestId,
      grantId: grant.id,
      origin: grant.origin,
      status: "running",
      updatedAt: this.now(),
      controller,
    };
    this.requests.set(key, record);
    record.historyId = this.history.start({
      origin: grant.origin,
      provider: grant.provider,
      model: grant.model,
      startedAt: record.updatedAt,
    });
    this.active = record;
    grant.remaining--;
    const stop = () => controller.abort();
    signal?.addEventListener("abort", stop, { once: true });
    if (signal?.aborted) controller.abort();
    const timeout = setTimeout(
      stop,
      Math.min(120000, Math.max(1, grant.expiresAt - this.now())),
    );
    this.changed();
    emit("started", {
      requestId: request.requestId,
      remaining: grant.remaining,
    });
    try {
      const result = await this.providers.generate(grant.profileId, {
        ...request,
        model: grant.model,
        signal: controller.signal,
        onText: (text) => emit("text.delta", { text }),
      });
      if (controller.signal.aborted || !this.grants.has(grant.id))
        fail("cancelled", "Generation was cancelled.", 499);
      validateOutput(request.outputSchema, result.output);
      if (JSON.stringify(result.output).length > 300000)
        fail(
          "response_too_large",
          "The model response exceeded the limit.",
          502,
        );
      const receipt = {
        ...result,
        requestId: request.requestId,
        remaining: grant.remaining,
        model: grant.model,
      };
      record.status = "completed";
      record.result = receipt;
      emit("completed", receipt);
      return receipt;
    } catch (error) {
      record.status = controller.signal.aborted ? "cancelled" : "failed";
      record.error = publicError(error);
      emit("failed", {
        ...record.error,
        requestId: request.requestId,
        remaining: grant.remaining,
      });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", stop);
      delete record.controller;
      record.updatedAt = this.now();
      this.history.finish(record.historyId, record.status, record.updatedAt);
      if (this.active === record) this.active = null;
      this.changed();
    }
  }
  requestStatus(grant, id) {
    const item = this.requests.get(`${grant.id}:${id}`);
    if (!item)
      fail(
        "request_unknown",
        "No retained result is available for this request.",
        404,
      );
    return {
      requestId: id,
      status: item.status,
      ...(item.result ? { result: item.result } : {}),
      ...(item.error ? { error: item.error } : {}),
    };
  }
  cancel(grant, id) {
    this.requests.get(`${grant.id}:${id}`)?.controller?.abort();
  }
  revoke(id, reason = "revoked") {
    this.grants.delete(id);
    for (const [key, value] of this.tokens)
      if (value === id) this.tokens.delete(key);
    for (const item of this.requests.values())
      if (item.grantId === id) item.controller?.abort();
    for (const p of this.pairings.values())
      if (p.grantId === id) {
        p.status = "denied";
        delete p.token;
      }
    this.changed();
  }
  revokeProfile(profileId) {
    for (const g of [...this.grants.values()])
      if (g.profileId === profileId) this.revoke(g.id);
  }
  pause(value) {
    this.paused = !!value;
    if (value) this.active?.controller?.abort();
    this.changed();
  }
  snapshot() {
    this.cleanup();
    return {
      paused: this.paused,
      profiles: this.providers.publicProfiles(),
      pairings: [...this.pairings.values()]
        .filter((p) => p.status === "pending")
        .map(
          ({
            id,
            name,
            purpose,
            origin,
            requires,
            verificationCode,
            expiresAt,
          }) => ({
            id,
            name,
            purpose,
            origin,
            requires,
            verificationCode,
            expiresAt,
          }),
        ),
      grants: [...this.grants.values()].map((g) => ({ ...g })),
      active: this.active
        ? { origin: this.active.origin, requestId: this.active.requestId }
        : null,
      activity: [...this.requests.values()]
        .slice(-20)
        .reverse()
        .map(({ requestId, origin, status, updatedAt }) => ({
          requestId,
          origin,
          status,
          updatedAt,
        })),
      history: this.history.snapshot(),
      historyError: this.history.error,
    };
  }
  close() {
    clearInterval(this.cleanupTimer);
    this.active?.controller?.abort();
    if (this.active)
      this.history.finish(this.active.historyId, "cancelled", this.now());
    this.tokens.clear();
    this.pairings.clear();
    this.grants.clear();
  }
}
