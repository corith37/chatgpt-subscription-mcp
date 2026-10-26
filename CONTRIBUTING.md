# Contributing

Use Node 22 or later. Run `npm ci`, `npm test`, and `npm audit` before submitting changes. Tests must not require credentials or use live subscription quota. Add focused tests for protocol, lifecycle and validation behavior when modifying those areas.

`npm run smoke -- --image --edit` is an explicit, optional live check that consumes plan limits. Never add account credentials to CI or fixtures. Use sanitized, synthetic protocol messages in tests.

Keep the Codex dependency pinned. To upgrade, inspect `codex app-server generate-ts` for the new version, review protocol changes, and verify text, resume, image, and editing behavior. Generated schemas are local inspection artifacts, not committed source.

`npm run bundle` makes the current platform's extension. Keep license notices for bundled dependencies. Review every release asset to ensure it contains no account state or local outputs.
