// v0.3 execution freeze：24 runs 全部完成后生成 execution-freeze-manifest.json（SHA-256 链）。
import { writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const repo = resolve(process.argv[2] ?? '.');
const bench = join(repo, 'tests/PGA_STUDIO_E2E_BENCHMARK_v0_3');
const runsRoot = join(bench, 'runs');
const sha256 = b => createHash('sha256').update(b).digest('hex');
const canonical = v => v && typeof v === 'object'
  ? Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
    : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
  : JSON.stringify(v);

const manifest = JSON.parse(await readFile(join(bench, 'candidate-materials/manifest.json'), 'utf8'));
const matrix = JSON.parse(await readFile(join(bench, 'candidate-materials/planned-matrix.json'), 'utf8'));
const hostState = JSON.parse(await readFile(join(bench, 'results/coordinator/host-state.json'), 'utf8'));
const frozen = JSON.parse(await readFile(join(bench, 'results/protocol-frozen.json'), 'utf8'));

const runs = [];
for (const spec of matrix.runs) {
  const staged = join(runsRoot, spec.runId, 'staged');
  const submission = JSON.parse(await readFile(join(staged, 'final/submission.json'), 'utf8'));
  const finalState = JSON.parse(await readFile(join(staged, 'final/state.json'), 'utf8'));
  const ledger = JSON.parse(await readFile(join(staged, 'ledger.json'), 'utf8'));
  const ctx = hostState.runs[spec.runId] ?? {};
  const renderHash = sha256(canonical({ width: finalState.frame.width, height: finalState.frame.height, rgba: Array.from(finalState.frame.rgba) }));
  const stateHash = sha256(canonical({ anchor: finalState.frame.anchor, attachments: finalState.frame.attachments,
    layers: finalState.layers.map(l => ({ id: l.id, width: l.width, height: l.height,
      rgba: l.rgba.map((v, i) => l.rgba[(i - i % 4) + 3] ? v : 0) })) }));
  runs.push({ runId: spec.runId, task: spec.task, repeat: spec.repeat, arm: spec.arm,
    toolkitHash: manifest.toolkits[spec.arm].sha256, finalSourceHash: submission.sourceHash,
    finalRenderHash: renderHash, semanticStateHash: stateHash,
    submitStatus: submission.status, submitSuccess: submission.submitSuccess === true,
    technicalStatus: submission.technical?.status ?? null,
    candidateCount: ledger.candidates.length, budget: ledger.candidates.length <= 8 ? 'PASS' : 'FAIL',
    modelContextId: ctx.modelContextId ?? null, sessionId: ctx.sessionId ?? null,
    taskExposedAt: ctx.taskExposedAt ?? null, finishedAt: ctx.participantFinished?.finishedAt ?? null,
    imageEvidencePolicy: 'participant prompt 要求 Read PNG；ZCode Read=图像内容块（vision gate 已验证该通道）。逐 run 查看清单由 participant 报告并在 trial observations/ 留档。',
    ledgerSha256: sha256(canonical(ledger)) });
}
const out = { schema: 'pga-e2e-execution-freeze/0.3', frozenAt: new Date().toISOString(),
  protocolFrozenSha256: '426880b66f8b4d98b3ad21d0468e2679d050337407c606cde45461d0f54c8ff5',
  mappingSeed: frozen.mappingSeed, runs };
const bytes = JSON.stringify(out, null, 2) + '\n';
await writeFile(join(bench, 'results/execution-freeze-manifest.json'), bytes, { flag: 'wx' });
console.log(JSON.stringify({ runs: runs.length, executionFreezeSha256: sha256(bytes),
  allSubmitted: runs.every(r => r.submitSuccess), budgetFails: runs.filter(r => r.budget === 'FAIL').length }, null, 1));
