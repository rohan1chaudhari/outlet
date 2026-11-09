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


## Utility interface · 2026-11-09

The Electron window is now a 560 × 540 utility using React 19, HeroUI v3 and the actual HeroUI Pro NativeSelect component. The old sidebar, slogans, marketing header, activity dashboard and decorative surfaces were removed. Normal controls are provider connection/configuration, web app approval/revocation, and a small Settings dialog.

Model configuration is a dropdown: Codex uses the installed app-server’s `model/list` result; Claude uses the documented Default/Sonnet/Opus/Haiku/Fable aliases. The native API rejects values outside its model list. The chosen Codex model was saved and used for a real structured-output request from the Daylight web app. The result displayed 370 kcal and 21 g protein, and the allowance decreased from 5 to 4. Model availability and billing remain account-specific.

Claude’s installed login was detected, connected and saved. Its inference-only process advertised an empty tool list, but the actual request returned “Credit balance is too low.” The connector fails that request with `claude_usage_unavailable`; no successful Claude inference is claimed. Parser fixtures verify success, structured formatting, rejection of executable tools, interrupted turns and the observed credit failure.

All 24 automated tests passed. Renderer compilation and unsigned macOS app/DMG/ZIP packaging passed. UI controls were inspected in the real Electron window. [Main window](evidence/utility-main.png), [model dropdown](evidence/utility-model-dropdown.png). HeroUI base APIs were retrieved through its public MCP; the Pro docs MCP required a separate personal token, so the Pro NativeSelect API was checked against the official public docs and installed package types. The licensed vendor source stays outside git.

The packaged `.app` was launched separately after stopping the development app. It rendered the bundled utility, detected both installed clients, and displayed the real Codex model catalog in its native dropdown. The expanded approval limits and Settings switches were inspected in the development window. All task-owned browser sessions, temporary profiles, example servers and native test windows were closed after verification.

Missing-provider setup opens the fixed official installation page. Fresh native client installation and sign-in, successful Claude generation on a funded account, and cross-platform acceptance still require testing. The existing direct ChatGPT backend remains experimental and is no longer the main setup UI.

## Automatic setup and menu-bar operation · 2026-11-09

Missing clients now have an **Install** action. Native setup downloads the official provider bootstrap, runs its native installer, redetects the client, starts browser sign-in if necessary, verifies authentication, then connects. Already installed and authenticated clients skip installation and sign-in. Progress, cancellation, an authorization-link fallback and setup help stay in the existing utility. The model dropdown is unchanged.

The documented [Codex native installer](https://learn.chatgpt.com/docs/codex/cli) and [installer variables](https://learn.chatgpt.com/docs/config-file/environment-variables), plus [Claude native setup](https://code.claude.com/docs/en/setup) and [authentication commands](https://code.claude.com/docs/en/cli-reference), were checked on 2026-11-09. Real bootstrap downloads passed through the exact vendor redirect allowlist: `releases.openai.com/codex/install.sh` and `downloads.claude.ai/claude-code-releases/bootstrap.sh`. These checks downloaded scripts without executing or replacing this machine’s existing clients.

All **34 tests passed**, including missing-client install → sign-in → verified connection for both adapters, reuse of existing sign-in, cancellation and retry, overlapping setup rejection, failed install/login, bootstrap origin/size/content restrictions, temporary-file cleanup, native install discovery on Windows, and actual subprocess cancellation. The missing/installing/Cancel screens were visually checked using the real renderer with an isolated fixture. [Missing-client fixture](evidence/setup-missing-fixture.png), [installing fixture](evidence/setup-installing-fixture.png). These images demonstrate UI states, not a clean-machine install.

The macOS menu-bar icon was visually observed. The shared native app/tray menu exposes Open, Pause, Revoke all, Open at login and Quit; actual native menu gestures paused and resumed the service. Closing the development window produced `document.visibilityState = hidden` while port 4360 stayed bound. The packaged app also started with `--background`, bound 4360 without a visible normal window, and reopened normally. The packaged native menu displayed the quick actions, and Command-Q quit the app. macOS app/DMG/ZIP packaging passed. The updated packaged app is intentionally left running for Rohan’s local test; disposable preview browsers, profiles and fixture processes are closed.

**Remaining acceptance:** a full official installer run and fresh browser sign-in on a clean machine; startup after a real OS login; Windows/Linux native install, tray and cancellation; successful Claude inference with a funded account. This run used existing signed-in clients and did not log them out, replace them or change account billing. This adds a background desktop service, not autonomous website authority.

### Request history

History is available from the tray/app menu and the window header. It stores the latest 100 request metadata records in the existing OS-encrypted vault, including origin, provider/model, timestamps and completed/failed/cancelled/interrupted status. The short-lived result-recovery cache is unchanged. A native Clear history action removes the saved log. Previous requests made before this feature cannot be reconstructed.

All **39 tests passed** after this addition. New checks cover persistence across restart, the 100-record limit, metadata-only serialization, interrupted requests, clearing during generation, disk-write failures, and completed/failed/cancelled outcomes surviving result-cache cleanup. Installer and consent-boundary checks continue to pass.

The packaged menu’s History action opened the empty-state dialog. Populated history and Clear history were visually checked with [fixture data](evidence/history-fixture.png) in the same compiled renderer; clearing the fixture returned its empty state. The packaged utility was left hidden in the menu bar with the local service still running for the user’s test.
