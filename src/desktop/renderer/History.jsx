import { useState } from "react";
import { Button, Chip } from "@heroui/react";
import { Dialog } from "./Dialog";
import { clock, modelName, providerNames, siteName } from "./format";

const statuses = {
  running: ["Working", "default"],
  completed: ["Completed", "success"],
  failed: ["Failed", "danger"],
  cancelled: ["Cancelled", "default"],
  interrupted: ["Interrupted", "default"],
};

function when(time) {
  const date = new Date(time);
  const today = new Date().toDateString() === date.toDateString();
  return today
    ? clock(time)
    : date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

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
            className="footer-start"
            isDisabled={!entries.length}
            isPending={clearing}
            onPress={async () => {
              setClearing(true);
              await onClear();
              setClearing(false);
            }}
          >
            Clear
          </Button>
          <Button variant="tertiary" onPress={onClose}>
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
      {entries.length ? (
        <ol className="history-list">
          {entries.map((entry) => {
            const [label, color] = statuses[entry.status] || [
              entry.status,
              "default",
            ];
            const seconds = Math.max(
              0,
              Math.round((entry.updatedAt - entry.startedAt) / 1000),
            );
            return (
              <li className="history-row" key={entry.id}>
                <div className="row-text">
                  <h3 title={entry.origin}>{siteName(entry.origin)}</h3>
                  <p className="muted tabular">
                    {providerNames[entry.provider] || entry.provider} ·{" "}
                    {modelName(entry.model)}
                    {entry.status !== "running" && ` · ${seconds}s`} ·{" "}
                    <time dateTime={new Date(entry.startedAt).toISOString()}>
                      {when(entry.startedAt)}
                    </time>
                  </p>
                </div>
                <Chip size="sm" variant="soft" color={color}>
                  <Chip.Label>{label}</Chip.Label>
                </Chip>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="muted">No requests yet.</p>
      )}
    </Dialog>
  );
}
