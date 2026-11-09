export const providerNames = {
  codex: "Codex",
  claude: "Claude",
  chatgpt: "ChatGPT",
};

// Show "meals.example.app" rather than "https://meals.example.app"; keep the
// scheme for plain HTTP so an insecure origin stays visible.
export function siteName(origin) {
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
