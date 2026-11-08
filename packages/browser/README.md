# @bring-ai/browser

Dependency-free ES module SDK for Bring AI. Import `connectAI`, show the pairing code and launch link, and wait for native approval. Use `session.generate()` for text/JSON/images, `session.status()` for interrupted requests and `session.disconnect()` to revoke. See the root README and `index.d.ts` for signatures.

Requires a secure browser context and a running connector on the same computer. A phone browser cannot reach a connector running on a different laptop through `127.0.0.1`. There is no cloud proxy or automatic inference replay. Tokens are held in memory, not localStorage or cookies.
