import { spawn, execFile } from "node:child_process";
import { win32 } from "node:path";
import { ConnectorError } from "../core/errors.mjs";

// Only fixed native adapter arguments reach this runner, never website commands.
export function runClient({
  binary,
  args,
  cwd,
  input = "",
  env = process.env,
  onOutput,
  signal,
  limit = 4 * 1024 * 1024,
}) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
      windowsHide: true,
    });
    let stdout = "",
      diagnostic = "",
      size = 0,
      stopped,
      killTimer;
    const kill = (name) => {
      try {
        if (process.platform !== "win32") process.kill(-child.pid, name);
        else if (child.pid)
          execFile(
            win32.join(
              process.env.SystemRoot || "C:\\Windows",
              "System32",
              "taskkill.exe",
            ),
            ["/PID", String(child.pid), "/T", "/F"],
            { windowsHide: true },
            () => {},
          );
      } catch {}
    };
    const stop = (error) => {
      if (stopped) return;
      stopped =
        error || new ConnectorError("cancelled", "Request cancelled.", 499);
      kill("SIGTERM");
      killTimer = setTimeout(() => kill("SIGKILL"), 1500);
      killTimer.unref();
    };
    const abort = () => stop();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      onOutput?.(chunk);
      size += Buffer.byteLength(chunk);
      if (size > limit)
        stop(
          new ConnectorError(
            "response_too_large",
            "The client response exceeded the limit.",
            502,
          ),
        );
      else stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      onOutput?.(chunk);
      if (diagnostic.length < 4000) diagnostic += chunk;
    });
    child.stdin.on("error", () => {});
    child.once("error", () => {
      signal.removeEventListener("abort", abort);
      reject(
        new ConnectorError(
          "client_unavailable",
          "The client could not start. Check its installation.",
          503,
        ),
      );
    });
    child.once("close", (code) => {
      clearTimeout(killTimer);
      signal.removeEventListener("abort", abort);
      if (stopped) reject(stopped);
      else resolve({ code, stdout, diagnostic });
    });
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    child.stdin.end(input);
  });
}
