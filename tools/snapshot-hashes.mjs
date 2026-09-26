/**
 * tools/snapshot-hashes.mjs — 记录目录树 sha256（迁移前快照）
 * 用法：node tools/snapshot-hashes.mjs <out.json> <dir1> [dir2...]
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const sha = (b) => createHash('sha256').update(b).digest('hex');
function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile()) yield p;
  }
}

const [out, ...dirs] = process.argv.slice(2);
const record = { migratedAt: new Date().toISOString(), note: '技能备份移出发现目录；迁移后按本记录逐文件比对并保留回滚路径', entries: {} };
for (const d of dirs) {
  const files = {};
  for (const p of walk(d)) files[relative(d, p).replaceAll('\\', '/')] = sha(readFileSync(p));
  record.entries[d] = { fileCount: Object.keys(files).length, files };
  console.log(d, '→', Object.keys(files).length, '个文件已记录哈希');
}
writeFileSync(out, JSON.stringify(record, null, 2) + '\n');
console.log('记录写入', out);
