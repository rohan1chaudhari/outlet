import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { ClientSetup, loginURL } from "../src/providers/client-setup.mjs";
import {
  installClient,
  installPlan,
  downloadInstaller,
} from "../src/providers/client-install.mjs";
import { clientPaths } from "../src/providers/client-paths.mjs";
import { runClient } from "../src/providers/cli-process.mjs";

for (const provider of ["codex", "claude"]) {
  test(`${provider} setup installs a missing client, signs in, then verifies authentication`, async () => {
    let installed = false,
      ready = false,
      installs = 0,
      logins = 0;
    const stages = [];
    const setup = new ClientSetup({
      detect: async () =>
        installed ? { binary: "fixture-client", ready } : null,
      install: async (id, { onStage }) => {
        assert.equal(id, provider);
        onStage("downloading", "download");
        onStage("installing", "install");
        installed = true;
        installs++;
      },
      run: async ({ binary, args, cwd, onOutput }) => {
        assert.equal(binary, "fixture-client");
        assert.deepEqual(
          args,
          provider === "codex" ? ["login"] : ["--safe-mode", "auth", "login"],
        );
        await access(cwd);
        const host = provider === "codex" ? "auth.openai.com" : "claude.ai";
        onOutput(`Open https://${host}/oauth/authorize?state=fixture`);
        assert.ok(setup.state.loginUrl);
        ready = true;
        logins++;
        return { code: 0 };
      },
      onChange: () => stages.push(setup.state?.stage),
    });
    assert.equal((await setup.connect(provider)).ready, true);
    assert.equal(installs, 1);
    assert.equal(logins, 1);
    assert.ok(stages.includes("installing"));
    assert.ok(stages.includes("signing_in"));
    assert.equal(setup.state, null);
    // Reconnection reuses the installed, signed-in client.
    await setup.connect(provider);
    assert.equal(installs, 1);
    assert.equal(logins, 1);
  });
}

test("setup cancellation aborts installation, prevents parallel setup, and permits retry", async () => {
  let cancelled = false;
  const setup = new ClientSetup({
    detect: async () => null,
    install: async (_, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            cancelled = true;
            reject(signal.reason);
          },
          { once: true },
        );
      }),
  });
  const pending = setup.connect("codex");
  const rejected = assert.rejects(pending, { code: "setup_cancelled" });
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(setup.connect("claude"), { code: "setup_pending" });
  await setup.cancelAndWait();
  await rejected;
  assert.equal(cancelled, true);
  setup.detect = async () => ({ binary: "fixture", ready: true });
  assert.equal((await setup.connect("codex")).ready, true);
});

test("failed installation and unsuccessful sign-in never produce a connected client", async () => {
  let logins = 0;
  const setup = new ClientSetup({
    detect: async () => null,
    install: async () => {
      throw new Error("fixture download failed");
    },
    run: async () => {
      logins++;
    },
  });
  await assert.rejects(setup.connect("codex"), /download failed/);
  assert.equal(logins, 0);
  setup.detect = async () => ({ binary: "fixture", ready: false });
  setup.run = async () => ({ code: 1 });
  await assert.rejects(setup.connect("codex"), { code: "sign_in_failed" });
  setup.run = async () => ({ code: 0 });
  await assert.rejects(setup.connect("codex"), { code: "sign_in_failed" });
  assert.equal(setup.state, null);
});

