# Contributing

Use Node 22+, `npm ci`, `npm test`, and `npm start`. There is no required provider credential for the unit tests. To test real inference, explicitly connect your own account in the desktop UI. Never add a web-accessible approval hook or store account/session tokens in fixtures.

Core code lives in `src/core/`, adapters in `src/providers/`, trusted desktop UI in `src/desktop/`, and the dependency-free SDK in `packages/browser/`. Reference apps remain under `examples/`. Keep provider-specific concepts out of the app protocol.

Before changing transport or authentication, update the threat model and cover the authority boundary with tests. Before advertising a platform/browser/provider, record actual UI and inference acceptance in `docs/validation.md`, with caveats. Close task-created browser sessions and temporary tunnels after checks.

The macOS build is currently unsigned. Public distribution needs a maintainer-controlled signing identity and notarization, neither of which is bundled here. CI builds unsigned artifacts for review only. No automated publishing or release upload is configured. Before publishing `@bring-ai/browser`, confirm package-name ownership and include the repository's Apache-2.0 license in the package.
