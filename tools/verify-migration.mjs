/**
 * tools/verify-migration.mjs — 按迁移前快照逐文件比对（只读）
 * 用法：node tools/verify-migration.mjs <record.json> <旧路径=新路径> [...]
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const sha = (b) => createHash('sha256').update(b).digest('hex');
function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile()) yield p;
  }
}

const [recordPath, ...pairs] = process.argv.slice(2);
const record = JSON.parse(readFileSync(recordPath, 'utf8'));
let bad = 0;
for (const pair of pairs) {
  const [oldDir, newDir] = pair.split('=');
  const expected = record.entries[oldDir];
  if (!expected) {
    console.error(`记录中没有 ${oldDir}`);
    bad++;
    continue;
  }
  const actual = {};
  for (const p of walk(newDir)) actual[relative(newDir, p).replaceAll('\\', '/')] = sha(readFileSync(p));
  const missing = Object.keys(expected.files).filter((f) => !(f in actual));
  const extra = Object.keys(actual).filter((f) => !(f in expected.files));
  const changed = Object.keys(expected.files).filter((f) => actual[f] && actual[f] !== expected.files[f]);
  if (missing.length || extra.length || changed.length) {
    bad++;
    console.error(`✗ ${newDir}：缺失 ${missing.length}，多出 ${extra.length}，改动 ${changed.length}`);
  } else {
    console.log(`✓ ${newDir}：${expected.fileCount} 个文件哈希一致`);
  }
}
process.exit(bad ? 3 : 0);
