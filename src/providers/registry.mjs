import { EventEmitter } from "node:events";
import { findCodex, generateCodex } from "./codex.mjs";
import { ChatGPTProvider } from "./chatgpt.mjs";
import { fail } from "../core/errors.mjs";

export class ProviderRegistry extends EventEmitter {
  constructor(vault, options) {
    super();
    this.vault = vault;
    this.codex = null;
    this.chatgpt = new ChatGPTProvider(vault, {
      ...options,
      onChange: () => this.emit("change"),
    });
  }
  async detect() {
    this.detected = await findCodex();
    if (this.vault.data.codexEnabled && this.detected?.ready)
      this.codex = this.detected;
    this.emit("change");
    return { available: !!this.detected, ready: !!this.detected?.ready };
  }
  async connectCodex() {
    if (!this.detected?.ready)
      fail(
        "codex_unavailable",
        "Sign in to your existing Codex installation, then check again.",
      );
    this.vault.data.codexEnabled = true;
    await this.vault.save();
    this.codex = this.detected;
    this.emit("change");
  }
  publicProfiles() {
    return [
      ...(this.codex
        ? [
            {
              id: "codex",
              name: "Existing Codex",
              provider: "codex",
              billing: "Your existing Codex access",
              model: "codex-default",
              models: [{ id: "codex-default", name: "Codex default" }],
              status: "ready",
              capabilities: ["text", "image", "structuredOutput"],
            },
          ]
        : []),
      ...this.vault.data.accounts.map((a) => ({
        id: a.id,
        name: `${a.email} · ${a.clientId.slice(-6)}`,
        provider: "chatgpt",
        billing: "Your ChatGPT plan",
        model: a.model,
        models: a.models || [],
        status:
          a.status === "signed_out"
            ? "signed_out"
            : a.model
              ? "ready"
              : "needs_models",
        capabilities: ["text", "image", "structuredOutput", "streaming"],
      })),
    ];
  }
  getPublic(id) {
    return this.publicProfiles().find((p) => p.id === id);
  }
  account(id) {
    const a = this.vault.data.accounts.find((a) => a.id === id);
    if (!a) fail("account_unknown", "This account no longer exists.");
    return a;
  }
  async signIn(id) {
    const account = await this.chatgpt.signIn(id);
    try {
      await this.chatgpt.models(account);
    } finally {
      this.emit("change");
    }
  }
  async refreshModels(id) {
    await this.chatgpt.models(this.account(id));
    this.emit("change");
  }
  async model(id, model) {
    const a = this.account(id);
    if (!a.models?.some((m) => m.id === model))
      fail("invalid_model", "Choose an available model.");
    a.model = model;
    await this.vault.save();
    this.emit("change");
  }
  async disconnect(id) {
    if (id === "codex") {
      this.vault.data.codexEnabled = false;
      await this.vault.save();
      this.codex = null;
      this.emit("change");
      return { confirmed: true };
    }
    const result = await this.chatgpt.signOut(this.account(id));
    this.emit("change");
    return result;
  }
  generate(id, request) {
    if (id === "codex" && this.codex)
      return generateCodex(this.codex.binary, request);
    const a = this.account(id);
    return this.chatgpt.generate(a, request);
  }
  close() {
    this.chatgpt.cancelSignIn();
  }
}
