import { readdir, readFile, lstat, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { sha256, canonical } from './accounting.mjs';
export async function json(file, value, exclusive = false) { await mkdir(dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: exclusive ? 'wx' : 'w' }); }
export const readJSON = async file => JSON.parse(await readFile(file, 'utf8'));
export async function tree(dir) {
  const files = {};
  async function walk(base, prefix = '') {
    if ((await lstat(base)).isSymbolicLink()) throw new Error('SYMLINK_NOT_ALLOWED');
    for (const e of (await readdir(base, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.isSymbolicLink()) throw new Error('SYMLINK_NOT_ALLOWED');
      if (e.isDirectory()) await walk(join(base, e.name), prefix + e.name + '/');
      else if (e.isFile()) files[prefix + e.name] = sha256(await readFile(join(base, e.name)));
      else throw new Error('NON_FILE_PAYLOAD');
    }
  }
  await walk(dir); return { files, sha256: sha256(canonical(files)) };
}
