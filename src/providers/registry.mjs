import { EventEmitter } from "node:events";
import { findCodex, generateCodex } from "./codex.mjs";
import { ChatGPTProvider } from "./chatgpt.mjs";
import { findClaude, generateClaude } from "./claude.mjs";
import { ClientSetup } from "./client-setup.mjs";
import { listCodexModels } from "./codex-models.mjs";
import { fail } from "../core/errors.mjs";

export class ProviderRegistry extends EventEmitter {
  constructor(vault, options) {
    super();
    this.vault = vault;
    this.codex = null;
    this.claude = null;
    this.clientStatus = {};
    this.clientModels = {
      codex: [{ id: "codex-default", name: "Default" }],
      claude: [
        { id: "claude-default", name: "Default" },
        { id: "sonnet", name: "Sonnet" },
        { id: "opus", name: "Opus" },
        { id: "haiku", name: "Haiku" },
        { id: "fable", name: "Fable" },
      ],
    };
    this.setup = new ClientSetup({
      openExternal: options?.openExternal,
      onChange: () => this.emit("change"),
    });
    this.chatgpt = new ChatGPTProvider(vault, {
      ...options,
      onChange: () => this.emit("change"),
    });
  }
  async detect() {
    [this.detected, this.detectedClaude] = await Promise.all([
      findCodex(),
      findClaude(),
    ]);
    this.clientStatus = {
      codex: { available: !!this.detected, ready: !!this.detected?.ready },
      claude: {
        available: !!this.detectedClaude,
        ready: !!this.detectedClaude?.ready,
      },
    };
    this.codex =
      this.vault.data.codexEnabled && this.detected?.ready
        ? this.detected
        : null;
    this.claude =
      this.vault.data.claudeEnabled && this.detectedClaude?.ready
        ? this.detectedClaude
        : null;
    if (this.detected?.ready) {
      try {
        this.clientModels.codex = [
          { id: "codex-default", name: "Default" },
          ...(await listCodexModels(this.detected.binary)),
        ];
      } catch {}
    }
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
  async connectClient(provider) {
    const client = await this.setup.connect(provider);
    this.vault.data[`${provider}Enabled`] = true;
    await this.vault.save();
    this[provider] = client;
    this.clientStatus[provider] = { available: true, ready: true };
    this.emit("change");
    await this.detect();
  }
  async clientModel(provider, model) {
    if (
      !["codex", "claude"].includes(provider) ||
      !this.clientModels[provider]?.some((m) => m.id === model)
    )
      fail("invalid_model", "Choose a model from the list.");
    this.vault.data[`${provider}Model`] =
      model === `${provider}-default` ? "" : model;
    await this.vault.save();
    this.emit("change");
  }
  publicProfiles() {
    return [
      ...(this.codex
        ? [
            {
              id: "codex",
              name: "Codex",
              provider: "codex",
              billing: "Your existing Codex access",
              model: this.vault.data.codexModel || "codex-default",
              models: this.clientModels.codex,
              status: "ready",
              capabilities: ["text", "image", "structuredOutput"],
            },
          ]
        : []),
      ...(this.claude
        ? [
            {
              id: "claude",
              name: "Claude",
              provider: "claude",
              billing: "Your existing Claude Code access",
              model: this.vault.data.claudeModel || "claude-default",
              models: this.clientModels.claude,
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
    if (id === "claude") {
      this.vault.data.claudeEnabled = false;
      await this.vault.save();
      this.claude = null;
      this.emit("change");
      return { confirmed: true };
    }
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
    if (id === "claude" && this.claude)
      return generateClaude(this.claude.binary, request);
    const a = this.account(id);
    return this.chatgpt.generate(a, request);
  }
  close() {
    this.setup.cancel();
    this.chatgpt.cancelSignIn();
  }
}
