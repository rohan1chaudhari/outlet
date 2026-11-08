const BASE = "http://127.0.0.1:4360";
export class AIConnectionError extends Error {
  constructor(code, message, requestId) {
    super(message);
    this.name = "AIConnectionError";
    this.code = code;
    this.requestId = requestId;
  }
}
async function call(path, { token, body, signal, method = "POST" } = {}) {
  let response;
  const deadline = AbortSignal.timeout(
    path === "/v1/generate" ? 135000 : 60000,
  );
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  try {
    response = await fetch(BASE + path, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: combined,
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new AIConnectionError(
      "connector_unreachable",
      "Open Bring AI on this computer and allow this site’s local network permission, then try again.",
    );
  }
  if (!response.ok) {
    let error;
    try {
      error = (await response.json()).error;
    } catch {}
    throw new AIConnectionError(
      error?.code || "connector_error",
      error?.message || "The connector could not complete this request.",
    );
  }
  return response;
}
const pause = (ms, signal) =>
  new Promise((resolve, reject) => {
    const done = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(done, ms);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
const base64url = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export async function isConnectorAvailable({ signal } = {}) {
  try {
    const response = await call("/v1/info", {
      method: "GET",
      signal: signal || AbortSignal.timeout(3000),
    });
    return (await response.json()).protocolVersion === 1;
  } catch {
    return false;
  }
}
export async function connectAI({
  name,
  purpose,
  requires = ["text"],
  onPairing,
  signal,
} = {}) {
  if (!globalThis.isSecureContext)
    throw new AIConnectionError(
      "insecure_context",
      "Serve this app over HTTPS, or localhost during development.",
    );
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ),
  );
  const pairing = await (
    await call("/v1/pairings", {
      body: { name, purpose, requires, codeChallenge: challenge },
      signal,
    })
  ).json();
  if (pairing.status === "pending")
    onPairing?.({
      verificationCode: pairing.verificationCode,
      approvalUrl: pairing.approvalUrl,
      expiresAt: pairing.expiresAt,
    });
  while (Date.now() < pairing.expiresAt) {
    const response = await call("/v1/pairings/exchange", {
      body: { pairingId: pairing.pairingId, codeVerifier: verifier },
      signal,
    });
    const receipt = await response.json();
    if (!receipt.pending) return new AISession(receipt);
    await pause(900, signal);
  }
  throw new AIConnectionError(
    "pairing_expired",
    "The request expired. Connect again.",
  );
}
export class AISession {
  #token;
  constructor(receipt) {
    this.#token = receipt.token;
    this.info = Object.freeze(
      Object.fromEntries(
        Object.entries(receipt).filter(([key]) => key !== "token"),
      ),
    );
  }
  async generate({
    messages,
    attachments = [],
    outputSchema,
    onText,
    signal,
    requestId = crypto.randomUUID(),
  }) {
    try {
      const response = await call("/v1/generate", {
        token: this.#token,
        body: {
          requestId,
          messages,
          attachments,
          ...(outputSchema ? { outputSchema } : {}),
        },
        signal,
      });
      const decoder = new TextDecoder();
      let buffer = "",
        completed;
      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        buffer = buffer.replace(/\r\n/g, "\n");
        if (buffer.length > 2000000)
          throw new AIConnectionError(
            "response_too_large",
            "Response frame exceeded the limit.",
            requestId,
          );
        let end;
        while ((end = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          let event = "",
            data = [];
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
          }
          if (!data.length) continue;
          const value = JSON.parse(data.join("\n"));
          if (event === "text.delta") onText?.(value.text);
          if (event === "failed")
            throw new AIConnectionError(value.code, value.message, requestId);
          if (event === "completed") completed = value;
        }
      }
      if (!completed)
        throw new AIConnectionError(
          "outcome_unknown",
          "The stream ended before completion. Check this request’s status before trying again.",
          requestId,
        );
      return completed;
    } catch (error) {
      if (error instanceof AIConnectionError) {
        error.requestId = requestId;
        throw error;
      }
      if (signal?.aborted) throw error;
      throw new AIConnectionError(
        "outcome_unknown",
        "The connection was interrupted. Check this request’s status before trying again.",
        requestId,
      );
    }
  }
  async status(requestId, { signal } = {}) {
    return (
      await call(`/v1/requests/${encodeURIComponent(requestId)}`, {
        method: "GET",
        token: this.#token,
        signal,
      })
    ).json();
  }
  async cancel(requestId) {
    await call(`/v1/requests/${encodeURIComponent(requestId)}`, {
      method: "DELETE",
      token: this.#token,
    });
  }
  async disconnect() {
    await call("/v1/session", { method: "DELETE", token: this.#token });
    this.#token = undefined;
  }
}
