import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Vault } from "../src/core/vault.mjs";

function cryptoFixture() {
  const key = randomBytes(32);
  return {
    encrypt: async (text) => {
      const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key, iv);
      const bytes = Buffer.concat([
        cipher.update(text, "utf8"),
        cipher.final(),
      ]);
      return Buffer.concat([iv, cipher.getAuthTag(), bytes]);
    },
    decrypt: async (bytes) => {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        bytes.subarray(0, 12),
      );
      decipher.setAuthTag(bytes.subarray(12, 28));
      return {
        result: Buffer.concat([
          decipher.update(bytes.subarray(28)),
          decipher.final(),
        ]).toString(),
        shouldReEncrypt: false,
      };
    },
  };
}
test("protected account data survives reopen using Electron asynchronous decryption result shape", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bring-ai-vault-test-")),
    crypto = cryptoFixture();
  const vault = await new Vault(dir, crypto).open();
  const host = vault.data.hostId;
  vault.data.accounts.push({
    id: "synthetic",
    accessToken: "TEST_ONLY_SECRET",
  });
  await vault.save();
  const bytes = await readFile(join(dir, "credentials.enc"));
  assert.equal(bytes.includes(Buffer.from("TEST_ONLY_SECRET")), false);
  const reopened = await new Vault(dir, crypto).open();
  assert.equal(reopened.data.hostId, host);
  assert.equal(reopened.data.accounts[0].accessToken, "TEST_ONLY_SECRET");
  if (process.platform !== "win32")
    assert.equal(
      (await stat(join(dir, "credentials.enc"))).mode & 0o777,
      0o600,
    );
});
test("an unreadable protected file fails closed instead of replacing credentials", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bring-ai-vault-test-"));
  await writeFile(join(dir, "credentials.enc"), "corrupt-test-data");
  await assert.rejects(new Vault(dir, cryptoFixture()).open(), {
    code: "vault_locked",
  });
  assert.equal(
    await readFile(join(dir, "credentials.enc"), "utf8"),
    "corrupt-test-data",
  );
});
