import { useEffect, useState } from "react";
import { Button, Chip, Modal, Switch } from "@heroui/react";
import { NativeSelect } from "@heroui-pro/react/native-select";

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

function Dialog({ title, open, onClose, children, footer }) {
  return (
    <Modal.Backdrop
      isOpen={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Modal.Container>
        <Modal.Dialog className="utility-dialog">
          <Modal.Header>
            <Modal.Heading>{title}</Modal.Heading>
          </Modal.Header>
          <Modal.Body>{children}</Modal.Body>
          <Modal.Footer>
            {footer || (
              <Button variant="secondary" onPress={onClose}>
                Done
              </Button>
            )}
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

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
  const [busy, setBusy] = useState("");
  const [settings, setSettings] = useState(false);
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
      if (!result.ok)
        setError(result.error?.message || "Could not complete this action.");
      return result.ok;
    } catch {
      setError("The desktop connection is unavailable. Reopen Bring AI.");
      return false;
    }
  }
  async function connect(provider) {
    setBusy(provider.id);
    const status = state.clients[provider.id];
    if (!status?.available)
      await action("installClient", { provider: provider.id });
    else await action("connectClient", { provider: provider.id });
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
      setError("");
    }
  }, [requested?.id]);
  const configuredProfile =
    configuring && state.profiles.find((p) => p.id === configuring.id);
  const unavailable = !!state.startupError;
  return (
    <main className="utility-window">
      <header className="utility-header">
        <h1>Bring AI</h1>
        <Button variant="ghost" onPress={() => setSettings(true)}>
          Settings
        </Button>
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
      {((error && !configuring && !requested && !settings) ||
        state.startupError) && (
        <div className="notice" role="alert">
          {error || state.startupError}
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
          const waiting = state.connectingClient === provider.id;
          return (
            <div key={provider.id} className="provider-row">
              <div>
                <h3>{provider.name}</h3>
                <p className="muted">
                  {waiting
                    ? "Finish signing in in your browser"
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
                <Button
                  variant="secondary"
                  onPress={() => action("cancelClientLogin")}
                >
                  Cancel
                </Button>
              ) : profile ? (
                <Button
                  variant="secondary"
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
                  isDisabled={unavailable || !client}
                  isPending={busy === provider.id}
                  onPress={() => connect(provider)}
                >
                  {!client
                    ? "Checking"
                    : client.available
                      ? client.ready
                        ? "Connect"
                        : "Sign in"
                      : "Set up"}
                </Button>
              )}
            </div>
          );
        })}
      </section>
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
