# Third-party components

This bridge's original source is MIT licensed. It is not affiliated with OpenAI or Anthropic. ChatGPT, Codex and Claude are their owners' product names.

- **OpenAI Codex 0.164.0**: Apache-2.0. Unmodified native runtime components are included in platform release bundles. [Source](https://github.com/openai/codex/tree/rust-v0.164.0). See `licenses/codex-LICENSE.txt` and `licenses/codex-NOTICE.txt`.
- **MCP TypeScript SDK**: MIT. [Source](https://github.com/modelcontextprotocol/typescript-sdk).
- **Zod**: MIT. [Source](https://github.com/colinhacks/zod).
- **esbuild**: MIT, used during packaging. [Source](https://github.com/evanw/esbuild).
- **fflate**: MIT, used during packaging. [Source](https://github.com/101arrowz/fflate).

The lockfile records exact dependency versions. Bundle generation includes available LICENSE/NOTICE/COPYING files and package metadata for bundled JavaScript dependencies under `licenses/`. Bundled native components retain their upstream notices. Optional voice runtime files are not distributed by this bridge.
