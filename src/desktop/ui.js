const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let current;
async function action(name, input) {
  const response = await window.bringAI.action(name, input);
  if (!response.ok) {
    $("notice").textContent =
      response.error?.message || "Something went wrong.";
    $("notice").hidden = false;
  }
  return response;
}
function render(state) {
  current = state;
  $("service-status").textContent = state.startupError
    ? "Connector unavailable"
    : state.paused
      ? "Access paused"
      : "Connector is running";
  if (state.startupError) {
    $("notice").textContent = state.startupError;
    $("notice").hidden = false;
  }
  $("launch").checked = state.launchAtLogin;
  $("pause").textContent = state.paused ? "Resume access" : "Pause access";
  $("sign-in").disabled = state.signingIn;
  $("sign-in").textContent = state.signingIn
    ? "Finish sign-in in your browser…"
    : "Continue with ChatGPT";
  $("cancel-sign-in").hidden = !state.signingIn;
  $("codex-description").textContent = state.detected?.ready
    ? "Already use Codex? Connect its existing sign-in."
    : state.detected?.available
      ? "Codex found. Sign in to Codex, then check again."
      : "New here? Continue with ChatGPT above to get started.";
  $("codex").hidden =
    !state.detected?.ready || state.profiles?.some((p) => p.id === "codex");
  const profiles = state.profiles || [];
  $("profiles").innerHTML = profiles
    .map(
      (p) =>
        `<div class="profile"><div class="grow"><h3>${esc(p.name)}</h3><p>${esc(p.billing)} · ${esc(p.status === "ready" ? "Ready" : p.status === "signed_out" ? "Sign in again" : "Load available models")}</p></div>${p.status === "signed_out" ? `<button class="text-button" data-action="signIn" data-id="${esc(p.id)}">Sign in</button>` : p.provider === "chatgpt" ? `<select aria-label="Model for ${esc(p.name)}" data-model="${esc(p.id)}">${p.models.map((m) => `<option value="${esc(m.id)}" ${m.id === p.model ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select><button class="text-button" data-action="models" data-id="${esc(p.id)}">Refresh</button>` : '<span class="pill">INFERENCE ONLY</span>'}<button class="text-button" data-action="disconnect" data-id="${esc(p.id)}">Disconnect</button></div>`,
    )
    .join("");
  $("pending-section").hidden = !state.pairings?.length;
  $("pairings").innerHTML = (state.pairings || [])
    .map(
      (p) =>
        `<article class="pairing" data-pairing="${p.id}"><div class="origin">${esc(p.origin)}</div><h3>${esc(p.name)} wants to use your AI</h3><p>${esc(p.purpose)}</p><p>Requests: ${p.requires.map(esc).join(", ")}. Compare this code with the app:</p><code>${p.verificationCode}</code><div class="pairing-controls"><select aria-label="AI connection" class="profile-choice">${profiles
          .filter(
            (a) =>
              a.status === "ready" &&
              p.requires.every((cap) => a.capabilities.includes(cap)),
          )
          .map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`)
          .join(
            "",
          )}</select><select aria-label="Session duration" class="minutes"><option value="15">15 minutes</option><option value="30" selected>30 minutes</option><option value="60">1 hour</option></select><select aria-label="Request allowance" class="allowance"><option value="5" selected>5 requests</option><option value="20">20 requests</option><option value="100">100 requests</option></select><button data-approve="${p.id}" ${profiles.some((a) => a.status === "ready" && p.requires.every((cap) => a.capabilities.includes(cap))) ? "" : "disabled"}>Allow app</button><button class="secondary" data-action="deny" data-id="${p.id}">Deny</button></div></article>`,
    )
    .join("");
  $("grant-count").textContent = state.grants?.length || 0;
  $("grants").innerHTML =
    (state.grants || [])
      .map(
        (g) =>
          `<div class="grant"><span class="icon">↗</span><div class="grow"><div class="origin">${esc(g.origin)}</div><p>${esc(g.name)} · ${g.remaining}/${g.initialAllowance} requests left · ends ${new Date(g.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p></div><button class="text-button" data-action="revoke" data-id="${g.id}">Revoke</button></div>`,
      )
      .join("") ||
    '<div class="empty">When an app asks to connect, approve it here.</div>';
  $("activity").innerHTML =
    (state.activity || [])
      .slice(0, 4)
      .map(
        (a) =>
          `<div class="activity-row"><span>${esc(a.origin)}</span><span class="${esc(a.status)}">${esc(a.status)}</span><time>${new Date(a.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>`,
      )
      .join("") ||
    '<div class="empty">No requests yet. Your first connection starts in an app.</div>';
}
window.bringAI.subscribe(render);
action("snapshot").then((r) => r.ok && render(r.value));
$("sign-in").onclick = () => {
  $("notice").hidden = true;
  action("signIn");
};
$("cancel-sign-in").onclick = () => action("cancelSignIn");
$("codex").onclick = () => action("codex");
$("detect").onclick = () => action("detect");
$("usage").onclick = () => action("usage");
$("pause").onclick = () => action("pause", { value: !current.paused });
$("launch").onchange = (e) =>
  action("launchAtLogin", { value: e.target.checked });
document.addEventListener("click", (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  if (button.dataset.action)
    action(button.dataset.action, { id: button.dataset.id });
  if (button.dataset.approve) {
    const card = button.closest(".pairing");
    action("approve", {
      id: button.dataset.approve,
      profileId: card.querySelector(".profile-choice").value,
      minutes: Number(card.querySelector(".minutes").value),
      requests: Number(card.querySelector(".allowance").value),
    });
  }
});
document.addEventListener("change", (e) => {
  if (e.target.dataset.model)
    action("model", { id: e.target.dataset.model, model: e.target.value });
});
