import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { findCodex } from "./codex.mjs";
import { findClaude } from "./claude.mjs";
import { installClient } from "./client-install.mjs";
import { runClient } from "./cli-process.mjs";
import { ConnectorError, fail } from "../core/errors.mjs";

const authHosts = new Set([
  "auth.openai.com",
  "claude.ai",
  "platform.claude.com",
  "console.anthropic.com",
]);
export function loginURL(output) {
  for (const raw of output.match(/https:\/\/[^\s<>"\x1b]+/g) || []) {
    try {
      const url = new URL(raw);
      if (
        authHosts.has(url.hostname) &&
        !url.username &&
        !url.password &&
        (!url.port || url.port === "443") &&
        /\/(?:oauth\/)?authorize\/?$/.test(url.pathname)
      )
        return url.href;
    } catch {}
  }
}

export class ClientSetup {
  constructor({
    onChange = () => {},
    openExternal,
    detect,
    install = installClient,
    run = runClient,
  } = {}) {
    this.onChange = onChange;
    this.openExternal = openExternal;
    this.detect =
      detect ||
      ((provider) => (provider === "codex" ? findCodex() : findClaude()));
    this.install = install;
    this.run = run;
    this.state = null;
    this.controller = null;
  }
  cancel() {
    this.controller?.abort();
  }
  async cancelAndWait() {
    this.cancel();
    await this.finished;
  }
  async openLogin() {
    const url = this.state?.loginUrl;
    if (!url || loginURL(url) !== url)
      fail("sign_in_unavailable", "Start sign-in first.");
    await this.openExternal?.(url);
  }
  async connect(provider) {
    if (!["codex", "claude"].includes(provider))
      fail("invalid_provider", "Choose Codex or Claude.");
    if (this.controller)
      fail("setup_pending", "Finish or cancel the current setup first.", 409);
    const controller = (this.controller = new AbortController());
    let finish;
    this.finished = new Promise((resolve) => {
      finish = resolve;
    });
    const { signal } = controller;
    let expired = false;
    const timer = setTimeout(
      () => {
        expired = true;
        controller.abort();
      },
      20 * 60 * 1000,
    );
    const update = (stage, message) => {
      this.state = { provider, stage, message };
      this.onChange();
    };
    try {
      update("checking", "Checking installation…");
      let client = await this.detect(provider);
      signal.throwIfAborted();
      if (!client) {
        await this.install(provider, { signal, onStage: update });
        update("verifying", "Checking installation…");
        client = await this.detect(provider);
        if (!client)
          fail(
            "client_unavailable",
            "Installation finished but the client could not be found. Use the official setup instructions.",
          );
      }
      signal.throwIfAborted();
      if (!client.ready) {
        update("signing_in", "Finish signing in in your browser");
        const dir = await mkdtemp(join(tmpdir(), "bring-ai-signin-"));
        let output = "";
        try {
          const { code } = await this.run({
            binary: client.binary,
            args:
              provider === "codex"
                ? ["login"]
                : ["--safe-mode", "auth", "login"],
            cwd: dir,
            signal,
            onOutput: (chunk) => {
              output = (output + chunk).slice(-16000);
              const url = loginURL(output);
              if (url && this.state && !this.state.loginUrl) {
                this.state = { ...this.state, loginUrl: url };
                this.onChange();
              }
            },
          });
          if (code !== 0)
            fail("sign_in_failed", "Sign-in did not complete. Try again.");
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
        update("verifying", "Checking sign-in…");
        client = await this.detect(provider);
        if (!client?.ready)
          fail(
            "sign_in_failed",
            "This client is not signed in yet. Try again.",
          );
      }
      signal.throwIfAborted();
      return client;
    } catch (error) {
      if (signal.aborted)
        throw new ConnectorError(
          expired ? "setup_timed_out" : "setup_cancelled",
          expired
            ? "Setup timed out. Try again when you’re ready."
            : "Setup cancelled.",
          499,
        );
      throw error;
    } finally {
      clearTimeout(timer);
      this.controller = null;
      this.state = null;
      this.onChange();
      finish();
    }
  }
}
