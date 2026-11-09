import { useEffect, useState } from "react";
import { Button, Card, Chip, Spinner, Switch, Tooltip } from "@heroui/react";
import { NativeSelect } from "@heroui-pro/react/native-select";
import { Dialog } from "./Dialog";
import { History } from "./History";
import { CloseIcon, HistoryIcon, RefreshIcon, SettingsIcon } from "./icons";
import { clock, modelName, providerNames, siteName } from "./format";

const initial = {
  profiles: [],
  pairings: [],
  grants: [],
  clients: {},
  paused: false,
  port: 4360,
};

const providers = [
  { id: "codex", name: "Codex" },
  { id: "claude", name: "Claude" },
];

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

function IconButton({ label, onPress, children, ...props }) {
  return (
    <Tooltip delay={300}>
      <Button
        isIconOnly
        variant="ghost"
        aria-label={label}
        onPress={onPress}
        {...props}
      >
        {children}
      </Button>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
}

function Toggle({ children, value, onChange }) {
  return (
    <Switch className="setting-row" isSelected={value} onChange={onChange}>
      <Switch.Content className="setting-row-content">
        <span>{children}</span>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  );
}

function Notice({ children, onDismiss }) {
  return (
    <div className="notice" role="alert">
      <span>{children}</span>
      {onDismiss && (
        <IconButton label="Dismiss" size="sm" onPress={onDismiss}>
          <CloseIcon />
        </IconButton>
      )}
    </div>
  );
}

function Row({ title, detail, children }) {
  return (
    <div className="row">
      <div className="row-text">
        <h3 title={title}>{title}</h3>
        {detail && <p className="muted">{detail}</p>}
      </div>
      <div className="row-actions">{children}</div>
    </div>
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
  const duration = minutes === "60" ? "1 hour" : `${minutes} min`;
  return (
    <Dialog
      title="Allow access?"
      open
      onClose={() => decide(false)}
      footer={
        <>
          <Button
            variant="tertiary"
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
      {error && <Notice>{error}</Notice>}
      <div className="approval-site">
        <h3 title={request.origin}>{siteName(request.origin)}</h3>
        {request.purpose && <p className="muted">{request.purpose}</p>}
      </div>
      <div className="pairing-code">
        <span className="muted">Code shown in the app</span>
        <strong>{request.verificationCode}</strong>
      </div>
      {compatible.length ? (
        <SelectField label="Use" value={selected} onChange={setChosen}>
          {compatible.map((p) => option(p.id, p.name))}
        </SelectField>
      ) : (
        <Notice>Connect an AI account that supports this app first.</Notice>
      )}
      {limits ? (
        <div className="field-grid">
          <SelectField label="For" value={minutes} onChange={setMinutes}>
            {[15, 30, 60].map((v) =>
              option(String(v), v === 60 ? "1 hour" : `${v} minutes`),
            )}
          </SelectField>
          <SelectField label="Up to" value={requests} onChange={setRequests}>
            {[5, 20, 100].map((v) => option(String(v), `${v} requests`))}
          </SelectField>
        </div>
      ) : (
        <div className="limits">
          <span className="muted">
            {duration} · {requests} requests
          </span>
          <Button variant="ghost" size="sm" onPress={() => setLimits(true)}>
            Change
          </Button>
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
      title={provider.name}
      open
      onClose={onClose}
      footer={
        <>
          <Button
            variant="danger-soft"
            className="footer-start"
            onPress={async () => {
              if (await action("disconnect", { id: profile.id })) onClose();
            }}
          >
            Disconnect
          </Button>
          <Button variant="tertiary" onPress={onClose}>
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
      {error && <Notice>{error}</Notice>}
      <SelectField label="Model" value={model} onChange={setModel}>
        {!profile.models.some((m) => m.id === model) && (
          <NativeSelect.Option value={model} disabled>
            {model} (unavailable)
          </NativeSelect.Option>
        )}
        {profile.models.map((m) => option(m.id, m.name))}
      </SelectField>
      <p className="muted">Used for new app connections.</p>
    </Dialog>
  );
}

function providerDetail(profile, client, setup) {
  if (setup) return setup.message;
  if (profile) return modelName(profile.model);
  if (!client) return "Checking…";
  if (!client.available) return "Not installed";
  return client.ready ? "Ready" : "Signed out";
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
      setError("The desktop connection is unavailable. Reopen Outlet.");
      return false;
    }
  }
  async function connect(provider) {
    setBusy(provider.id);
    const ok = await action("connectClient", { provider: provider.id });
    setHelpProvider(ok ? null : provider.id);
    setBusy("");
  }
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
  const status = unavailable
    ? ["Unavailable", "danger"]
    : state.paused
      ? ["Paused", "warning"]
      : ["On", "success"];
  const showError =
    (error && !configuring && !requested && !settings && !historyOpen) ||
    state.startupError;
  return (
    <main className="utility-window">
      <header className="utility-header">
        <div className="brand">
          <img src="./mark.png" alt="" width="24" height="24" />
          <h1>Outlet</h1>
          <Chip size="sm" variant="soft" color={status[1]}>
            <Chip.Label>{status[0]}</Chip.Label>
          </Chip>
        </div>
        <div className="header-actions">
          <IconButton
            label="History"
            onPress={() => {
              setHistoryOpen(true);
              setSettings(false);
              setError("");
            }}
          >
            <HistoryIcon />
          </IconButton>
          <IconButton
            label="Settings"
            onPress={() => {
              setSettings(true);
              setHistoryOpen(false);
            }}
          >
            <SettingsIcon />
          </IconButton>
        </div>
      </header>

      {showError && (
        <Notice onDismiss={state.startupError ? null : () => setError("")}>
          {error || state.startupError}
          {helpProvider && (
            <Button
              variant="ghost"
              size="sm"
              onPress={() =>
                action("installationHelp", { provider: helpProvider })
              }
            >
              Setup help
            </Button>
          )}
        </Notice>
      )}

      <section aria-labelledby="ai-heading" className="section">
        <div className="section-title">
          <h2 id="ai-heading">AI Accounts</h2>
          <IconButton
            label="Check again"
            size="sm"
            isDisabled={!!state.clientSetup}
            isPending={busy === "detect"}
            onPress={async () => {
              setBusy("detect");
              await action("detect");
              setBusy("");
            }}
          >
            <RefreshIcon />
          </IconButton>
        </div>
        <Card className="list">
          {providers.map((provider) => {
            const profile = state.profiles.find((p) => p.id === provider.id);
            const client = state.clients[provider.id];
            const setup =
              state.clientSetup?.provider === provider.id && state.clientSetup;
            return (
              <Row
                key={provider.id}
                title={provider.name}
                detail={
                  setup ? (
                    <span className="working">
                      <Spinner size="sm" />
                      {setup.message}
                    </span>
                  ) : (
                    providerDetail(profile, client)
                  )
                }
              >
                {setup ? (
                  <>
                    {setup.loginUrl && (
                      <Button
                        variant="ghost"
                        onPress={() => action("openClientLogin")}
                      >
                        Open browser
                      </Button>
                    )}
                    <Button
                      variant="tertiary"
                      onPress={() => action("cancelClientSetup")}
                    >
                      Cancel
                    </Button>
                  </>
                ) : profile ? (
                  <Button
                    variant="tertiary"
                    isDisabled={!!state.clientSetup}
                    onPress={() => {
                      setError("");
                      setConfiguring(provider);
                    }}
                  >
                    Manage
                  </Button>
                ) : (
                  <Button
                    variant={client?.available ? "primary" : "tertiary"}
                    isDisabled={unavailable || !client || !!state.clientSetup}
                    isPending={busy === provider.id}
                    onPress={() => connect(provider)}
                  >
                    {client && !client.available
                      ? "Install"
                      : client && !client.ready
                        ? "Sign in"
                        : "Connect"}
                  </Button>
                )}
              </Row>
            );
          })}
        </Card>
      </section>

      <section aria-labelledby="apps-heading" className="section">
        <div className="section-title">
          <h2 id="apps-heading">Web Apps</h2>
        </div>
        {state.grants.length ? (
          <Card className="list">
            {state.grants.map((grant) => (
              <Row
                key={grant.id}
                title={siteName(grant.origin)}
                detail={
                  <span className="tabular">
                    {providerNames[grant.provider] || grant.provider} ·{" "}
                    {grant.remaining} left · until {clock(grant.expiresAt)}
                  </span>
                }
              >
                <Button
                  variant="danger-soft"
                  onPress={() => action("revoke", { id: grant.id })}
                >
                  Revoke
                </Button>
              </Row>
            ))}
          </Card>
        ) : (
          <p className="muted">
            Apps appear here after you approve them.
          </p>
        )}
      </section>

      <Dialog
        title="Settings"
        open={settings}
        onClose={() => setSettings(false)}
      >
        {error && <Notice>{error}</Notice>}
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
        <div className="setting-row-content">
          <span>Local address</span>
          <code className="muted">127.0.0.1:{state.port}</code>
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
