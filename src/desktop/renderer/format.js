export const providerNames = {
  codex: "Codex",
  claude: "Claude",
  chatgpt: "ChatGPT",
};

// Show "meals.example.app" rather than "https://meals.example.app"; keep the
// scheme for plain HTTP so an insecure origin stays visible.
export function siteName(origin) {
  if (/^chrome-extension:\/\//.test(origin)) return "Chrome extension";
  try {
    const url = new URL(origin);
    return url.protocol === "https:" ? url.host : origin;
  } catch {
    return origin;
  }
}

export const modelName = (model) =>
  model.endsWith("-default") ? "Default model" : model;

export const clock = (time) =>
  new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// A Chrome extension has no host to show, so use the name it asked with and
// say plainly that it is an extension. Websites keep their host.
export const appName = (origin, name) =>
  /^chrome-extension:\/\//.test(origin) && name
    ? `${name} (Chrome extension)`
    : siteName(origin);

// Session choices in the approval dialog. Values must match the connector's
// SESSION_MINUTES and SESSION_REQUESTS.
export const sessionMinutes = [
  [15, "15 minutes"],
  [30, "30 minutes"],
  [60, "1 hour"],
  [1440, "1 day"],
  [10080, "7 days"],
];
export const sessionRequests = [5, 20, 100, 1000];
export const durationLabel = (minutes) =>
  sessionMinutes.find(([v]) => v === Number(minutes))?.[1] || `${minutes} minutes`;

// "until 4:05 PM" today, "until Nov 30, 4:05 PM" further out.
export const until = (time) =>
  time - Date.now() < 20 * 3600000
    ? clock(time)
    : new Date(time).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
