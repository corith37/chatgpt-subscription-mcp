// Opt-in live test. Uses a small amount of the signed-in account's plan limits.
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

const client = new Client({ name: 'bridge-smoke-test', version: '1.0.0' });
const entry = process.env.BRIDGE_SMOKE_ENTRY || fileURLToPath(new URL('../src/cli.js', import.meta.url));
const transport = new StdioClientTransport({ command: process.execPath, args: [entry], stderr: 'inherit' });
async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.ok(!result.isError, result.content?.[0]?.text);
  return result;
}
async function wait(start) {
  const { job_id } = JSON.parse(start.content[0].text);
  for (;;) {
    const result = await call('chatgpt_job', { job_id, wait_seconds: 20 });
    const job = JSON.parse(result.content[0].text);
    console.log(JSON.stringify({ job: job.id, status: job.status, images: job.images.length }));
    if (!['queued', 'running'].includes(job.status)) {
      assert.equal(job.status, 'completed', job.error || job.text);
      return { job, result };
    }
  }
}
try {
  await client.connect(transport);
  console.log('tools:', (await client.listTools()).tools.map(t => t.name).join(', '));
  const status = JSON.parse((await call('chatgpt_status')).content[0].text);
  assert.equal(status.authenticated, true);
  console.log('Subscription login verified.');
  const { job } = await wait(await call('chatgpt_ask', { prompt: 'Remember the secret test word ORCHID. Reply exactly BRIDGE_OK.' }));
  assert.match(job.text, /BRIDGE_OK/);
  const followup = await wait(await call('chatgpt_ask', { conversation_id: job.conversation_id, prompt: 'What was the test word? Reply with that word only.' }));
  assert.match(followup.job.text, /ORCHID/);
  if (process.argv.includes('--image')) {
    const image = await wait(await call('chatgpt_generate_image', { prompt: 'Generate a square minimalist image of a single orange triangle on a plain white background. No text.' }));
    assert.ok(image.job.images.length);
    assert.ok(image.result.content.some(c => c.type === 'image'));
    const data = await call('chatgpt_read_image', { job_id: image.job.id, image_id: image.job.images[0].id });
    assert.equal(data.content[0].type, 'image');
    console.log('Image saved:', image.job.images[0].path);
    if (process.argv.includes('--edit')) {
      const edit = await wait(await call('chatgpt_generate_image', {
        prompt: 'Change the orange triangle to green. Keep the white background and composition.',
        reference_images: [image.job.images[0].path],
      }));
      assert.ok(edit.job.images.length);
      console.log('Edited image saved:', edit.job.images[0].path);
    }
  }
  console.log('Live MCP smoke test passed.');
} finally { await client.close(); await transport.close(); }
