import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ConnectorError } from "./errors.mjs";
// Only the main process can read this file. The injected crypto is OS-backed.
export class Vault {
  constructor(dir, crypto) {
    this.dir = dir;
    this.crypto = crypto;
    this.data = { hostId: `urn:uuid:${randomUUID()}`, accounts: [] };
    this.queue = Promise.resolve();
  }
  async open() {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    try {
      const decrypted = await this.crypto.decrypt(
        await readFile(join(this.dir, "credentials.enc")),
      );
      this.data = JSON.parse(decrypted.result);
      if (decrypted.shouldReEncrypt) await this.save();
    } catch (e) {
      if (e.code !== "ENOENT")
        throw new ConnectorError(
          "vault_locked",
          "The protected account store could not be opened. Unlock your system keychain and restart.",
          503,
        );
    }
    return this;
  }
  save() {
    const json = JSON.stringify(this.data);
    const task = this.queue
      .catch(() => {})
      .then(async () => {
        const encrypted = await this.crypto.encrypt(json),
          file = join(this.dir, `credentials-${randomUUID()}.tmp`);
        await writeFile(file, encrypted, { mode: 0o600 });
        await rename(file, join(this.dir, "credentials.enc"));
      });
    this.queue = task;
    return task;
  }
}
