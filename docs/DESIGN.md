# Design and feasibility

## Requirements

- Let Claude ask questions and request real generated or edited images.
- Use an eligible ChatGPT subscription, without an OpenAI Platform API key.
- Run locally without leaving a terminal or the ChatGPT desktop application open.
- Publish a reusable repository with repeatable installation, tests, and release packaging.

## Options considered

| Route | Fit | Decision |
| --- | --- | --- |
| OpenAI Images/Responses API | Public programmatic API; separate API authentication/billing | Does not meet the subscription-only requirement |
| Automate ChatGPT web or desktop UI | Tied to UI, login state, downloads and app lifecycle | Avoid the brittle UI dependency |
| Replay private web requests using session cookies | Undocumented authentication/protocol dependency | Do not implement |
| `codex mcp-server` directly | Existing general Codex agent MCP surface | Too broad for focused image results and job management |
| Codex app-server over local stdio | Managed ChatGPT login, conversations, typed image events | Selected; version-pinned and tested |

The implementation is an independent client of a documented local interface, not a general ChatGPT API replacement. Its conversations are Codex threads. There is no promise of unlimited requests, access to every plan/model, web-chat history access, or complete feature parity with ChatGPT.

## Protocol and lifecycle

Claude owns the bridge process via MCP stdio. The bridge lazily spawns a private Codex app-server process with no HTTP listener. It performs `initialize` / `initialized`, checks `account/read`, obtains model choices using `model/list`, then calls `thread/start` or `thread/resume` and `turn/start`. It consumes completion notifications and accepts image bytes only from typed `imageGeneration` items.

MCP submission calls enqueue a job rather than waiting minutes for an image. Poll calls wait at most 20 seconds. Requests are serialized; cancellation uses `turn/interrupt`. A ten-minute turn deadline stops the backend before another job can begin. Disconnection and failures are surfaced, and automatic prompt retries are deliberately absent to avoid duplicate generation and usage.

Only bridge-issued conversation IDs can be resumed. A thread is owned by its local mapping file rather than by a model-supplied arbitrary backend ID. Final results and conversation mappings live outside the repository. Private input images are copied into bridge storage so the turn sees stable reference files.

## Runtime constraints

Native command spawning uses argument arrays with `shell: false` and hidden windows. The runtime is pinned to Codex 0.164.0. A separate source dependency avoids changing a user's global CLI. The release bundle includes that platform's native runtime and license notices.

ChatGPT authentication is checked at submission and again before execution. API credential environment overrides are stripped; API-key sessions are rejected. The bridge delegates credential management to Codex and never reads or publishes auth.json. It uses the user's existing Codex authentication store, so sign-in/logout elsewhere can affect availability.

Shell, browser/computer control, apps, hooks, plugins, subagents, and memory features are disabled for this backend. Existing configured MCP servers are disabled per thread, and jobs use a read-only sandbox. The bridge rejects backend approval requests. It does not expose arbitrary shell, filesystem, or app-server methods through MCP. User/admin Codex configuration still affects runtime initialization; this is not an isolation boundary against a malicious local user or modified Codex executable.

## Verification and boundaries

The initial older Codex runtime advertised a model rejected by the subscription service. Upgrading the project dependency refreshed the available model catalog and resolved the error. The bridge therefore discovers model IDs rather than hardcoding one from documentation.

Windows live testing verified text, continued context, generated image bytes, inline MCP delivery, and reference-image editing. Unit/integration tests cover early notifications, out-of-order RPC responses, approvals, timeout/disconnect behavior, cancellation, API-mode refusal, unknown conversations, traversal rejection, image type checks, setup backup/idempotence, and MCP schema validation. Release CI also checks bundle startup without an account. Cross-platform live sign-in/image availability remains account-dependent.

Potential future work: explicit per-image size/quality controls if exposed by the local backend, compressed inline previews for large images, and cleanup/retention controls. Existing web-chat import and a public multi-user service are outside this design.

## Primary documentation checked on 2026-10-26

- [Codex authentication](https://learn.chatgpt.com/docs/auth): ChatGPT sign-in and local credential management; API-key authentication remains the documented default recommendation for general automation/CI.
- [Codex image generation](https://learn.chatgpt.com/docs/image-generation): built-in images use included Codex limits; eligibility and usage still apply.
- [Codex app-server](https://learn.chatgpt.com/docs/app-server): custom-client protocol, account, thread, turn and notification lifecycle.
- [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server): local stdio transport and tools.
- [Claude local MCP extensions](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop): custom extension installation.
- [MCP bundle manifest](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md): `.mcpb` packaging format.

These sources establish the components' capabilities, not an endorsement or service guarantee for this third-party bridge.
