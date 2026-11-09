import test from "node:test";
import assert from "node:assert/strict";
import { RequestHistory } from "../src/core/history.mjs";

test("history persists bounded metadata across restarts without prompt, output or credential fields", async () => {
  let saved;
  const vault = {
    data: {},
    save: async () => {
      saved = JSON.stringify(vault.data);
    },
  };
  const history = new RequestHistory(vault);
  for (let i = 0; i < 105; i++) {
    const id = history.start({
      origin: "https://example.test",
      provider: "codex",
      model: "model-id",
      startedAt: i + 1,
      messages: "private prompt",
      output: "private result",
      token: "private token",
    });
    history.finish(id, "completed", i + 1000);
  }
  await history.flush();
  const restored = new RequestHistory({
    data: JSON.parse(saved),
    save: async () => {},
  });
  assert.equal(restored.snapshot().length, 100);
  assert.equal(restored.snapshot()[0].startedAt, 105);
  assert.equal(restored.snapshot().at(-1).startedAt, 6);
  assert.equal(restored.snapshot()[0].status, "completed");
  assert.equal(/private|messages|output|token/.test(saved), false);
  const copy = restored.snapshot();
  copy[0].status = "changed";
  assert.equal(restored.snapshot()[0].status, "completed");
});

test("unfinished requests become interrupted after restart, and clearing an active entry does not resurrect it", async () => {
  const vault = { data: {}, save: async () => {} };
  const history = new RequestHistory(vault);
  const id = history.start({
    origin: "https://example.test",
    provider: "claude",
    model: "sonnet",
    startedAt: 1,
  });
  await history.flush();
  assert.equal(new RequestHistory(vault).snapshot()[0].status, "interrupted");
  await history.clear();
  history.finish(id, "completed", 10);
  assert.deepEqual(history.snapshot(), []);
  assert.deepEqual(new RequestHistory(vault).snapshot(), []);
});

test("history reports disk-write failure instead of claiming successful deletion", async () => {
  let fail = true,
    changes = 0;
  const vault = {
    data: {},
    save: async () => {
      if (fail) throw new Error("disk fixture");
    },
  };
  const history = new RequestHistory(vault, { onChange: () => changes++ });
  history.start({
    origin: "https://example.test",
    provider: "codex",
    model: "default",
    startedAt: 1,
  });
  assert.equal(await history.flush(), false);
  assert.ok(history.error);
  await assert.rejects(history.clear(), { code: "history_save_failed" });
  fail = false;
  await history.clear();
  assert.equal(history.error, null);
  assert.ok(changes >= 2);
});

test("restored metadata discards extra payload fields and malformed records", () => {
  const entry = {
    id: "fixture",
    origin: "https://example.test",
    provider: "codex",
    model: "default",
    status: "completed",
    startedAt: 1,
    updatedAt: 2,
    output: "private result",
  };
  const history = new RequestHistory({
    data: { requestHistory: [null, {}, entry] },
  });
  assert.equal(history.snapshot().length, 1);
  assert.equal(
    JSON.stringify(history.snapshot()).includes("private result"),
    false,
  );
});
