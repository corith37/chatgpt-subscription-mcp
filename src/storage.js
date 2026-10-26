import { mkdir, readFile, writeFile, rename, stat, realpath } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const INLINE_IMAGE_BYTES = 4 * 1024 * 1024;
const ID = /^[a-zA-Z0-9_-]{1,100}$/;
export function validId(id) {
  if (typeof id !== 'string' || !ID.test(id)) throw new Error('Invalid identifier.');
  return id;
}
export function imageType(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { mime: 'image/png', ext: 'png' };
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { mime: 'image/jpeg', ext: 'jpg' };
  if (bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  throw new Error('Image must contain PNG, JPEG, or WebP data.');
}
export async function readImage(path) {
  if (!isAbsolute(path)) throw new Error('Reference image paths must be absolute.');
  const resolved = await realpath(path);
  const info = await stat(resolved);
  if (!info.isFile() || info.size > MAX_IMAGE_BYTES) throw new Error('Image must be a regular file of at most 20 MiB.');
  const bytes = await readFile(resolved);
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('Image exceeds 20 MiB.');
  return { bytes, ...imageType(bytes) };
}

export class Storage {
  constructor(root) { this.root = root; }
  async init() {
    for (const name of ['jobs', 'conversations', 'images', 'inputs', 'workspace']) {
      await mkdir(join(this.root, name), { recursive: true, mode: 0o700 });
    }
  }
  async write(kind, id, value) {
    const path = join(this.root, kind, `${validId(id)}.json`);
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
    await rename(temporary, path);
  }
  async read(kind, id) {
    try { return JSON.parse(await readFile(join(this.root, kind, `${validId(id)}.json`), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') throw new Error(`Unknown ${kind} ID. Use an ID returned by this bridge.`); throw error; }
  }
  async stageInput(path) {
    const { bytes, ext } = await readImage(path);
    const destination = join(this.root, 'inputs', `${randomUUID()}.${ext}`);
    await writeFile(destination, bytes, { mode: 0o600 });
    return destination;
  }
  async saveGenerated(item) {
    // Only consume typed image-generation results, never paths guessed from an
    // assistant message. Prefer the bytes, avoiding an arbitrary file read.
    let bytes;
    if (item.result) {
      let raw = item.result;
      if (raw.startsWith('data:')) raw = raw.slice(raw.indexOf(',') + 1);
      if (raw.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 8 || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw)) throw new Error('Invalid or oversized generated image.');
      bytes = Buffer.from(raw, 'base64');
    } else {
      throw new Error('Codex did not return image bytes. Update the bridge; saved paths are not trusted as image data.');
    }
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error('Generated image exceeds 20 MiB.');
    const { mime, ext } = imageType(bytes);
    const id = randomUUID();
    const path = join(this.root, 'images', `${id}.${ext}`);
    await writeFile(path, bytes, { mode: 0o600 });
    return { id, path, mimeType: mime, bytes: bytes.length, revisedPrompt: item.revisedPrompt || null };
  }
}
