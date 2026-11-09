import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

// Read the installed client's catalog without creating a thread or running tools.
export function listCodexModels(binary) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      binary,
      ["--no-daemon", "app-server", "--listen", "stdio://"],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
    );
    const lines = createInterface({ input: child.stdout });
    let settled = false,
      models = [],
      bytes = 0;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      lines.close();
      child.stdin.end();
      child.kill();
      error ? reject(error) : resolve(models);
    };
    const timer = setTimeout(
      () => finish(new Error("Model catalog unavailable")),
      8000,
    );
    child.stderr.resume();
    child.stdin.on("error", () => {});
    child.on("error", finish);
    child.on("close", () => {
      if (!settled) finish(new Error("Model catalog unavailable"));
    });
    const send = (value) => child.stdin.write(JSON.stringify(value) + "\n");
    lines.on("line", (line) => {
      bytes += Buffer.byteLength(line);
      if (bytes > 1000000) return finish(new Error("Model catalog too large"));
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      if (event.id === 0) {
        if (event.error) return finish(new Error("Model catalog unavailable"));
        send({ method: "initialized", params: {} });
        send({
          id: 1,
          method: "model/list",
          params: { limit: 50, includeHidden: false },
        });
      }
      if (event.id === 1) {
        if (event.error || !Array.isArray(event.result?.data))
          return finish(new Error("Model catalog unavailable"));
        models.push(
          ...event.result.data
            .filter((m) => typeof m.model === "string" && !m.hidden)
            .map((m) => ({ id: m.model, name: m.displayName || m.model })),
        );
        const cursor = event.result.nextCursor;
        if (cursor && models.length < 200)
          send({
            id: 1,
            method: "model/list",
            params: { limit: 50, includeHidden: false, cursor },
          });
        else finish();
      }
    });
    send({
      id: 0,
      method: "initialize",
      params: {
        clientInfo: { name: "bring_ai", title: "Bring AI", version: "0.1.0" },
      },
    });
  });
}
