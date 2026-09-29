#!/usr/bin/env node
// 组装单个 trial 目录（正式 run 前由协调器调用）：
//   node setup-trial.mjs --trial-id T01 --task G --arm D12 --runs-dir <runsDir> --kit-source <frozen arm> --shared-kit <frozen D13>
// trial 目录内不出现 arm 标签；arm 映射只写 organizer/trial-map.json（协调员区域）。
import { mkdir, copyFile, readFile, writeFile, access } from 'node:fs/promises';
import { cp } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const self = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(self, '..');
const argOf = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const req = (n) => { const v = argOf(n); if (!v) { console.error(`缺少 --${n}`); process.exit(2); } return resolve(v); };

const trialId = argOf('trial-id');
const task = argOf('task');
const arm = argOf('arm');
if (!trialId || !task || !arm) { console.error('缺少 --trial-id/--task/--arm'); process.exit(2); }
if (!['G', 'P'].includes(task) || !['D12', 'D13'].includes(arm)) { console.error('task/arm 非法'); process.exit(2); }
const runsDir = req('runs-dir');
const sharedKit = req('shared-kit');

// kit 目录以 preparation-manifest 为准（toolkits[arm].path），不用 arm 名直接拼目录——
// frozen/ 下并存多个历史快照（D13、D13-0.7.0、D13-0.7.0-4cd1666），拼错会绑到废弃载荷。
const manifest = JSON.parse(await readFile(join(kitRoot, 'preparation-manifest.json'), 'utf8'));
const manifestArm = manifest.toolkits[arm];
const kitSource = resolve(join(kitRoot, 'frozen', manifestArm.path ?? arm));

const trialDir = join(runsDir, trialId);
try { await access(trialDir); console.error(`trial 目录已存在，拒绝覆盖：${trialDir}`); process.exit(4); } catch {}

await mkdir(join(trialDir, 'kit'), { recursive: true });
await cp(kitSource, join(trialDir, 'kit'), { recursive: true, errorOnExist: true });
// 装包后机械核验：与 manifest 逐文件一致才允许开跑。
{
  const expected = manifestArm.files;
  const actual = {};
  const walk = async (dir, prefix) => {
    const { readdir } = await import('node:fs/promises');
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(p, rel);
      else actual[rel] = createHash('sha256').update(await readFile(p)).digest('hex');
    }
  };
  await walk(join(trialDir, 'kit'), '');
  const problems = [];
  for (const [f, h] of Object.entries(expected)) {
    if (actual[f] !== h) problems.push(f);
  }
  const extra = Object.keys(actual).filter((f) => !expected[f] && !f.startsWith('observe-shared/'));
  if (problems.length || extra.length) {
    console.error(JSON.stringify({ error: 'KIT_COPY_MISMATCH', missingOrChanged: problems, unexpected: extra }));
    process.exit(3);
  }
}
await cp(join(sharedKit, 'src', 'core'), join(trialDir, 'kit', 'observe-shared', 'src', 'core'), { recursive: true, errorOnExist: true });
await cp(join(sharedKit, 'src', 'observe'), join(trialDir, 'kit', 'observe-shared', 'src', 'observe'), { recursive: true, errorOnExist: true });
for (const [src, dst] of [
  [join(kitRoot, 'materials', task, 'task-contract.json'), join(trialDir, 'task-contract.json')],
  [join(kitRoot, 'materials', task, 'baseline.native.png'), join(trialDir, 'baseline.native.png')],
  [join(kitRoot, 'materials', task, `${arm}.studio.json`), join(trialDir, 'start.studio.json')],
  [join(self, 'trial-observe.mjs'), join(trialDir, 'observe.mjs')],
]) await copyFile(src, dst);

await writeFile(join(trialDir, 'trial.json'), JSON.stringify({
  schema: 'pga-trial/1', trialId, task, candidateBudget: 6,
  workspace: './ws', submitDir: './submit', observationDir: './observation',
  kit: './kit', startDoc: './start.studio.json',
}, null, 2) + '\n');

const mapFile = join(self, 'trial-map.json');
let map = { schema: 'pga-trial-map/1', sharedKit, trials: {} };
try { map = JSON.parse(await readFile(mapFile, 'utf8')); } catch {}
map.sharedKit = sharedKit;
map.trials[trialId] = { arm, task, kitDir: join(trialDir, 'kit'), createdAt: new Date().toISOString() };
await writeFile(mapFile, JSON.stringify(map, null, 2) + '\n');
console.log(JSON.stringify({ ok: true, trialId, task, trialDir }));