test("installer uses fixed vendor URLs and private temporary scripts, and cleans up failures", async () => {
  assert.equal(
    installPlan("codex", "darwin").url,
    "https://chatgpt.com/codex/install.sh",
  );
  assert.equal(
    installPlan("claude", "win32").url,
    "https://claude.ai/install.ps1",
  );
  assert.throws(() => installPlan("bash", "darwin"), {
    code: "invalid_provider",
  });
  assert.throws(() => installPlan("claude", "freebsd"), {
    code: "unsupported_platform",
  });
  let file;
  const script = "#!/bin/sh\n# fixture, never executed\n";
  await assert.rejects(
    installClient("codex", {
      signal: new AbortController().signal,
      platform: "darwin",
      fetcher: async (url, options) => {
        assert.equal(url, "https://chatgpt.com/codex/install.sh");
        assert.equal(options.redirect, "manual");
        return new Response(script);
      },
      run: async ({ binary, args, env }) => {
        assert.equal(binary, "/bin/sh");
        file = args[0];
        assert.equal(await readFile(file, "utf8"), script);
        assert.equal(env.CODEX_NON_INTERACTIVE, "1");
        return { code: 1 };
      },
    }),
    { code: "installation_failed" },
  );
  await assert.rejects(access(file), { code: "ENOENT" });
});

test("installer rejects cross-origin redirects, oversized responses and HTML error pages", async () => {
  const signal = new AbortController().signal;
  const url = "https://claude.ai/install.sh";
  for (const response of [
    new Response(null, {
      status: 302,
      headers: { location: "https://evil.example/install" },
    }),
    new Response("x".repeat(1024 * 1024 + 1)),
    new Response("<!doctype html><html>unavailable</html>"),
  ])
    await assert.rejects(
      downloadInstaller(url, { signal, fetcher: async () => response }),
    );
});

test("installer follows only the selected provider's exact official CDN redirect", async () => {
  const signal = new AbortController().signal;
  let calls = 0;
  const script = await downloadInstaller(
    "https://chatgpt.com/codex/install.sh",
    {
      signal,
      fetcher: async (url) => {
        calls++;
        if (calls === 1)
          return new Response(null, {
            status: 302,
            headers: {
              location: "https://releases.openai.com/codex/install.sh",
            },
          });
        assert.equal(url, "https://releases.openai.com/codex/install.sh");
        return new Response("#!/bin/sh\n# fixture");
      },
    },
  );
  assert.match(script, /^#!/);
  await assert.rejects(
    downloadInstaller("https://claude.ai/install.sh", {
      signal,
      fetcher: async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://releases.openai.com/codex/install.sh" },
        }),
    }),
  );
});

test("only provider authorization URLs can be reopened from setup", async () => {
  assert.equal(loginURL("https://evil.example/oauth/authorize"), undefined);
  assert.equal(
    loginURL("https://auth.openai.com.evil.example/oauth/authorize"),
    undefined,
  );
  assert.equal(loginURL("https://auth.openai.com/logout"), undefined);
  assert.equal(
    loginURL("https://user:password@claude.ai/oauth/authorize"),
    undefined,
  );
  let opened;
  const setup = new ClientSetup({
    openExternal: async (url) => {
      opened = url;
    },
  });
  await assert.rejects(setup.openLogin(), { code: "sign_in_unavailable" });
  setup.state = {
    loginUrl: "https://auth.openai.com/oauth/authorize?state=fixture",
  };
  await setup.openLogin();
  assert.equal(opened, setup.state.loginUrl);
});

test("native install paths are detected without depending on a GUI process's PATH", () => {
  const paths = clientPaths("codex", {
    platform: "win32",
    home: "C:\\Users\\Tester",
    env: { LOCALAPPDATA: "C:\\Users\\Tester\\AppData\\Local" },
  });
  assert.ok(
    paths.includes(
      "C:\\Users\\Tester\\AppData\\Local\\Programs\\OpenAI\\Codex\\bin\\codex.exe",
    ),
  );
  assert.ok(
    clientPaths("claude", {
      platform: "win32",
      home: "C:\\Users\\Tester",
      env: {},
    }).includes("C:\\Users\\Tester\\.local\\bin\\claude.exe"),
  );
});

test("cancelling a running native client waits for its process to exit", async () => {
  const controller = new AbortController();
  const pending = runClient({
    binary: process.execPath,
    args: ["-e", "console.log('ready');setInterval(()=>{},1000)"],
    signal: controller.signal,
    onOutput: () => controller.abort(),
  });
  await assert.rejects(pending, { code: "cancelled" });
});
