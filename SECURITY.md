# Security and privacy

This server is intended for a trusted local MCP client running as the same OS user. It exposes no network listener. Do not wrap it in an unauthenticated public service or share a subscription session between unrelated users.

Prompts and explicitly attached reference images go to OpenAI through Codex. Results return to Claude and are stored locally. OpenAI and Anthropic's applicable account data settings still apply. Local data and Codex's normal chat state can include sensitive material. The project has no separate telemetry or analytics service.

The bridge does not read authentication files, extract cookies, log raw backend output, or put credentials in its source/release bundle. Codex owns authentication and token refresh. `OPENAI_API_KEY`, `CODEX_API_KEY`, and API endpoint environment overrides are stripped from the child environment, and non-ChatGPT authentication is rejected before generation. Signing in may affect the same Codex credential store used by other clients.

MCP has seven narrow tools; there is no arbitrary file-read, shell-execution, or raw app-server RPC tool. Reference image paths are explicit input and must be regular PNG/JPEG/WebP files within the size limit. Do not attach files the user has not chosen to share. Output images are accepted from typed image-generation bytes, not from arbitrary paths in model prose. Job and conversation IDs are validated and scoped to bridge storage.

The backend runs with a read-only sandbox, command/browser/computer tools disabled, configured MCP servers disabled per thread, and interactive approval requests rejected. This reduces capabilities; it is not a security sandbox against a malicious local OS user, tampered runtime/config, or compromised dependencies. Treat model responses and generated text as untrusted data.

The repository excludes credentials, local schemas, generated images, build outputs and environment files. Before filing an issue, remove prompts, images, emails, paths, login URLs and tokens from logs. Do not post auth.json. Report sensitive issues using the repository's private vulnerability reporting feature if enabled; otherwise open a minimal issue requesting a private contact channel without exploit details or secrets.

The initial release is experimental. Only the current release receives fixes. Dependency updates should run tests and an opt-in live smoke test before publishing.
