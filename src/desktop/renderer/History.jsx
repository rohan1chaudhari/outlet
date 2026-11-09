import { useState } from "react";
import { Button, Chip } from "@heroui/react";
import { Dialog } from "./Dialog";

const statuses = {
  running: ["Working", "default"],
  completed: ["Completed", "success"],
  failed: ["Failed", "danger"],
  cancelled: ["Cancelled", "default"],
  interrupted: ["Interrupted", "default"],
};
const providers = { codex: "Codex", claude: "Claude", chatgpt: "ChatGPT" };

export function History({ entries, error, onClear, onClose }) {
  const [clearing, setClearing] = useState(false);
  return (
    <Dialog
      title="History"
      open
      onClose={onClose}
      footer={
        <>
          <Button
            variant="ghost"
            isDisabled={!entries.length}
            isPending={clearing}
            onPress={async () => {
              setClearing(true);
              await onClear();
              setClearing(false);
            }}
          >
            Clear history
          </Button>
          <Button variant="secondary" onPress={onClose}>
            Done
          </Button>
        </>
      }
    >
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <p className="muted">Last 100 requests · Stored on this device</p>
      {entries.length ? (
        <ol className="history-list">
          {entries.map((entry) => {
            const [label, color] = statuses[entry.status] || [
              entry.status,
              "default",
            ];
            const model = entry.model.endsWith("-default")
              ? "Default model"
              : entry.model;
            const seconds = Math.max(
              0,
              Math.round((entry.updatedAt - entry.startedAt) / 1000),
            );
            return (
              <li className="history-row" key={entry.id}>
                <div className="history-row-heading">
                  <h3 title={entry.origin}>{entry.origin}</h3>
                  <Chip size="sm" variant="soft" color={color}>
                    <Chip.Label>{label}</Chip.Label>
                  </Chip>
                </div>
                <p className="muted">
                  {providers[entry.provider] || entry.provider} · {model}
                  {entry.status !== "running" && ` · ${seconds}s`}
                </p>
                <time
                  className="muted"
                  dateTime={new Date(entry.startedAt).toISOString()}
                >
                  {new Date(entry.startedAt).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="muted">No AI requests yet.</p>
      )}
    </Dialog>
  );
}
