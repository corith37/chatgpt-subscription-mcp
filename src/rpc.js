import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { codexExecutable, subscriptionEnvironment, VERSION } from './runtime.js';

// This process only speaks the documented local app-server protocol. It never
// reads auth.json, extracts tokens, or calls ChatGPT's private web endpoints.
export class CodexRpc extends EventEmitter {
  constructor({ executable, args, cwd, timeout = 30000 } = {}) {
    super();
    this.options = { executable, args, cwd, timeout };
    this.pending = new Map();
    this.nextId = 1;
    this.closed = false;
  }

  async start() {
    const args = this.options.args || ['app-server', '--listen', 'stdio://',
      '-c', 'model_provider="openai"',
      '-c', 'features.shell_tool=false', '-c', 'features.apps=false',
      '-c', 'features.in_app_browser=false', '-c', 'features.multi_agent=false',
      '-c', 'features.browser_use=false', '-c', 'features.computer_use=false',
      '-c', 'features.hooks=false', '-c', 'features.plugins=false',
      '-c', 'features.code_mode=false', '-c', 'features.code_mode_only=false',
      '-c', 'features.memories=false', '-c', 'project_doc_max_bytes=0',
      '-c', 'features.image_generation=true', '-c', 'web_search="disabled"'];
    this.child = spawn(this.options.executable || codexExecutable(), args, {
      cwd: this.options.cwd, env: subscriptionEnvironment(), windowsHide: true,
      shell: false, stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.on('error', error => this.fail(error));
    this.child.on('exit', (code, signal) => this.fail(new Error(`Codex exited (${code ?? signal}). Run the doctor command to check setup.`)));
    this.child.stdin.on('error', error => this.fail(error));
    // Do not forward backend logs: they can contain prompts or local paths.
    this.child.stderr.resume();
    this.reader = createInterface({ input: this.child.stdout });
    this.reader.on('line', line => {
      try { this.receive(JSON.parse(line)); }
      catch { this.fail(new Error('Invalid JSON from Codex app-server.')); this.close(); }
    });
    const result = await this.request('initialize', {
      clientInfo: { name: 'chatgpt_subscription_mcp', title: 'ChatGPT Subscription MCP', version: VERSION },
      capabilities: { experimentalApi: true },
    });
    this.notify('initialized', {});
    return result;
  }

  receive(message) {
    if (message.id !== undefined && message.method) {
      // Never approve commands, file edits, permissions, or connected-tool calls.
      if (/requestApproval$/.test(message.method)) {
        this.send({ id: message.id, result: { decision: 'decline' } });
      } else {
        this.send({ id: message.id, error: { code: -32601, message: 'This bridge does not support interactive approvals or host tools.' } });
      }
      return;
    }
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message || 'Codex request failed.'));
      else pending.resolve(message.result);
      return;
    }
    if (message.method) this.emit('notification', message);
  }

  send(message) {
    if (this.closed || !this.child?.stdin.writable) throw new Error('Codex connection is closed.');
    this.child.stdin.write(JSON.stringify(message) + '\n');
  }
  notify(method, params) { this.send({ method, params }); }
  request(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex ${method} timed out.`));
      }, this.options.timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  fail(error) {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    if (!this.closed) { this.closed = true; this.emit('disconnect', error); }
  }
  close() {
    this.fail(new Error('Codex connection closed.'));
    this.reader?.close();
    this.child?.stdin.end();
    this.child?.kill();
  }
}
