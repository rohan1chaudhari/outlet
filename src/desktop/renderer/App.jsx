import { useEffect, useState } from "react";
import { Button, Chip, Switch } from "@heroui/react";
import { NativeSelect } from "@heroui-pro/react/native-select";
import { Dialog } from "./Dialog";
import { History } from "./History";

const initial = {
  profiles: [],
  pairings: [],
  grants: [],
  clients: {},
  paused: false,
  port: 4360,
};

function SelectField({ label, value, onChange, children }) {
  return (
    <NativeSelect variant="secondary">
      <label className="field-label">{label}</label>
      <NativeSelect.Trigger
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
        <NativeSelect.Indicator />
      </NativeSelect.Trigger>
    </NativeSelect>
  );
}
const option = (value, label) => (
  <NativeSelect.Option key={value} value={value}>
    {label}
  </NativeSelect.Option>
);

function Toggle({ children, value, onChange, disabled }) {
  return (
    <Switch
      className="setting-switch"
      isSelected={value}
      onChange={onChange}
      isDisabled={disabled}
    >
      <Switch.Content className="setting-switch-content">
        <span>{children}</span>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  );
}

function Approval({ request, profiles, action, error }) {
  const compatible = profiles.filter(
    (p) =>
      p.status === "ready" &&
      request.requires.every((c) => p.capabilities.includes(c)),
  );
  const [chosen, setChosen] = useState(compatible[0]?.id || "");
  const [minutes, setMinutes] = useState("30");
  const [requests, setRequests] = useState("5");
  const [limits, setLimits] = useState(false);
  const [busy, setBusy] = useState(false);
  const selected = compatible.some((p) => p.id === chosen)
    ? chosen
    : compatible[0]?.id;
  const decide = async (allow) => {
    setBusy(true);
    await action(
      allow ? "approve" : "deny",
      allow
        ? {
            id: request.id,
            profileId: selected,
            minutes: Number(minutes),
            requests: Number(requests),
          }
        : { id: request.id },
    );
    setBusy(false);
  };
  return (
    <Dialog
      title="Connect Web App"
      open
      onClose={() => decide(false)}
      footer={
        <>
          <Button
            variant="secondary"
            onPress={() => decide(false)}
            isDisabled={busy}
          >
            Deny
          </Button>
          <Button
            onPress={() => decide(true)}
            isPending={busy}
            isDisabled={!selected}
          >
            Allow
          </Button>
        </>
      }
    >
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <div className="approval-origin">{request.origin}</div>
      <p className="muted">{request.purpose}</p>
      <div className="pairing-proof">
        <span className="muted">Match this code in your web app</span>
        <strong>{request.verificationCode}</strong>
      </div>
      {compatible.length ? (
        <SelectField label="Provider" value={selected} onChange={setChosen}>
          {compatible.map((p) => option(p.id, p.name))}
        </SelectField>
      ) : (
        <p className="notice">
          Connect a compatible provider before allowing this app.
        </p>
      )}
      <div className="limits-summary">
        <span className="muted">
          {minutes} minutes · {requests} requests
        </span>
        <Button variant="ghost" onPress={() => setLimits(!limits)}>
          {limits ? "Hide limits" : "Edit limits"}
        </Button>
      </div>
      {limits && (
        <div className="field-grid">
          <SelectField label="Duration" value={minutes} onChange={setMinutes}>
            {[15, 30, 60].map((v) =>
              option(String(v), v === 60 ? "1 hour" : `${v} minutes`),
            )}
          </SelectField>
          <SelectField label="Requests" value={requests} onChange={setRequests}>
            {[5, 20, 100].map((v) => option(String(v), `${v} requests`))}
          </SelectField>
        </div>
      )}
    </Dialog>
  );
}

