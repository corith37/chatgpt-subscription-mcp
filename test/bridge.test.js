import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Bridge } from '../src/bridge.js';
import { Storage, imageType, validId } from '../src/storage.js';
import { installConfig } from '../src/setup.js';
import { subscriptionEnvironment } from '../src/runtime.js';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl6sAAAAASUVORK5CYII=';
class FakeRpc extends EventEmitter {
  constructor(mode = 'text') { super(); this.mode = mode; this.calls = []; this.thread = 0; }
  async start() {}
  async request(method, params) {
    this.calls.push({ method, params });
    if (method === 'config/read') return { config: { mcp_servers: { 'server.with.dots': { command: 'test', tool_timeout_sec: null } } } };
    if (method === 'account/read') return { account: { type: this.mode === 'api' ? 'apiKey' : 'chatgpt', planType: 'plus' } };
    if (method === 'account/rateLimits/read') return { rateLimits: null };
    if (method === 'model/list') return { data: [{ id: 'test-model', isDefault: true }] };
    if (method === 'thread/start') return { thread: { id: `thread-${++this.thread}` } };
    if (method === 'thread/resume') return { thread: { id: params.threadId } };
    if (method === 'turn/interrupt') {
      this.emit('notification', { method: 'turn/completed', params: { threadId: params.threadId, turn: { status: 'interrupted' } } });
      return {};
    }
    if (method === 'turn/start') {
      if (this.mode === 'disconnect') { queueMicrotask(() => this.emit('disconnect', new Error('Backend lost'))); }
      else if (this.mode !== 'hang') {
        // Deliberately emit completion before turn/start resolves.
        this.emit('notification', { method: 'item/completed', params: { threadId: params.threadId,
          item: this.mode === 'image' ? { type: 'imageGeneration', id: 'image1', status: 'completed', result: png }
            : { type: 'agentMessage', id: 'answer', phase: 'final_answer', text: 'Hello' } } });
        this.emit('notification', { method: 'turn/completed', params: { threadId: params.threadId, turn: { status: 'completed', items: [] } } });
      }
      return { turn: { id: 'turn1' } };
    }
    throw new Error(`Unexpected method: ${method}`);
  }
  close() { this.emit('disconnect', new Error('Closed')); }
}
async function fixture(t, mode = 'text', timeoutMs = 1000) {
  const root = await mkdtemp(join(tmpdir(), 'chatgpt-mcp-test-'));
  const rpc = new FakeRpc(mode);
  const bridge = new Bridge({ root, rpcFactory: () => rpc, timeoutMs });
  t.after(async () => { bridge.close(); await new Promise(r => setTimeout(r, 30)); await rm(root, { recursive: true, force: true }); });
  return { root, rpc, bridge };
}
async function terminal(bridge, id) {
  for (let i = 0; i < 100; i++) {
    const job = await bridge.getJob(id);
    if (!['queued','running'].includes(job.status)) return job;
    await new Promise(r => setTimeout(r, 10));
  }
  throw new Error('Test job did not finish.');
}

