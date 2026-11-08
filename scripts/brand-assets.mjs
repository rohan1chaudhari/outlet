import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// Self-contained SVGs: no web fonts, JavaScript, external assets or foreignObject.
const directory = fileURLToPath(new URL("../docs/brand/", import.meta.url));
const font = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const themes = {
  dark: {
    background: "#0d1117",
    ink: "#e6edf3",
    muted: "#8b949e",
    rule: "#30363d",
    grid: "#1b232d",
    accent: "#a5e1bd",
    panel: "#111820",
  },
  light: {
    background: "#f6f8fa",
    ink: "#1f2328",
    muted: "#59636e",
    rule: "#d1d9e0",
    grid: "#e8edf1",
    accent: "#176b43",
    panel: "#ffffff",
  },
};
function mark({ ink, accent }) {
  return `<g fill="none" stroke-width="7" stroke-linecap="square" stroke-linejoin="miter">
    <path stroke="${ink}" d="M34 24H18V104H34M94 24H110V104H94"/>
    <path stroke="${accent}" d="M46 84L84 46M58 46H84V72"/>
  </g>`;
}
function svg(width, height, title, description, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description"><title id="title">${title}</title><desc id="description">${description}</desc>${body}</svg>\n`;
}
function bannerBody(theme) {
  const c = themes[theme];
  const node = (x, title, detail, center = false) => `
    <rect x="${x}" y="310" width="304" height="90" rx="2" fill="${c.panel}" stroke="${center ? c.accent : c.rule}"/>
    <text x="${x + 22}" y="346" fill="${center ? c.accent : c.ink}" font-size="22">${title}</text>
    <text x="${x + 22}" y="376" fill="${c.muted}" font-size="16">${detail}</text>`;
  return `<defs>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="${c.grid}" stroke-width="0.6"/></pattern>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L7 5L2 9" fill="none" stroke="${c.muted}" stroke-width="1.6"/></marker>
  </defs>
  <rect width="1280" height="480" fill="${c.background}"/>
  <rect width="1280" height="480" fill="url(#grid)"/>
  <rect x="0.5" y="0.5" width="1279" height="479" fill="none" stroke="${c.rule}"/>
  <g font-family="${font}">
    <text x="64" y="38" fill="${c.muted}" font-size="13" letter-spacing="1.7">DESKTOP CONNECTOR / BROWSER SDK</text>
    <text x="1216" y="38" text-anchor="end" fill="${c.muted}" font-size="13" letter-spacing="1.4">OPEN SOURCE · ALPHA</text>
    <g transform="translate(54 66) scale(.76)">${mark(c)}</g>
    <text x="164" y="141" fill="${c.ink}" font-size="74" font-weight="600" letter-spacing="-4">Bring AI<tspan fill="${c.accent}">_</tspan></text>
    <text x="64" y="218" fill="${c.ink}" font-size="32" letter-spacing="-1">Local inference bridge for web apps.</text>
    <text x="64" y="255" fill="${c.muted}" font-size="18">Connect an account. Approve an origin. Request inference.</text>
    ${node(64, "web app", "prompt + context")}
    ${node(488, "127.0.0.1:4360", "permissioned connector", true)}
    ${node(912, "AI provider", "your connected account")}
    <g fill="none" stroke="${c.muted}" stroke-width="1.5" marker-start="url(#arrow)" marker-end="url(#arrow)"><path d="M390 355H466"/><path d="M814 355H890"/></g>
    <text x="64" y="448" fill="${c.muted}" font-size="16">Credentials stay on your computer. App tools stay on the server.</text>
    <path d="M1202 438H1216V424M50 424V438H64" fill="none" stroke="${c.rule}"/>
  </g>`;
}

await mkdir(directory, { recursive: true });
for (const [theme, colors] of Object.entries(themes)) {
  await writeFile(
    join(directory, `banner-${theme}.svg`),
    svg(
      1280,
      480,
      "Bring AI — local inference bridge for web apps",
      "An open-source desktop connector and browser SDK. Web apps exchange inference requests with a local permissioned connector and the user's connected AI provider. App tools remain on the server.",
      bannerBody(theme),
    ),
  );
  await writeFile(
    join(directory, `mark-${theme}.svg`),
    svg(
      128,
      128,
      "Bring AI",
      "Square brackets surrounding an upward-right connection arrow.",
      mark(colors),
    ),
  );
  await writeFile(
    join(directory, `wordmark-${theme}.svg`),
    svg(
      520,
      110,
      "Bring AI",
      "Bring AI wordmark and connection symbol.",
      `<g transform="translate(0 4) scale(.78)">${mark(colors)}</g><text x="120" y="77" fill="${colors.ink}" font-family="${font}" font-weight="600" font-size="64" letter-spacing="-3">Bring AI<tspan fill="${colors.accent}">_</tspan></text>`,
    ),
  );
}
await writeFile(
  join(directory, "social-preview.svg"),
  svg(
    1200,
    630,
    "Bring AI — local inference bridge for web apps",
    "Open-source desktop connector and browser SDK with per-origin approval.",
    `<rect width="1200" height="630" fill="${themes.dark.background}"/><svg x="0" y="90" width="1200" height="450" viewBox="0 0 1280 480">${bannerBody("dark")}</svg>`,
  ),
);
console.log("Brand SVGs written to docs/brand/.");
