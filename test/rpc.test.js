import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { CodexRpc } from '../src/rpc.js';

test('correlates out-of-order RPC responses, declines approvals, times out requests', async t => {
  const rpc = new CodexRpc({ executable: process.execPath,
    args: [fileURLToPath(new URL('./fixtures/rpc-child.js', import.meta.url))], timeout: 3000 });
  t.after(() => rpc.close());
  assert.deepEqual(await rpc.start(), { ready: true });
  const results = await Promise.all([rpc.request('echo', { n: 1 }), rpc.request('echo', { n: 2 })]);
  assert.deepEqual(results, [{ n: 1 }, { n: 2 }]);
  const notification = once(rpc, 'notification');
  await rpc.request('askApproval');
  assert.equal((await notification)[0].params.decision, 'decline');
  rpc.options.timeout = 50;
  await assert.rejects(rpc.request('neverAnswers'), /timed out/);
  assert.equal(rpc.pending.size, 0);
});
test('spawn failure rejects initialization promptly', async () => {
  const rpc = new CodexRpc({ executable: 'nonexistent-codex-test-executable', timeout: 100 });
  try { await assert.rejects(rpc.start(), /ENOENT/); } finally { rpc.close(); }
});
