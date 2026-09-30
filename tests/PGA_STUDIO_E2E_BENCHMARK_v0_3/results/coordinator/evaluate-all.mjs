// v0.3 统一 evaluate：24 runs 全部跑 evaluateTrial + 宿主 protocol 审计，写 results/evaluate/。
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const repo = resolve(process.argv[2] ?? '.');
const bench = join(repo, 'tests/PGA_STUDIO_E2E_BENCHMARK_v0_3');
const runsRoot = join(bench, 'runs');
const outDir = join(bench, 'results/evaluate');
const sha256 = b => createHash('sha256').update(b).digest('hex');
const { evaluateTrial } = await import(pathToFileURL(join(bench, 'organizer/evaluate.mjs')));
const manifest = JSON.parse(await readFile(join(bench, 'candidate-materials/manifest.json'), 'utf8'));

const ACCOUNTED = ['observations/', 'ws/previews/', 'final/', 'candidates/', 'scratch/'];
const { decodePNG } = await import(pathToFileURL(join(bench, 'candidate-materials/shared/src/export/png.js')));
const canonicalAudit = v => v && typeof v === 'object'
  ? Array.isArray(v) ? `[${v.map(canonicalAudit).join(',')}]` : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonicalAudit(v[k])}`).join(',')}}` : JSON.stringify(v);
const renderHashOf = frame => sha256(canonicalAudit({ width: frame.width, height: frame.height, rgba: Array.from(frame.rgba) }));
// staging 期产物白名单：studio create 在建 workspace 时写入的起点预览（native=baseline 渲染，display=其放大版）。
const STAGING_BASELINE_PNGS = {};
for (const t of ['H', 'K', 'M', 'S']) {
  const common = join(bench, 'candidate-materials', manifest.tasks[t].common.path, 'observation');
  STAGING_BASELINE_PNGS[t] = new Set();
  for (const f of ['baseline.native.png', 'baseline.display.png']) {
    const png = decodePNG(await readFile(join(common, f)));
    STAGING_BASELINE_PNGS[t].add(renderHashOf({ width: png.width, height: png.height, rgba: png.rgba }));
  }
}
async function protocolAudit(runId, arm, task) {
  const staged = join(runsRoot, runId, 'staged');
  // staging 白名单：binding.json.stage.files 是 prepareTrial（含 studio create 的起点预览）写入、
  // 每次 launch 由 verifyTrial 哈希校验的载荷；不属于 participant 产生的未入账图像。
  const binding = JSON.parse(await readFile(join(runsRoot, runId, 'binding.json'), 'utf8'));
  const stagingFiles = new Set(Object.keys(binding.stage.files));
  const findings = [];
  const walk = async dir => {
    for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (/\.(png|bmp)$/i.test(e.name)) {
        const rel = relative(staged, p).replaceAll('\\', '/');
        if (rel.startsWith('task/') || rel.startsWith('kit/')) continue;
        if (!ACCOUNTED.some(pre => rel.startsWith(pre)) && !stagingFiles.has(rel)) findings.push(rel);
      }
    }
  };
  await walk(staged);
  return { unaccountedImages: findings, status: findings.length === 0 ? 'PASS' : 'FAIL',
    note: 'binding.json.stage.files 内的图像（含 studio create 起点 preview）为 staging 载荷，非 participant 产物。' };
}

await mkdir(outDir, { recursive: true });
const runs = JSON.parse(await readFile(join(bench, 'candidate-materials/planned-matrix.json'), 'utf8')).runs;
const results = {};
for (const { runId, task, arm } of runs) {
  const trial = join(runsRoot, runId, 'staged');
  const evaluation = await evaluateTrial({ trial, materialRoot: join(bench, 'candidate-materials'), manifest, task, arm });
  const audit = await protocolAudit(runId, arm, task);
  const record = { runId, task, arm, ...evaluation, protocolAudit: audit,
    protocol: audit.status === 'PASS' && evaluation.technical?.status ? 'PASS' : 'FAIL' };
  await writeFile(join(outDir, `${runId}.json`), JSON.stringify(record, null, 2) + '\n');
  results[runId] = { technical: evaluation.technical?.status ?? 'ERROR', budget: evaluation.budget ?? null,
    submitSuccess: evaluation.submitSuccess ?? false, candidateCount: evaluation.metrics?.candidateCount ?? null,
    protocolAudit: audit.status, technicalFailureIncidence: evaluation.technicalFailureIncidence ?? false };
}
await writeFile(join(outDir, 'summary.json'), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 1));
