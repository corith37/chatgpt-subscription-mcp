# Building and releasing

Anyone can build an extension from the public source. Publishing an official release to this repository requires maintainer write access; a fork owner can publish their own build.

## Build on the target platform

Start from a clean checkout of the intended commit with Node 22 or later. Do not reuse a `dist/` directory from an unrelated build: the packaging script collects its platform output directory.

```sh
npm ci
npm test
npm audit
npm run bundle
node scripts/check-bundle.js
```

The bundle contains the bridge, JavaScript dependencies, the current platform's pinned Codex runtime components, and license notices. Output is `dist/chatgpt-subscription-mcp-VERSION-PLATFORM-ARCH.mcpb` plus its `.sha256` file. `check-bundle.js` verifies the checksum, checks for private artifacts, extracts outside the repository, and tests the native runtime and signed-out MCP startup.

Build separately for each supported OS/CPU. The public CI workflow currently builds on Windows, macOS, and Linux runners; each bundle's filename identifies the actual runner architecture. Source support for another architecture is not equivalent to a verified downloadable release.

The lockfile pins dependency resolution. A rebuild is not promised to have an identical checksum: archive timestamps and platform details can differ. Use a release's checksum to verify that release's downloaded bytes.

## Maintainer release checklist

1. Keep versions in `package.json`, `manifest.json`, and `src/runtime.js` in sync. Update the lockfile with `npm install --package-lock-only`. If changing the Codex version, update its notices and the pinned-version assertion in `scripts/check-bundle.js`.
2. Push the intended commit and check every CI job for that exact commit. Review source changes and third-party notices.
3. Record live smoke-test results when performed: platform, account plan, backend version, and features tested. Do not imply that other platforms or accounts were tested.
4. Download the platform artifacts from that CI run and verify each SHA-256 file. Review the release contents for account state and local data.
5. Create a draft GitHub release targeting the tested commit. Upload the platform `.mcpb` files and checksums, then verify all uploads completed.
6. Explain installation, compatibility, known limits, and actual validation in the release notes. Mark experimental releases appropriately, then publish.

Do not replace an already-published release's binaries silently. Ship a new version for changed code or dependencies. Account credentials are never required in CI, release notes, or downloadable assets.
