# Contributing

Contributions to code, documentation, accessibility, setup, testing, and design are welcome. You do not need a paid account or an API key to run the automated tests or make most improvements.

## Start here

1. Read the [roadmap](ROADMAP.md) for concrete ways to make the product easier to use.
2. Search existing [issues](https://github.com/corith37/chatgpt-subscription-mcp/issues) and [pull requests](https://github.com/corith37/chatgpt-subscription-mcp/pulls) for related work. For larger changes, discuss the user problem first in an issue or [Discussion](https://github.com/corith37/chatgpt-subscription-mcp/discussions).
3. Fork the repository, clone your fork, and create a branch for your change. Small fixes and documentation improvements can go straight to a PR.
4. Install Node 22 or later and run `npm ci`. See [DEVELOPMENT.md](docs/DEVELOPMENT.md) for the source map and test commands.
5. Make a focused change, document any user-visible behavior, and run the checks relevant to it.
6. Open a PR against `main` with the problem, proposed behavior, validation, and any remaining limitations. Draft PRs are welcome.

## Checks

For runtime changes, run `npm test` and `npm audit`. Tests must not require credentials or consume subscription quota. Add focused tests for meaningful changes to protocol, lifecycle, validation, or setup behavior. Documentation-only changes need a check of their links and instructions, not new runtime tests.

For packaging changes, also run `npm run bundle` followed by `node scripts/check-bundle.js`. CI runs tests on Node 22 and 24 across Windows, macOS, and Linux, plus platform bundle checks. Report which OS/architecture you actually tested; do not imply that mocked tests prove live service availability.

`npm run smoke -- --image --edit` is an optional live check that consumes your plan limits. A contributor without account access can mark it as not run. Never add credentials to CI or fixtures. Use synthetic protocol messages in tests.

## Design expectations

- Keep the no-API-key, local-first setup understandable. Preserve existing Claude settings and explain restart/sign-in requirements.
- Keep stdout reserved for MCP. Do not print prompts, image bytes, tokens, or raw backend logs as diagnostics.
- Preserve narrow tool access, authentication checks, cancellation, and honest failure reporting. Do not add silent retries that can consume quota twice.
- Keep the Codex dependency pinned. For an upgrade, inspect the new version's generated app-server schema, review protocol changes, and record live verification when available.
- Keep dependencies and license notices inspectable. Do not commit generated schemas, bundles, account state, or private images.

Contributions are made under this repository's MIT license; third-party files retain their own notices. No separate contributor license agreement is required. Follow the [Code of Conduct](CODE_OF_CONDUCT.md). See [GOVERNANCE.md](GOVERNANCE.md) for review and release responsibilities and [SECURITY.md](SECURITY.md) for private vulnerability reporting.
