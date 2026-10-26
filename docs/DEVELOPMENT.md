# Development guide

All bridge source, tests, configuration templates, and packaging scripts live in this repository. No private package registry or maintainer credentials are needed to build it.

## Local setup

Fork and clone the repository, then use Node 22 or later:

```sh
npm ci
npm test
npm audit
```

Tests run against synthetic backend messages and a real local MCP transport. They do not require ChatGPT sign-in. You do not need to run `setup` or alter your Claude configuration to contribute.

## Source map

| Path | Responsibility |
| --- | --- |
| `src/server.js` | MCP tool definitions, input schemas, and result formatting |
| `src/bridge.js` | Authentication checks, conversations, job queue, cancellation, and image results |
| `src/rpc.js` | Codex app-server process and JSON-RPC lifecycle |
| `src/storage.js` | Job/conversation records and image validation/storage |
| `src/runtime.js` | Runtime lookup, environment handling, and version |
| `src/setup.js` | Claude configuration discovery, backups, and installation |
| `src/cli.js` | Serve, doctor, login, and setup commands |
| `test/bridge.test.js` | Fake backend, job/storage/setup tests |
| `test/rpc.test.js`, `test/fixtures/` | Subprocess protocol tests |
| `test/mcp.test.js` | Real stdio MCP handshake and schema/error tests |
| `scripts/smoke.js` | Optional live account check |
| `scripts/bundle.js` | Platform extension and checksum generation |
| `scripts/check-bundle.js` | Extracted-bundle verification outside the checkout |
| `manifest.json` | Claude extension metadata |
| `.github/workflows/ci.yml` | Public cross-platform test and build workflow |

Use Node's test runner for a focused check:

```sh
node --test test/rpc.test.js
node --test test/bridge.test.js
```

For the runtime design and protocol assumptions, read [DESIGN.md](DESIGN.md). Authentication details belong in the official Codex runtime, not in bridge code or test fixtures.

## Optional live development

`npm run doctor` checks the current backend/account setup. `npm run login` starts ChatGPT sign-in. Both use the Codex auth store selected by `CODEX_HOME`, which can also be used by other Codex clients.

Only when you intend to consume your plan limits:

```sh
npm run smoke
npm run smoke -- --image --edit
```

Live results stay in the configured data directory outside the repository. Do not include account credentials, login URLs, private prompts, or images in a PR. If you cannot run live checks, say so; it is not a barrier to submitting a contribution.

## Packaging and licensing

See [RELEASING.md](RELEASING.md) for building and verifying a `.mcpb`. The npm `private: true` field prevents accidental npm registry publication; it does not make this repository or its source private. Distribution currently uses GitHub source and extension releases.

Original bridge code is MIT licensed. The bundled Codex runtime and other dependencies keep their own licenses and public upstream source locations listed in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). OpenAI's hosted service is not shipped as part of this repository.
