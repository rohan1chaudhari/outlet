# Security model

Status: development alpha; no independent security audit. This code is useful for testing the architecture, not a guarantee that all providers or untrusted apps are safe.

## Boundaries

- The desktop main process owns provider credentials, account selection and consent. Its sandboxed renderer has a narrow IPC API, no Node integration, a restrictive CSP, blocked navigation and no remote scripts. IPC accepts only that exact window and its main frame.
- HTTP listens only on IPv4 loopback port 4360. Requests require an exact loopback Host and a canonical HTTPS Origin (HTTP loopback is allowed for development). `null` origins are rejected. CORS never enables cookies. Discovery returns generic service information, not account details.
- Any secure site can request pairing. The native window shows its actual browser Origin prominently; the app name and purpose are untrusted display metadata. A six-digit code helps match requests. No HTTP endpoint approves an app. A custom protocol link only opens the connector.
- The SDK proves possession of a random verifier before receiving a random session token. The token is origin-bound and stored only in the SDK object's memory. Provider tokens never enter the page. App sessions pin an account, provider, model, capabilities, expiration and request allowance. Reconnecting the same origin shares the remaining allowance.
- Revocation, expiry, pause, cancellation and shutdown abort running work. Input size, request history, pairing rate, schema vocabulary, output size, wall time and global concurrency are bounded. The browser can recover request status without automatically repeating a billable operation.
- Direct inference sends no provider tools. The Codex compatibility adapter starts a fixed argument array without a shell, in an empty temporary directory, with user rules/config ignored and tool features disabled. It rejects unexpected operation events. Codex is a larger trust surface than the direct adapter; compatibility with other CLI versions is not established.

## Prompt injection and residual risks

Prompts from apps are intentionally untrusted input to the model. They do not grant OS permissions. Safety depends on the code boundary and absence of local app tools, not on an instruction saying "ignore prompt injection." The remote app must independently validate model output and authorize every tool action. A model-generated tool proposal is not user consent.

An approved site, its scripts, or an XSS in it can consume that site's remaining session budget and see its own prompts and outputs. Origin binding does not protect an origin from itself. Apps must secure their frontend and backend. Request allowances are not dollar or token ceilings. A compromised local process can forge HTTP Origin headers; this design does not defend against malware running as the user. Other local services must not trust CORS as authentication.

The encrypted credential file uses the OS keychain via Electron safeStorage. Disk permissions are owner-only on Unix. The native app requires an available secure storage backend and refuses Linux `basic_text`. Refresh is serialized, rotating tokens are saved together, and sign-out attempts remote revocation before clearing local tokens. Account/client and host mappings remain for returning sign-in. No telemetry, remote crash collector, automatic login startup or background daemon is enabled by default.

The connector retains inference results in RAM for request recovery, and short metadata history for display. The provider applies its own retention policy; `store:false` is not a general zero-retention promise. Codex manages its own authentication. The connector does not read or copy the Codex auth file.

## Reporting and release gates

Before a public repository exists, share a private reproducer directly with the maintainer through an already agreed channel; do not post live credentials or exploit details publicly. When publishing, enable GitHub private vulnerability reporting and add the actual reporting link here.

Public release gates: live fresh-account OAuth acceptance; external security review; signed and notarized installers; Windows/Linux and browser matrix; provider-specific integration eligibility; update signature and rollback design. Never disable browser web security, certificate checks, keychain encryption or native consent to make a demo pass. Dev-only CDP debugging must stay off in packaged builds.
