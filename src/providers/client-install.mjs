import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join, win32 } from "node:path";
import { tmpdir } from "node:os";
import { runClient } from "./cli-process.mjs";
import { ConnectorError, fail } from "../core/errors.mjs";

const vendors = {
  codex: {
    origin: "https://chatgpt.com",
    path: "/codex/install",
    download: "https://releases.openai.com/codex/install",
  },
  claude: {
    origin: "https://claude.ai",
    path: "/install",
    download: "https://downloads.claude.ai/claude-code-releases/bootstrap",
  },
};

export function installPlan(provider, platform = process.platform) {
  const vendor = vendors[provider];
  if (!vendor) fail("invalid_provider", "Choose Codex or Claude.");
  if (!["darwin", "linux", "win32"].includes(platform))
    fail(
      "unsupported_platform",
      "Automatic installation is unavailable on this system.",
    );
  const windows = platform === "win32";
  return {
    url: `${vendor.origin}${vendor.path}.${windows ? "ps1" : "sh"}`,
    extension: windows ? "ps1" : "sh",
    binary: windows
      ? win32.join(
          process.env.SystemRoot || "C:\\Windows",
          "System32",
          "WindowsPowerShell",
          "v1.0",
          "powershell.exe",
        )
      : provider === "codex"
        ? "/bin/sh"
        : "/bin/bash",
    args: (path) =>
      windows
        ? // Process-only policy; no machine/user policy or administrator access changes.
          [
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            path,
          ]
        : [path],
  };
}

export async function downloadInstaller(url, { signal, fetcher = fetch }) {
  // Only the exact official bootstrap and its vendor CDN endpoint are allowed.
  const allowed = Object.values(vendors)
    .flatMap((vendor) =>
      ["sh", "ps1"].map((extension) => [
        `${vendor.origin}${vendor.path}.${extension}`,
        `${vendor.download}.${extension}`,
      ]),
    )
    .find((pair) => pair[0] === url);
  if (!allowed) throw new Error("Unknown installer URL");
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
  let current = url;
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetcher(current, {
      signal: timeout,
      redirect: "manual",
      credentials: "omit",
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location) throw new Error("Missing installer redirect");
      current = new URL(location, current).href;
      if (!allowed.includes(current))
        throw new Error("Unexpected installer origin");
      continue;
    }
    if (!response.ok || !response.body)
      throw new Error("Installer download failed");
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > 1024 * 1024) throw new Error("Installer download too large");
      chunks.push(Buffer.from(chunk));
    }
    const script = Buffer.concat(chunks).toString("utf8");
    if (!script.trim() || /<\s*(?:!doctype|html)\b/i.test(script))
      throw new Error("Invalid installer download");
    return script;
  }
  throw new Error("Too many installer redirects");
}

export async function installClient(
  provider,
  { signal, onStage, fetcher, run = runClient, platform = process.platform },
) {
  const plan = installPlan(provider, platform);
  signal.throwIfAborted();
  const dir = await mkdtemp(join(tmpdir(), "bring-ai-install-"));
  try {
    onStage?.("downloading", "Downloading official installer…");
    const script = await downloadInstaller(plan.url, { signal, fetcher });
    signal.throwIfAborted();
    const path = join(dir, `install.${plan.extension}`);
    await writeFile(path, script, { mode: 0o600 });
    onStage?.(
      "installing",
      `Installing ${provider === "codex" ? "Codex" : "Claude"}…`,
    );
    const { code } = await run({
      binary: plan.binary,
      args: plan.args(path),
      cwd: dir,
      env: { ...process.env, CODEX_NON_INTERACTIVE: "1" },
      signal,
    });
    if (code !== 0) throw new Error("Installer failed");
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ConnectorError(
      "installation_failed",
      "Installation did not finish. Check your connection and try again, or use the official setup instructions.",
      503,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
