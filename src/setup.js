import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';

export async function configPaths() {
  if (process.platform === 'darwin') return [join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')];
  if (process.platform !== 'win32') return [join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'Claude', 'claude_desktop_config.json')];
  const paths = [join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json')];
  const packages = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Packages');
  try {
    for (const item of await readdir(packages, { withFileTypes: true })) {
      if (item.isDirectory() && /^Claude_[a-z0-9]+$/i.test(item.name)) paths.push(join(packages, item.name, 'LocalCache', 'Roaming', 'Claude', 'claude_desktop_config.json'));
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return paths;
}

export async function installConfig(path, { entry, command = process.execPath, env = {} }) {
  let config = {}, previous;
  try { previous = await readFile(path, 'utf8'); config = JSON.parse(previous.replace(/^\uFEFF/, '')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error(`Cannot safely read Claude config: ${error.message}`); }
  if (!config || Array.isArray(config) || typeof config !== 'object') throw new Error('Claude config must be a JSON object.');
  if (config.mcpServers && (typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers))) throw new Error('mcpServers must be a JSON object.');
  const server = { command, args: [resolve(entry)], ...(Object.keys(env).length ? { env } : {}) };
  if (JSON.stringify(config.mcpServers?.['chatgpt-subscription']) === JSON.stringify(server)) return { path, changed: false };
  await mkdir(dirname(path), { recursive: true });
  let backup;
  if (previous !== undefined) {
    backup = `${path}.backup-${Date.now()}`;
    await copyFile(path, backup);
  }
  config.mcpServers = { ...config.mcpServers, 'chatgpt-subscription': server };
  await writeFile(path, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  return { path, backup, changed: true };
}
