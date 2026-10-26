import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { CodexRpc } from './rpc.js';
import { Storage, INLINE_IMAGE_BYTES } from './storage.js';
import { dataDirectory } from './runtime.js';

const INSTRUCTIONS = `You are the text and image assistant behind a local MCP bridge used by a human through Claude.
Answer the user's questions directly. Continue the conversation when there is prior context.
For image generation or editing, use the built-in image generation tool and return real images.
Never substitute SVG, code, ASCII art, or a verbal description for a requested generated image.
Do not use shell, file editing, browser/computer control, skills, plugins, connected MCP tools, or subagents.
Do not read local files or AGENTS.md. Only inspect images explicitly attached to the current request.
If a feature is unavailable or a request is refused, explain that honestly. Do not claim an image was created without an image tool result.`;

export class Bridge {
  constructor({ root = dataDirectory(), rpcFactory = () => new CodexRpc({ cwd: join(root, 'workspace') }), timeoutMs = 10 * 60 * 1000 } = {}) {
    this.storage = new Storage(root);
    this.rpcFactory = rpcFactory;
    this.timeoutMs = timeoutMs;
    this.jobs = new Map();
    this.queue = [];
    this.active = null;
    this.closed = false;
  }
  async connect() {
    if (this.closed) throw new Error('Bridge is shutting down.');
    if (!this.connection) this.connection = this.open().catch(error => { this.connection = null; throw error; });
    return this.connection;
  }
  async open() {
    await this.storage.init();
    const rpc = this.rpcFactory();
    this.rpc = rpc;
    rpc.on('disconnect', () => { if (this.rpc === rpc) this.connection = null; });
    try {
      await rpc.start();
      const { config } = await rpc.request('config/read', { includeLayers: false });
      this.config = {
        'features.shell_tool': false, 'features.apps': false, 'features.plugins': false,
        'features.hooks': false, 'features.multi_agent': false, 'features.browser_use': false,
        'features.computer_use': false, 'features.in_app_browser': false,
        'features.memories': false, 'features.image_generation': true,
        'web_search': 'disabled', 'project_doc_max_bytes': 0,
        'developer_instructions': INSTRUCTIONS, 'notify': [],
      };
      // Config RPC overrides use literal dotted keys, not TOML quoting.
      // Passing the complete nested table also handles names containing dots.
      this.config.mcp_servers = Object.fromEntries(Object.entries(config.mcp_servers || {}).map(([name, settings]) => [name, { ...withoutNulls(settings), enabled: false }]));
      return rpc;
    } catch (error) { rpc.close(); throw error; }
  }
  async status() {
    const rpc = await this.connect();
    const { account } = await rpc.request('account/read', {});
    const authenticated = account?.type === 'chatgpt';
    let models = [], limits = null;
    if (authenticated) {
      models = await this.models();
      try { limits = await rpc.request('account/rateLimits/read', {}); } catch { /* Account may not expose limits. */ }
    }
    return { authenticated, authType: account?.type ?? null, plan: account?.planType ?? null,
      models, limits, dataDirectory: this.storage.root,
      backend: 'Codex app-server with ChatGPT subscription authentication',
      imageGeneration: 'Enabled; availability is confirmed by a successful generation, not by login alone.',
      nextStep: authenticated ? 'Ready. Call chatgpt_ask or chatgpt_generate_image.' : 'Ask the user to sign in using chatgpt_login or npm run login.' };
  }
  async login() {
    const rpc = await this.connect();
    const { account } = await rpc.request('account/read', {});
    if (account?.type === 'chatgpt') return { authenticated: true, message: 'Already signed in with ChatGPT.' };
    const result = await rpc.request('account/login/start', { type: 'chatgpt' });
    return { authenticated: false, authUrl: result.authUrl, message: 'Open this URL in your browser, complete ChatGPT sign-in, then call chatgpt_status. Keep Claude open during sign-in.' };
  }
  async models() {
    const rpc = await this.connect();
    const models = [];
    let cursor;
    do {
      const result = await rpc.request('model/list', { ...(cursor ? { cursor } : {}) });
      models.push(...result.data.map(m => ({ id: m.id, name: m.displayName || m.id, isDefault: m.isDefault })));
      cursor = result.nextCursor;
    } while (cursor);
    return models;
  }
  async submit({ prompt, conversation_id, model, reference_images = [] }, kind = 'text') {
    await this.connect();
    if (this.queue.length >= 16) throw new Error('Queue is full. Wait for existing jobs to finish.');
    const { account } = await this.rpc.request('account/read', {});
    if (account?.type !== 'chatgpt') throw new Error('ChatGPT login required. Use chatgpt_login or npm run login. API-key mode is not supported.');
    if (conversation_id) await this.storage.read('conversations', conversation_id);
    const models = await this.models();
    model ||= process.env.CHATGPT_MCP_MODEL || models.find(m => m.isDefault)?.id || models[0]?.id;
    if (!models.some(m => m.id === model)) throw new Error('Model is not available. Use a model ID from chatgpt_status.');
    const images = [];
    for (const path of reference_images) images.push(await this.storage.stageInput(path));
    if (this.closed) throw new Error('Bridge is shutting down.');
    if (this.queue.length >= 16) throw new Error('Queue is full. Wait for existing jobs to finish.');
    const job = { id: randomUUID(), kind, status: 'queued', createdAt: new Date().toISOString(),
      conversation_id: conversation_id || randomUUID(), model, text: '', images: [], error: null };
    const record = { job, input: { prompt, images }, write: Promise.resolve() };
    await this.storage.write('jobs', job.id, job);
    this.jobs.set(job.id, record);
    this.queue.push(record);
    void this.pump();
    return { ...job, nextStep: 'Call chatgpt_job with this job_id and wait_seconds: 20 until status is completed, failed, or cancelled.', job_id: job.id };
  }
  persist(record) {
    const snapshot = structuredClone(record.job);
    record.write = record.write.catch(() => {}).then(() => this.storage.write('jobs', record.job.id, snapshot));
    return record.write;
  }
  async pump() {
    if (this.active || this.closed) return;
    const record = this.queue.shift();
    if (!record) return;
    this.active = record;
    try { await this.run(record); }
    catch (error) {
      record.job.status = record.cancelled ? 'cancelled' : 'failed';
      record.job.error = error.message;
    } finally {
      record.job.finishedAt = new Date().toISOString();
      try { await this.persist(record); } catch { record.job.error ||= 'Could not persist job result to disk.'; }
      record.input = null;
      this.active = null;
      // Keep bounded memory; completed results remain available on disk.
      for (const [id, item] of this.jobs) {
        if (this.jobs.size <= 100) break;
        if (['completed','failed','cancelled'].includes(item.job.status)) this.jobs.delete(id);
      }
      void this.pump();
    }
  }
  async run(record) {
    const { job, input } = record;
    const rpc = await this.connect();
    if (record.cancelled) { job.status = 'cancelled'; return; }
    const { account } = await rpc.request('account/read', {});
    if (account?.type !== 'chatgpt') throw new Error('ChatGPT login changed. Sign in again; API-key mode is not supported.');
    job.status = 'running';
    await this.persist(record);
    let conversation;
    try { conversation = await this.storage.read('conversations', job.conversation_id); }
    catch (error) { if (!error.message.startsWith('Unknown ')) throw error; }
    const params = { model: job.model, modelProvider: 'openai', cwd: join(this.storage.root, 'workspace'),
      approvalPolicy: 'never', sandbox: 'read-only', config: this.config,
      baseInstructions: INSTRUCTIONS, developerInstructions: INSTRUCTIONS };
    const response = conversation
      ? await rpc.request('thread/resume', { ...params, threadId: conversation.threadId })
      : await rpc.request('thread/start', params);
    record.threadId = response.thread.id;
    await this.storage.write('conversations', job.conversation_id, { threadId: record.threadId });
    if (record.cancelled) { job.status = 'cancelled'; return; }
    const imageItems = new Map(), textItems = new Map();
    let resolveTurn, rejectTurn;
    const finished = new Promise((resolve, reject) => { resolveTurn = resolve; rejectTurn = reject; });
    // Install before turn/start: a short turn can complete before its response.
    const listener = ({ method, params: p }) => {
      if (p?.threadId !== record.threadId) return;
      if (method === 'item/completed') {
        const item = p.item;
        if (item.type === 'agentMessage') textItems.set(item.id, item);
        if (item.type === 'imageGeneration') imageItems.set(item.id, item);
      }
      if (method === 'turn/completed') resolveTurn(p.turn);
    };
    const disconnect = error => rejectTurn(error);
    rpc.on('notification', listener);
    rpc.on('disconnect', disconnect);
    const timeout = setTimeout(() => {
      record.timedOut = true;
      rejectTurn(new Error('Generation timed out. Partial results may exist. Start a new request only after checking this job.'));
    }, this.timeoutMs);
    // Avoid an unhandled rejection if the backend disconnects during turn/start.
    finished.catch(() => {});
    try {
      const prompt = job.kind === 'image'
        ? `Generate or edit an actual image using the built-in image generation tool. Follow this request:\n${input.prompt}` : input.prompt;
      const started = await rpc.request('turn/start', { threadId: record.threadId,
        input: [{ type: 'text', text: prompt }, ...input.images.map(path => ({ type: 'localImage', path }))] });
      record.turnId = started.turn.id;
      if (record.cancelled) await rpc.request('turn/interrupt', { threadId: record.threadId, turnId: record.turnId });
      const turn = await finished;
      for (const item of turn.items || []) {
        if (item.type === 'agentMessage') textItems.set(item.id, item);
        if (item.type === 'imageGeneration') imageItems.set(item.id, item);
      }
      const messages = [...textItems.values()];
      const final = messages.filter(m => m.phase === 'final_answer');
      job.text = (final.length ? final : messages).map(m => m.text).join('\n\n');
      for (const item of imageItems.values()) {
        if (item.status === 'completed' && item.result) job.images.push(await this.storage.saveGenerated(item));
      }
      if (record.cancelled || turn.status === 'interrupted') job.status = 'cancelled';
      else if (turn.status !== 'completed') throw new Error(turn.error?.message || `Turn ended with status ${turn.status}.`);
      else if (job.kind === 'image' && !job.images.length) {
        const failed = [...imageItems.values()].find(i => i.failure);
        throw new Error(failed?.failure?.message || job.text || 'No image was returned. Image generation may be unavailable for this account or request.');
      } else job.status = 'completed';
    } catch (error) {
      record.failed = true;
      throw error;
    } finally {
      clearTimeout(timeout);
      rpc.off('notification', listener);
      rpc.off('disconnect', disconnect);
      if (record.timedOut || record.failed) {
        // Closing the private backend prevents a stalled turn racing the next job.
        try { if (record.turnId) await rpc.request('turn/interrupt', { threadId: record.threadId, turnId: record.turnId }); } catch { /* closed */ }
        rpc.close();
        this.connection = null;
      }
    }
  }
  async getJob(id, waitSeconds = 0) {
    let job;
    const deadline = Date.now() + Math.min(20, Math.max(0, waitSeconds)) * 1000;
    do {
      const live = this.jobs.get(id);
      job = live ? structuredClone(live.job) : await this.storage.read('jobs', id);
      if (!live && ['running','queued'].includes(job.status)) {
        job.status = 'interrupted';
        job.error = 'Bridge restarted before completion. The previous request is not retried automatically.';
      }
      if (!['running','queued'].includes(job.status) || Date.now() >= deadline) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    } while (true);
    return job;
  }
  async cancel(id) {
    const record = this.jobs.get(id);
    if (!record) return this.getJob(id);
    if (!['running','queued'].includes(record.job.status)) return structuredClone(record.job);
    record.cancelled = true;
    if (record !== this.active) {
      this.queue = this.queue.filter(r => r !== record);
      record.job.status = 'cancelled';
      record.input = null;
      await this.persist(record);
    } else if (record.turnId) {
      await this.rpc.request('turn/interrupt', { threadId: record.threadId, turnId: record.turnId });
    }
    return { job_id: id, cancellationRequested: true, status: record.job.status };
  }
  async imageContent(jobId, imageId) {
    const job = await this.getJob(jobId);
    const image = job.images.find(i => i.id === imageId);
    if (!image) throw new Error('Image does not belong to this job.');
    if (image.bytes > INLINE_IMAGE_BYTES) throw new Error(`Image is too large for inline MCP delivery. The full image is saved at ${image.path}`);
    const bytes = await readFile(image.path);
    return { type: 'image', data: bytes.toString('base64'), mimeType: image.mimeType };
  }
  close() {
    this.closed = true;
    for (const record of this.queue) { record.cancelled = true; record.job.status = 'cancelled'; void this.persist(record).catch(() => {}); }
    this.queue = [];
    if (this.active) this.active.cancelled = true;
    this.rpc?.close();
  }
}

function withoutNulls(value) {
  if (Array.isArray(value)) return value.filter(v => v != null).map(withoutNulls);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v != null).map(([k, v]) => [k, withoutNulls(v)]));
  return value;
}
