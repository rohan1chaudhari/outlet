# Local protocol v1

Base `http://127.0.0.1:4360`. JSON requests, explicit browser Origin, no cookies. Public websites need HTTPS and browser local-network permission. A permission denial is a recoverable setup state, not a reason to disable web security. No port scan, public relay, inbound tunnel or extension is required.

| Method | Path | Authority | Result |
| --- | --- | --- | --- |
| GET | `/v1/info` | Valid origin | Generic version/transport discovery |
| POST | `/v1/pairings` | Valid origin | Pending pairing, display code and launch URI |
| POST | `/v1/pairings/exchange` | Same origin + verifier proof | 202 pending; 200 app token after native consent |
| POST | `/v1/generate` | Origin + app bearer | SSE started, optional text.delta, completed or failed |
| GET | `/v1/requests/:id` | Same app grant | Retained request status/result |
| DELETE | `/v1/requests/:id` | Same app grant | Cancel running request |
| DELETE | `/v1/session` | Same app grant | Revoke grant and every token sharing it |

Pairing: `{name,purpose,requires,codeChallenge}`. Challenge is base64url SHA-256 of a cryptographically random verifier. Exchange: `{pairingId,codeVerifier}`. Pairings expire in three minutes. The receipt URI contains only the opaque pairing ID, never a verifier or bearer token. Native UI alone approves/denies; there are no provider-management or consent HTTP endpoints.

Generate: `{requestId,messages,attachments?,outputSchema?}`. Roles: user, assistant, developer, system. Text limit 100,000 characters over at most 100 messages. At most three JPEG/PNG/WebP inline images, total base64 length 4,000,000. HTTP body limit 6 MiB. Schema: bounded object with properties/items and primitive constraints; no references, patterns or combinators. Unknown request fields are rejected. Apps cannot supply a command, file path, provider URL, credentials or tool list.

One generation runs at a time; concurrent calls receive `busy`, without a retry. Max duration 120 seconds and max serialized output 300,000 characters. An admitted generation consumes one request, including failure or cancellation. Duplicate IDs within a grant are rejected; check status instead. Result/history is bounded to 128 requests, with completed results retained for about two minutes. A lost stream has an unknown outcome until status is checked. Process restarts discard all grants, tokens and results.

SSE data contains JSON. `completed` includes `{requestId,output,provider,model,remaining,toolCalls:0,usage?}`. Text deltas are provisional; a later provider error must not be displayed as a successful result. `failed` includes `{code,message,requestId,remaining}`. No reasoning traces or credentials are forwarded. Errors before stream admission use JSON `{error:{code,message}}` and an appropriate non-2xx status.

Version 1 provides text, images and JSON responses, not tool execution. Remote tool proposals can be represented using an app-defined response schema. Future transports must preserve equivalent origin identity, consent and cancellation semantics; SDK callers must not depend on Electron or a provider's CLI.
