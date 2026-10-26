import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const VERSION = '0.1.0';
export function dataDirectory(env = process.env) {
  const path = env.CHATGPT_MCP_DATA_DIR || join(homedir(), '.chatgpt-subscription-mcp');
  if (!isAbsolute(path)) throw new Error('CHATGPT_MCP_DATA_DIR must be an absolute path.');
  return path;
}

export function codexExecutable() {
  if (process.env.CHATGPT_MCP_CODEX_PATH) {
    const path = process.env.CHATGPT_MCP_CODEX_PATH;
    if (!isAbsolute(path) || !existsSync(path) || /\.(cmd|bat|ps1)$/i.test(path)) {
      throw new Error('CHATGPT_MCP_CODEX_PATH must be an absolute path to a native Codex executable.');
    }
    return path;
  }
  const bundled = join(dirname(fileURLToPath(import.meta.url)), 'vendor', 'bin', process.platform === 'win32' ? 'codex.exe' : 'codex');
  if (existsSync(bundled)) return bundled;
  const require = createRequire(import.meta.url);
  const arch = { x64: 'x86_64', arm64: 'aarch64' }[process.arch];
  const suffix = { win32: 'pc-windows-msvc', darwin: 'apple-darwin', linux: 'unknown-linux-musl' }[process.platform];
  if (!arch || !suffix) throw new Error('Supported systems: Windows, macOS, Linux; x64 or arm64.');
  const root = dirname(require.resolve(`@openai/codex-${process.platform}-${process.arch}/package.json`));
  const path = join(root, 'vendor', `${arch}-${suffix}`, 'bin', process.platform === 'win32' ? 'codex.exe' : 'codex');
  if (!existsSync(path)) throw new Error('Codex binary missing. Run npm ci with optional dependencies enabled.');
  return path;
}

export function subscriptionEnvironment(env = process.env) {
  const clean = { ...env };
  for (const key of Object.keys(clean)) {
    if (/^(OPENAI_API_KEY|CODEX_API_KEY|OPENAI_BASE_URL|OPENAI_ORG_ID|OPENAI_PROJECT_ID|CODEX_THREAD_ID|CODEX_INTERNAL_ORIGINATOR_OVERRIDE)$/i.test(key)) delete clean[key];
  }
  return clean;
}
