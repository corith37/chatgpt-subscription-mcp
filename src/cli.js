#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { Bridge } from './bridge.js';
import { codexExecutable, subscriptionEnvironment } from './runtime.js';
import { configPaths, installConfig } from './setup.js';

async function main() {
  const command = process.argv[2] || 'serve';
  if (command === 'login') {
    const child = spawn(codexExecutable(), ['login'], { env: subscriptionEnvironment(), stdio: 'inherit', shell: false, windowsHide: true });
    await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => { process.exitCode = code || 0; resolve(); }); });
  } else if (command === 'doctor') {
    const bridge = new Bridge();
    try { const status = await bridge.status(); console.log(JSON.stringify(status, null, 2)); if (!status.authenticated) process.exitCode = 1; }
    finally { bridge.close(); }
  } else if (command === 'setup') {
    const index = process.argv.indexOf('--config');
    if (index >= 0 && !process.argv[index + 1]) throw new Error('--config requires a file path.');
    const paths = index >= 0 ? [process.argv[index + 1]] : await configPaths();
    const env = {};
    for (const key of ['CODEX_HOME', 'CHATGPT_MCP_DATA_DIR', 'CHATGPT_MCP_MODEL', 'CHATGPT_MCP_CODEX_PATH']) if (process.env[key]) env[key] = process.env[key];
    for (const path of paths) console.log(JSON.stringify(await installConfig(path, { entry: fileURLToPath(import.meta.url), env }), null, 2));
    console.log('Setup saved. Fully quit and reopen Claude Desktop, then ask it to check chatgpt_status.');
  } else if (command === 'serve') {
    const { server, bridge } = createServer();
    let closing = false;
    const close = async () => {
      if (closing) return;
      closing = true;
      bridge.close();
      await server.close();
    };
    process.once('SIGINT', close);
    process.once('SIGTERM', close);
    process.stdin.once('end', close);
    await server.connect(new StdioServerTransport());
  } else {
    throw new Error('Usage: node src/cli.js [serve|doctor|login|setup [--config PATH]]');
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
