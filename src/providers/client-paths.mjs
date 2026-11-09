import { join, win32 } from "node:path";
import { homedir } from "node:os";

export function clientPaths(
  provider,
  { platform = process.platform, home = homedir(), env = process.env } = {},
) {
  const windows = platform === "win32";
  const path = windows ? win32 : { join };
  const name = `${provider}${windows ? ".exe" : ""}`;
  return [
    env[`BRING_AI_${provider.toUpperCase()}_BINARY`],
    path.join(home, ".local", "bin", name),
    ...(windows
      ? provider === "codex"
        ? [
            path.join(
              env.LOCALAPPDATA || path.join(home, "AppData", "Local"),
              "Programs",
              "OpenAI",
              "Codex",
              "bin",
              name,
            ),
          ]
        : []
      : [`/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`]),
    name,
  ].filter(Boolean);
}
