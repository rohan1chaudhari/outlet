# Alpha validation · 2026-11-08

Environment: macOS 15.3, Apple Silicon, Chrome 157.0.8103.38, Electron 45.2.3, Codex CLI 0.161.0. Development used Node 26.12.1; bundled desktop users do not need Node. No independent audit or external-user study has run.

## Observed

- The real desktop window launched, detected authenticated Codex, connected it through the native UI and protected the saved preference with OS-backed encryption. No provider auth file was read or copied by Bring AI.
- Daylight was served through a temporary public HTTPS Quick Tunnel. The browser reported `isSecureContext: true`. Only the demo server on 4361 was tunneled; the connector stayed on `127.0.0.1:4360`.
- Public HTTPS → loopback initially awaited Chrome's local-network permission. The test granted `local-network-access` for that exact HTTPS origin through Playwright's permission API, then retried. This models a user permission grant; it does **not** verify the visible permission prompt's click path. No web-security, mixed-content or certificate bypass flag was added.
- Daylight displayed a six-digit pairing code matching the trusted desktop window. The website remained pending until native Allow app was clicked. The grant used existing Codex, 30 minutes and 5 requests.
- The app's own server supplied context. The SDK sent text plus a JSON schema through the local connector. Real Codex returned a validated meal estimate: 380 kcal, 21 g protein, with an assumptions caveat. The displayed allowance fell from 5 to 4. This value is an example model response, not a nutrition accuracy claim.
- Margin on a different origin (`http://127.0.0.1:4362`) independently requested and received native approval, then returned a real summary and next steps using the same configured Codex connection. Both grants appeared separately in the desktop UI.
- Revoking Margin in the desktop window caused its next generate request to fail with `session_expired`; no new inference was admitted. The earlier completed result remained visible in the app.
- The notes layout at a 390 px viewport had a 390 px scroll width. This is responsive layout evidence, not phone-to-laptop transport support.
- 21 automated tests passed. Coverage includes native-approval separation, verifier proof, exact origin binding, revocation/expiry, shared allowances, capability escalation, stale authority after parsing, concurrency/cancellation, duplicate IDs and result recovery, hostile request fields and schemas, SSE framing, OAuth state/client/identity validation, refresh serialization, late provider errors and SDK completion semantics.
- A regression caught Codex informational `error` items being classified as tool operations. The parser now distinguishes warnings from operations while still requiring a successful terminal turn and rejecting any operation item. Synthetic command/file/MCP/web/unknown-operation events are rejected. No adversarial OS-execution penetration test is claimed.
- A packaged app launch and restart restored the saved Codex connection successfully. The restart check caught and corrected handling of Electron 45’s `{result, shouldReEncrypt}` decryption return value; a protected-file reopen regression test now covers it. Development and packaged settings use separate directories.
- macOS Apple Silicon `.app`, DMG and ZIP built successfully with an app icon. Builds are unsigned and not notarized. Production dependency audit was run; AJV was upgraded to the patched 8.20.0 release; the production dependency audit then reported zero vulnerabilities.

UI evidence is under [`evidence/`](evidence/): desktop-ready, desktop-approval, https-meal-success, notes-success, two-apps and revoked PNGs. The temporary tunnel and both example servers were stopped. The task-owned Chrome session and native debugging attachment were closed; their browser processes exited and the disposable Chrome profile was removed. The packaged test app was also closed. The tunnel URL is no longer a live demo link.

## Not established

Fresh live ChatGPT OAuth consent and first direct Responses inference; no-Codex clean-machine acceptance; model-specific image/JSON compatibility on the direct route; Windows/Linux installer execution; Safari/Firefox/Edge compatibility; real browser permission-prompt clicks; hostile iframe/extension tests; signed updates; notarized distribution; external security review; universal downstream provider eligibility; unattended or paired-device use. Claude, API-key and local-model adapters are future work.

The direct ChatGPT adapter is implemented using the current documented OSS/local flow. Cryptographic validation, refresh, request shapes and terminal error handling are exercised with synthetic data. Those tests are not a substitute for live account consent. No live new-provider credential was entered or created during these checks.

## Portfolio decision

The extension-free transport works for the tested desktop environment and merits a bounded external-user setup test. Keep the broader idea as a developed seed and preserve existing active priorities. Next action: have one ChatGPT user with no CLI try the packaged setup; record completion, friction and a real direct request before promoting the no-CLI route to verified support. Public release also needs signed packaging and an actual private security-reporting channel.