test('handles early completion and resumes only bridge-owned conversations', async t => {
  const { bridge, rpc } = await fixture(t);
  const first = await bridge.submit({ prompt: 'Hello' });
  assert.equal((await terminal(bridge, first.id)).text, 'Hello');
  await assert.rejects(bridge.submit({ prompt: 'x', conversation_id: 'unowned-thread' }), /Unknown/);
  const second = await bridge.submit({ prompt: 'Follow up', conversation_id: first.conversation_id });
  assert.equal((await terminal(bridge, second.id)).status, 'completed');
  assert.ok(rpc.calls.some(c => c.method === 'thread/resume'));
  const start = rpc.calls.find(c => c.method === 'thread/start').params;
  assert.equal(start.sandbox, 'read-only');
  assert.equal(start.config.mcp_servers['server.with.dots'].enabled, false);
  assert.ok(!('tool_timeout_sec' in start.config.mcp_servers['server.with.dots']));
});
test('returns actual image bytes with ownership checks', async t => {
  const { bridge } = await fixture(t, 'image');
  const submitted = await bridge.submit({ prompt: 'Image' }, 'image');
  const job = await terminal(bridge, submitted.id);
  assert.equal(job.status, 'completed');
  const content = await bridge.imageContent(job.id, job.images[0].id);
  assert.equal(content.data, png);
  await assert.rejects(bridge.imageContent(job.id, 'unowned-image'), /does not belong/);
});
test('image request fails honestly when backend only returns text', async t => {
  const { bridge } = await fixture(t);
  const job = await bridge.submit({ prompt: 'Image' }, 'image');
  const done = await terminal(bridge, job.id);
  assert.equal(done.status, 'failed');
  assert.equal(done.text, 'Hello');
});
test('rejects API billing mode and unsupported models', async t => {
  const { bridge } = await fixture(t, 'api');
  await assert.rejects(bridge.submit({ prompt: 'x' }), /ChatGPT login required/);
  const other = await fixture(t);
  await assert.rejects(other.bridge.submit({ prompt: 'x', model: 'made-up' }), /not available/);
});
test('cancels queued and active jobs without starting the queued turn', async t => {
  const { bridge, rpc } = await fixture(t, 'hang');
  const first = await bridge.submit({ prompt: 'first' });
  const second = await bridge.submit({ prompt: 'second' });
  await bridge.cancel(second.id);
  assert.equal((await bridge.getJob(second.id)).status, 'cancelled');
  while (!bridge.active?.turnId) await new Promise(r => setTimeout(r, 5));
  await bridge.cancel(first.id);
  assert.equal((await terminal(bridge, first.id)).status, 'cancelled');
  assert.equal(rpc.calls.filter(c => c.method === 'turn/start').length, 1);
});
test('timeout and disconnect terminate jobs instead of polling forever', async t => {
  const { bridge } = await fixture(t, 'hang', 25);
  const first = await bridge.submit({ prompt: 'x' });
  assert.match((await terminal(bridge, first.id)).error, /timed out/);
  const other = await fixture(t, 'disconnect');
  const second = await other.bridge.submit({ prompt: 'x' });
  assert.match((await terminal(other.bridge, second.id)).error, /Backend lost/);
});
test('restart marks unfinished persisted jobs interrupted without retrying', async t => {
  const { bridge } = await fixture(t);
  await bridge.connect();
  await bridge.storage.write('jobs', 'old-job', { id: 'old-job', status: 'running', images: [] });
  assert.equal((await bridge.getJob('old-job')).status, 'interrupted');
});
test('storage rejects traversal and non-image generated data', async t => {
  const { root } = await fixture(t);
  const storage = new Storage(root);
  await storage.init();
  assert.throws(() => validId('../auth'), /Invalid/);
  assert.throws(() => imageType(Buffer.from('secret')), /PNG/);
  await assert.rejects(storage.saveGenerated({ result: Buffer.from('secret').toString('base64') }), /PNG/);
  await assert.rejects(storage.saveGenerated({ savedPath: '/etc/passwd' }), /did not return image bytes/);
  await assert.rejects(storage.stageInput('relative.png'), /absolute/);
});
test('setup preserves unrelated config, backs up changes, and is idempotent', async t => {
  const { root } = await fixture(t);
  const path = join(root, 'claude.json');
  const original = { preferences: { theme: 'dark' }, mcpServers: { existing: { command: 'existing' } } };
  await writeFile(path, JSON.stringify(original));
  const result = await installConfig(path, { entry: join(root, 'server.js') });
  assert.deepEqual(JSON.parse(await readFile(result.backup, 'utf8')), original);
  const updated = JSON.parse(await readFile(path, 'utf8'));
  assert.deepEqual(updated.mcpServers.existing, original.mcpServers.existing);
  assert.deepEqual(updated.preferences, original.preferences);
  assert.equal((await installConfig(path, { entry: join(root, 'server.js') })).changed, false);
  await writeFile(path, 'invalid');
  await assert.rejects(installConfig(path, { entry: join(root, 'server.js') }), /Cannot safely read/);
  assert.equal(await readFile(path, 'utf8'), 'invalid');
});
test('removes API credential overrides from child environment without changing parent', () => {
  const env = { OPENAI_API_KEY: 'example', CODEX_API_KEY: 'example', PATH: 'path', CODEX_HOME: '/auth' };
  assert.deepEqual(subscriptionEnvironment(env), { PATH: 'path', CODEX_HOME: '/auth' });
  assert.equal(env.OPENAI_API_KEY, 'example');
});
