// v0.3 生成 12 个盲评包（MIRRORED_BALANCE），key 只存协调器私有目录。
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const repo = resolve(process.argv[2] ?? '.');
const bench = join(repo, 'tests/PGA_STUDIO_E2E_BENCHMARK_v0_3');
const runsRoot = join(bench, 'runs');
const reviewsRoot = join(bench, 'reviews');
const privDir = join(bench, 'results/private/blind-keys');
const sha256 = b => createHash('sha256').update(b).digest('hex');
const { buildBlind } = await import(pathToFileURL(join(bench, 'organizer/blind.mjs')));
const frozen = JSON.parse(await readFile(join(bench, 'results/protocol-frozen.json'), 'utf8'));
const manifest = JSON.parse(await readFile(join(bench, 'candidate-materials/manifest.json'), 'utf8'));
const matrix = JSON.parse(await readFile(join(bench, 'candidate-materials/planned-matrix.json'), 'utf8'));

await mkdir(privDir, { recursive: true });
const summary = {};
for (const pair of matrix.pairs) {
  const [runA, runD] = pair.runs; // runs 顺序按矩阵交替，第一个可能是任一臂
  const byArm = {};
  for (const runId of pair.runs) {
    const spec = matrix.runs.find(r => r.runId === runId);
    byArm[spec.arm] = runId;
  }
  const loadState = async runId => {
    const state = JSON.parse(await readFile(join(runsRoot, runId, 'staged/final/state.json'), 'utf8'));
    return { runId, state };
  };
  const candidateA = await loadState(byArm.A);
  const candidateB = await loadState(byArm.D14);
  const baselinePNG = await readFile(join(bench, 'candidate-materials', manifest.tasks[pair.task].common.path, 'baseline.png'));
  const taskText = await readFile(join(bench, 'candidate-materials', manifest.tasks[pair.task].common.path, 'TASK.md'), 'utf8');
  const out = join(reviewsRoot, pair.pair);
  const built = await buildBlind({ out, task: pair.task, repeat: pair.repeat, seed: frozen.mappingSeed, candidateA, candidateB, baselinePNG, taskText });
  await mkdir(join(privDir), { recursive: true });
  await writeFile(join(privDir, `${pair.pair}.key.json`), JSON.stringify(built.key, null, 2) + '\n', { flag: 'wx' });
  await writeFile(join(privDir, `${pair.pair}.packages.json`), JSON.stringify(built.packages, null, 2) + '\n', { flag: 'wx' });
  summary[pair.pair] = { task: pair.task, repeat: pair.repeat, A: byArm.A, D14: byArm.D14,
    reviewer1PayloadSha256: built.packages[0].payload.sha256, reviewer2PayloadSha256: built.packages[1].payload.sha256 };
}
await writeFile(join(bench, 'results/blind-packages-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 1));
