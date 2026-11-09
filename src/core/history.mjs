import { randomUUID } from "node:crypto";
import { ConnectorError } from "./errors.mjs";

const statuses = new Set([
  "running",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);
function metadata(value) {
  if (
    !value ||
    typeof value.id !== "string" ||
    typeof value.origin !== "string" ||
    !Number.isFinite(value.startedAt) ||
    !Number.isFinite(value.updatedAt) ||
    !statuses.has(value.status)
  )
    return null;
  return {
    id: value.id,
    origin: value.origin,
    provider: String(value.provider || "unknown"),
    model: String(value.model || "default"),
    status: value.status,
    startedAt: value.startedAt,
    updatedAt: value.updatedAt,
  };
}

// Keep request metadata independent from the short-lived inference-result cache.
export class RequestHistory {
  constructor(vault, { onChange = () => {} } = {}) {
    this.vault = vault;
    this.onChange = onChange;
    this.error = null;
    this.pending = Promise.resolve(true);
    this.entries = (
      Array.isArray(vault?.data.requestHistory) ? vault.data.requestHistory : []
    )
      .map(metadata)
      .filter(Boolean)
      .slice(-100)
      .map((entry) =>
        entry.status === "running"
          ? { ...entry, status: "interrupted" }
          : entry,
      );
  }
  start({ origin, provider, model, startedAt }) {
    const entry = metadata({
      id: randomUUID(),
      origin,
      provider,
      model,
      startedAt,
      updatedAt: startedAt,
      status: "running",
    });
    this.entries = [...this.entries, entry].slice(-100);
    this.persist();
    return entry.id;
  }
  finish(id, status, updatedAt) {
    const entry = this.entries.find((entry) => entry.id === id);
    if (!entry) return;
    entry.status = status;
    entry.updatedAt = updatedAt;
    this.persist();
  }
  snapshot() {
    return this.entries
      .slice()
      .reverse()
      .map((entry) => ({ ...entry }));
  }
  persist() {
    if (!this.vault) return this.pending;
    this.vault.data.requestHistory = this.entries.map((entry) => ({
      ...entry,
    }));
    this.pending = this.vault
      .save()
      .then(() => {
        if (this.error) {
          this.error = null;
          this.onChange();
        }
        return true;
      })
      .catch(() => {
        this.error = "Recent history could not be saved on this device.";
        this.onChange();
        return false;
      });
    return this.pending;
  }
  async clear() {
    this.entries = [];
    if (!(await this.persist()))
      throw new ConnectorError(
        "history_save_failed",
        "History could not be cleared from disk. Try again.",
        503,
      );
  }
  flush() {
    return this.pending;
  }
}
