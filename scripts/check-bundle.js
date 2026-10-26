import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { unzipSync } from 'fflate';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = await mkdtemp(join(tmpdir(), 'bridge-bundle-check-'));
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const bundle = join('dist', `${manifest.name}-${manifest.version}-${process.platform}-${process.arch}.mcpb`);
const bytes = await readFile(bundle);
const expectedHash = (await readFile(`${bundle}.sha256`, 'utf8')).split(' ')[0];
assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedHash);
const files = unzipSync(bytes);
const client = new Client({ name: 'bundle-check', version: '1.0.0' });
let transport;
try {
  for (const [name, content] of Object.entries(files)) {
    assert.ok(!/(^|\/)(auth\.json|\.env[^/]*|\.codex|\.git|inputs|jobs|conversations|generated_images)(\/|$)/.test(name), `Private artifact in bundle: ${name}`);
    assert.ok(!name.includes('..') && !name.startsWith('/'), `Unsafe archive path: ${name}`);
    const path = join(root, 'extension', name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    if (name.startsWith('vendor/') && !name.includes('.')) await chmod(path, 0o755);
  }
  assert.ok(files['licenses/codex-LICENSE.txt']);
  assert.ok(files['licenses/codex-NOTICE.txt']);
  const executable = join(root, 'extension', 'vendor', 'bin', process.platform === 'win32' ? 'codex.exe' : 'codex');
  if (process.platform !== 'win32') await chmod(executable, 0o755);
  const version = spawnSync(executable, ['--version'], { encoding: 'utf8', windowsHide: true });
  assert.equal(version.status, 0, version.stderr);
  assert.match(version.stdout, /0\.164\.0/);
  const authRoot = join(root, 'empty-codex-home');
  await mkdir(authRoot);
  transport = new StdioClientTransport({ command: process.execPath, args: [join(root, 'extension', 'server.js')],
    env: { ...process.env, CODEX_HOME: authRoot, CHATGPT_MCP_DATA_DIR: join(root, 'data'), CHATGPT_MCP_CODEX_PATH: '', OPENAI_API_KEY: '', CODEX_API_KEY: '' }, stderr: 'inherit' });
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 7);
  const result = await client.callTool({ name: 'chatgpt_status', arguments: {} });
  assert.ok(!result.isError, result.content[0].text);
  assert.equal(JSON.parse(result.content[0].text).authenticated, false);
  console.log('Bundle verified outside the repository: checksum, private-file exclusion, native executable, MCP handshake, and signed-out status.');
} finally {
  await client.close();
  await transport?.close();
  // Only remove the exact temporary directory this script created.
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