function ProviderSettings({ provider, profile, action, onClose, error }) {
  const [model, setModel] = useState(profile.model);
  const [saving, setSaving] = useState(false);
  return (
    <Dialog
      title={`Configure ${provider.name}`}
      open
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onPress={onClose}>
            Cancel
          </Button>
          <Button
            isPending={saving}
            onPress={async () => {
              setSaving(true);
              const ok = await action("clientModel", {
                provider: provider.id,
                model,
              });
              setSaving(false);
              if (ok) onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <SelectField label="Model" value={model} onChange={setModel}>
        {!profile.models.some((m) => m.id === model) && (
          <NativeSelect.Option value={model} disabled>
            {model} (unavailable)
          </NativeSelect.Option>
        )}
        {profile.models.map((m) => option(m.id, m.name))}
      </SelectField>
      <p className="muted">Applies to new web app connections.</p>
      <div className="dialog-disconnect">
        <Button
          variant="danger-soft"
          onPress={async () => {
            if (await action("disconnect", { id: profile.id })) onClose();
          }}
        >
          Disconnect
        </Button>
      </div>
    </Dialog>
  );
}

export function App() {
  const [state, setState] = useState(initial);
  const [error, setError] = useState("");
  const [helpProvider, setHelpProvider] = useState(null);
  const [busy, setBusy] = useState("");
  const [settings, setSettings] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [configuring, setConfiguring] = useState(null);
  useEffect(() => {
    let mounted = true;
    const stop = window.bringAI.subscribe((value) => {
      if (mounted) setState({ ...initial, ...value });
    });
    window.bringAI.action("snapshot").then((result) => {
      if (mounted && result.ok) setState({ ...initial, ...result.value });
    });
    return () => {
      mounted = false;
      stop();
    };
  }, []);
  async function action(name, input) {
    setError("");
    try {
      const result = await window.bringAI.action(name, input);
      if (!result.ok && result.error?.code !== "setup_cancelled")
        setError(result.error?.message || "Could not complete this action.");
      return result.ok;
    } catch {
      setError("The desktop connection is unavailable. Reopen Bring AI.");
      return false;
    }
  }
  async function connect(provider) {
    setBusy(provider.id);
    const ok = await action("connectClient", { provider: provider.id });
    setHelpProvider(ok ? null : provider.id);
    setBusy("");
  }
  const providers = [
    { id: "codex", name: "Codex" },
    { id: "claude", name: "Claude" },
  ];
  const requested = state.pairings[0];
  useEffect(() => {
    if (requested) {
      setConfiguring(null);
      setSettings(false);
      setHistoryOpen(false);
      setError("");
    }
  }, [requested?.id]);
  useEffect(() => {
    if (requested) return;
    setHistoryOpen(state.viewRequest?.name === "history");
    if (state.viewRequest?.name === "history") {
      setSettings(false);
      setConfiguring(null);
      setError("");
    }
  }, [state.viewRequest?.sequence]);
  const configuredProfile =
    configuring && state.profiles.find((p) => p.id === configuring.id);
  const unavailable = !!state.startupError;
  return (
    <main className="utility-window">
      <header className="utility-header">
        <h1>Bring AI</h1>
        <div className="utility-header-actions">
          <Button
            variant="ghost"
            onPress={() => {
              setHistoryOpen(true);
              setSettings(false);
              setError("");
            }}
          >
            History
          </Button>
          <Button
            variant="ghost"
            onPress={() => {
              setSettings(true);
              setHistoryOpen(false);
            }}
          >
            Settings
          </Button>
        </div>
      </header>
      <div className="service-line">
        <Chip
          size="sm"
          color={unavailable ? "danger" : state.paused ? "default" : "success"}
          variant="soft"
        >
          <Chip.Label>
            {unavailable ? "Unavailable" : state.paused ? "Paused" : "Running"}
          </Chip.Label>
        </Chip>
        <span className="endpoint">127.0.0.1:{state.port}</span>
      </div>
      {((error && !configuring && !requested && !settings && !historyOpen) ||
        state.startupError) && (
        <div className="notice" role="alert">
          {error || state.startupError}
          {helpProvider && (
            <Button
              variant="ghost"
              onPress={() =>
                action("installationHelp", { provider: helpProvider })
              }
            >
              Setup help
            </Button>
          )}
          <Button
            variant="ghost"
            onPress={() => setError("")}
            aria-label="Dismiss error"
          >
            Dismiss
          </Button>
        </div>
      )}
      <section aria-labelledby="providers-heading" className="utility-section">
        <div className="section-title">
          <h2 id="providers-heading">Providers</h2>
          <Button
            variant="ghost"
            isDisabled={!!state.clientSetup}
            isPending={busy === "detect"}
            onPress={async () => {
              setBusy("detect");
              await action("detect");
              setBusy("");
            }}
          >
            Check again
          </Button>
        </div>
        {providers.map((provider) => {
          const profile = state.profiles.find((p) => p.id === provider.id);
          const client = state.clients[provider.id];
          const waiting = state.clientSetup?.provider === provider.id;
          return (
            <div key={provider.id} className="provider-row">
              <div>
                <h3>{provider.name}</h3>
                <p className="muted">
                  {waiting
                    ? state.clientSetup.message
                    : profile
                      ? profile.model.endsWith("-default")
                        ? "Connected · Default model"
                        : `Connected · ${profile.model}`
                      : !client
                        ? "Checking installation…"
                        : client.available
                          ? client.ready
                            ? "Ready to connect"
                            : "Sign in required"
                          : "Not installed"}
                </p>
              </div>
              {waiting ? (
                <div className="setup-actions">
                  {state.clientSetup.loginUrl && (
                    <Button
                      variant="ghost"
                      onPress={() => action("openClientLogin")}
                    >
                      Open browser
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    onPress={() => action("cancelClientSetup")}
                  >
                    Cancel
                  </Button>
                </div>
              ) : profile ? (
                <Button
                  variant="secondary"
                  isDisabled={!!state.clientSetup}
                  onPress={() => {
                    setError("");
                    setConfiguring(provider);
                  }}
                >
                  Configure
                </Button>
              ) : (
                <Button
                  variant={client?.available ? "primary" : "secondary"}
                  isDisabled={unavailable || !client || !!state.clientSetup}
                  isPending={busy === provider.id}
                  onPress={() => connect(provider)}
                >
                  {!client
                    ? "Checking"
                    : client.available
                      ? client.ready
                        ? "Connect"
                        : "Sign in"
                      : "Install"}
                </Button>
              )}
            </div>
          );
        })}
      </section>
      {Object.values(state.clients).some((client) => !client.available) && (
        <p className="setup-copy muted">
          Install uses the provider’s official installer. Sign-in opens in your
          browser.
        </p>
      )}
      <section
        aria-labelledby="apps-heading"
        className="utility-section apps-section"
      >
        <div className="section-title">
          <h2 id="apps-heading">Web Apps</h2>
        </div>
        {state.grants.length ? (
          state.grants.map((grant) => (
            <div className="app-row" key={grant.id}>
              <div>
                <h3 title={grant.origin}>{grant.origin}</h3>
                <p className="muted">
                  {grant.provider === "claude"
                    ? "Claude"
                    : grant.provider === "codex"
                      ? "Codex"
                      : "ChatGPT"}{" "}
                  · {grant.remaining} requests left · until{" "}
                  {new Date(grant.expiresAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <Button
                variant="danger-soft"
                onPress={() => action("revoke", { id: grant.id })}
              >
                Revoke
              </Button>
            </div>
          ))
        ) : (
          <p className="empty-copy">
            Choose “Connect AI” in your web app.
            <br />
            Its access request will appear here.
          </p>
        )}
      </section>
      <Dialog
        title="Settings"
        open={settings}
        onClose={() => setSettings(false)}
      >
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        <Toggle
          value={!!state.launchAtLogin}
          onChange={(value) => action("launchAtLogin", { value })}
        >
          Open at login
        </Toggle>
        <Toggle
          value={!!state.paused}
          onChange={(value) => action("pause", { value })}
        >
          Pause all access
        </Toggle>
        <div className="settings-endpoint">
          <span className="muted">Local address</span>
          <code>http://127.0.0.1:{state.port}</code>
        </div>
        <p className="muted">
          Closing this window keeps Bring AI in the menu bar. Use Quit Bring AI
          there to stop it.
        </p>
      </Dialog>
      {configuring && configuredProfile && (
        <ProviderSettings
          key={configuring.id}
          provider={configuring}
          profile={configuredProfile}
          action={action}
          error={error}
          onClose={() => {
            setConfiguring(null);
            setError("");
          }}
        />
      )}
      {historyOpen && (
        <History
          entries={state.history || []}
          error={error || state.historyError}
          onClear={() => action("clearHistory")}
          onClose={() => {
            setHistoryOpen(false);
            setError("");
          }}
        />
      )}
      {requested && !unavailable && (
        <Approval
          key={requested.id}
          request={requested}
          profiles={state.profiles}
          action={action}
          error={error}
        />
      )}
    </main>
  );
}
