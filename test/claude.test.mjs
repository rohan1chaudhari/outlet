import test from "node:test";
import assert from "node:assert/strict";
import { parseClaudeOutput } from "../src/providers/claude.mjs";
import { ProviderRegistry } from "../src/providers/registry.mjs";

const stream = (events) =>
  events.map((event) => JSON.stringify(event)).join("\n");
const completed = {
  type: "result",
  subtype: "success",
  is_error: false,
  result: "hello",
};

test("Claude accepts an inference-only successful turn and rejects tools or missing completion", () => {
  assert.equal(
    parseClaudeOutput(
      stream([{ type: "system", subtype: "init", tools: [] }, completed]),
      0,
    ).output,
    "hello",
  );
  assert.throws(
    () =>
      parseClaudeOutput(
        stream([
          { type: "system", subtype: "init", tools: ["Bash"] },
          completed,
        ]),
        0,
      ),
    { code: "tool_attempt_rejected" },
  );
  assert.throws(
    () =>
      parseClaudeOutput(
        stream([
          {
            type: "assistant",
            message: { content: [{ type: "tool_use", name: "Read" }] },
          },
          completed,
        ]),
        0,
      ),
    { code: "tool_attempt_rejected" },
  );
  assert.throws(
    () =>
      parseClaudeOutput(
        stream([
          {
            type: "assistant",
            message: { content: [{ type: "text", text: "partial" }] },
          },
        ]),
        0,
      ),
    { code: "claude_failed" },
  );
});
test("Claude structured output permits only its schema formatter and returns credit errors honestly", () => {
  const schema = { type: "object", properties: { answer: { type: "string" } } };
  assert.deepEqual(
    parseClaudeOutput(
      stream([
        { type: "system", subtype: "init", tools: ["StructuredOutput"] },
        { ...completed, structured_output: { answer: "hello" } },
      ]),
      0,
      schema,
    ).output,
    { answer: "hello" },
  );
  assert.throws(
    () =>
      parseClaudeOutput(
        stream([
          { ...completed, is_error: true, result: "Credit balance is too low" },
        ]),
        1,
      ),
    { code: "claude_usage_unavailable", status: 429 },
  );
});
test("native model configuration accepts only dropdown catalog entries and preserves provider identity", async () => {
  let saves = 0;
  const vault = {
    data: { accounts: [] },
    save: async () => {
      saves++;
    },
  };
  const registry = new ProviderRegistry(vault, {});
  registry.claude = { binary: "test-only" };
  await registry.clientModel("claude", "sonnet");
  assert.equal(registry.getPublic("claude").model, "sonnet");
  assert.equal(registry.getPublic("claude").provider, "claude");
  await assert.rejects(registry.clientModel("claude", "arbitrary-model"), {
    code: "invalid_model",
  });
  await assert.rejects(registry.clientModel("codex", "--bad"), {
    code: "invalid_model",
  });
  await registry.clientModel("claude", "claude-default");
  assert.equal(registry.getPublic("claude").model, "claude-default");
  assert.equal(saves, 2);
});
