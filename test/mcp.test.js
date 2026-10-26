import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('real stdio MCP handshake, discovery, schema validation and error contract', async t => {
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('../src/cli.js', import.meta.url))], stderr: 'pipe' });
  t.after(async () => { await client.close(); await transport.close(); });
  await client.connect(transport);
  const list = await client.listTools();
  assert.equal(list.tools.length, 7);
  assert.ok(list.tools.some(t => t.name === 'chatgpt_generate_image'));
  const invalid = await client.callTool({ name: 'chatgpt_ask', arguments: { prompt: '' } });
  assert.equal(invalid.isError, true);
  const missing = await client.callTool({ name: 'chatgpt_job', arguments: { job_id: 'nonexistent-test-job' } });
  assert.equal(missing.isError, true);
  assert.match(missing.content[0].text, /Unknown/);
  const traversal = await client.callTool({ name: 'chatgpt_read_image', arguments: { job_id: '../auth', image_id: 'x' } });
  assert.equal(traversal.isError, true);
});
