import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const app = process.argv.includes("--notes") ? "note-assistant" : "meal-log";
const port = app === "meal-log" ? 4361 : 4362;
const files = new Map([
  ["/", `examples/${app}/index.html`],
  ["/app.js", `examples/${app}/app.js`],
  ["/style.css", "examples/shared/style.css"],
  ["/sdk.js", "packages/browser/index.js"],
]);
const types = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
};
const server = http.createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  // The demo exposes only these four public files and this bounded context route.
  if (req.method === "GET" && req.url === "/api/context") {
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        app,
        source: "application server",
        instruction:
          app === "meal-log"
            ? "Estimate meal calories and protein conservatively. Return a short caveat. Do not provide medical advice."
            : "Rewrite the note into one concise summary and three concrete next steps. Do not invent facts.",
      }),
    );
  }
  const path = files.get(req.url);
  if (req.method !== "GET" || !path) {
    res.writeHead(404);
    return res.end("Not found");
  }
  try {
    res.setHeader("Content-Type", types[path.split(".").pop()]);
    res.end(await readFile(join(root, path)));
  } catch {
    res.writeHead(500);
    res.end("Demo file unavailable");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`${app}: http://127.0.0.1:${port}`),
);
process.on("SIGINT", () => server.close());
process.on("SIGTERM", () => server.close());
