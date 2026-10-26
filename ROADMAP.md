# Community roadmap

The goal is to make the path from installing the extension to receiving an image in Claude feel straightforward and reliable. These are proposed improvements, not shipped features or promised delivery dates. Check existing issues and discuss scope before starting a large change.

## Good starting points

| Improvement | Where to start | What a useful contribution demonstrates |
| --- | --- | --- |
| Clearer setup and restart help | `src/setup.js`, `README.md`, setup tests in `test/bridge.test.js` | Explains the next user action without exposing private config; preserves existing MCP entries |
| More useful signed-out and expired-login errors | `src/bridge.js`, `src/server.js`, fake RPC tests | Distinguishes sign-in from model/usage errors and offers a specific next step |
| A platform troubleshooting guide | `docs/`, `README.md` | Reproducible steps with OS, CPU, Node, Claude, and bridge versions; sanitized evidence |
| Additional file validation cases | `src/storage.js`, `test/bridge.test.js` | Covers a realistic malformed, missing, or oversized image without reading private files |
| A clearer image-editing walkthrough | `README.md`, `docs/` | Shows how to make a reference image available locally and retrieve the edited result |

## Larger proposals

- **Smoother onboarding:** design a guided installation/sign-in flow with useful progress and an explicit success check. Preserve the official login flow and existing local configuration.
- **Large image previews:** return a small preview inline while preserving the original image on disk. Document dependency size, supported formats, and memory limits.
- **Storage controls:** let users inspect and clean up old jobs and copied reference images. Define confirmation and retention behavior before implementing deletion.
- **More release architectures:** add tested Windows ARM64, Intel macOS, and Linux ARM64 bundles where runners and upstream binaries support them.
- **Resilient jobs:** improve progress and recovery after a restart without silently resubmitting requests or consuming duplicate quota.
- **Contributor-friendly backend fixtures:** expand synthetic RPC fixtures to cover upstream protocol changes without requiring an OpenAI account.

## How to propose work

Open a [feature proposal](https://github.com/corith37/chatgpt-subscription-mcp/issues/new?template=feature_request.md) or start a [Discussion](https://github.com/corith37/chatgpt-subscription-mcp/discussions). Describe the current friction, the desired user experience, and how to verify the improvement. A maintainer can help split larger proposals into focused PRs.

Subscription limits, service eligibility, and OpenAI's hosted model implementation are outside this repository's control. Changes should make those boundaries clearer rather than promise access the bridge cannot provide.
