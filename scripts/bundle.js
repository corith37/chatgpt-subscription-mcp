import { build } from 'esbuild';
import { zipSync } from 'fflate';
import { mkdir, readFile, writeFile, cp, readdir, stat, copyFile } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { codexExecutable } from '../src/runtime.js';

const target = `${process.platform}-${process.arch}`;
const root = join('dist', target);
await mkdir(root, { recursive: true });
const result = await build({ entryPoints: ['src/cli.js'], outfile: join(root, 'server.js'),
  bundle: true, platform: 'node', format: 'esm', target: 'node22', metafile: true,
  banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' },
});
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
manifest.compatibility.platforms = [process.platform];
manifest.display_name += ` (${target})`;
await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module', name: manifest.name, version: manifest.version }));
for (const file of ['README.md', 'LICENSE', 'SECURITY.md', 'THIRD_PARTY_NOTICES.md']) await copyFile(file, join(root, file));
// Only ship the non-voice native runtime components used by this bridge.
const vendor = dirname(dirname(codexExecutable()));
for (const name of ['bin', 'codex-path']) {
  try { await cp(join(vendor, name), join(root, 'vendor', name), { recursive: true }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
try {
  for (const entry of await readdir(join(vendor, 'codex-resources'), { withFileTypes: true })) {
    if (entry.isFile()) {
      await mkdir(join(root, 'vendor', 'codex-resources'), { recursive: true });
      await copyFile(join(vendor, 'codex-resources', entry.name), join(root, 'vendor', 'codex-resources', entry.name));
    }
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
await cp('licenses', join(root, 'licenses'), { recursive: true });
const packages = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const match = input.replaceAll('\\', '/').match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//);
  if (match) packages.add(match[1]);
}
for (const path of packages) {
  const metadata = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
  const destination = join(root, 'licenses', metadata.name.replaceAll('/', '__'));
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, 'package.json'), JSON.stringify({ name: metadata.name, version: metadata.version, license: metadata.license, repository: metadata.repository }, null, 2));
  for (const name of await readdir(path)) {
    if (/^(licen[cs]e|notice|copying)/i.test(name) && (await stat(join(path, name))).isFile()) await copyFile(join(path, name), join(destination, name));
  }
}
const files = {};
async function collect(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) await collect(child);
    else {
      const info = await stat(child);
      files[relative(root, child).replaceAll('\\', '/')] = [new Uint8Array(await readFile(child)), { os: 3, attrs: (info.mode & 0xffff) << 16 }];
    }
  }
}
await collect(root);
const output = join('dist', `${manifest.name}-${manifest.version}-${target}.mcpb`);
const archive = zipSync(files, { level: 6 });
await writeFile(output, archive);
const digest = createHash('sha256').update(archive).digest('hex');
await writeFile(`${output}.sha256`, `${digest}  ${output.split(/[\\/]/).at(-1)}\n`);
console.log(`Built ${output} (${(archive.length / 1024 / 1024).toFixed(1)} MiB)`);
