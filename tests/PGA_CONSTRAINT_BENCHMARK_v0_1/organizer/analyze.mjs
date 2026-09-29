#!/usr/bin/env node
// 统一解盲与分析：validateReview → unblindReview（MIRRORED_BALANCE + host events）→
// 逐 run taskSuccess → §32 汇总 → §33 Go/No-Go/INCONCLUSIVE。
//   node analyze.mjs --runs-dir <runsDir> --reviews-dir <reviewsDir> --results-dir <resultsDir> --trial-map <trial-map.json>
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const self = dirname(fileURLToPath(import.meta.url));
const kit = resolve(self, '..');
const argOf = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const req = (n) => { const v = argOf(n); if (!v) { console.error(`缺少 --${n}`); process.exit(2); } return resolve(v); };

const runsDir = req('runs-dir');
const reviewsDir = req('reviews-dir');
const resultsDir = req('results-dir');
const map = JSON.parse(await readFile(req('trial-map'), 'utf8'));
const protocol = JSON.parse(await readFile(join(kit, 'protocol-frozen.json'), 'utf8'));
const { validateReview, unblindReview, taskSuccess } = await import(pathToFileURL(resolve(kit, '../../tools/benchmark/review.mjs')));

const armOf = (trialId) => map.trials[trialId].arm;
const pairs = [];
for (const task of ['G', 'P']) {
  for (const repeat of [1, 2, 3]) {
    const ids = Object.keys(map.trials).filter((t) => map.trials[t].task === task && Math.floor((Number(t.slice(1)) - 1) / 4) + 1 === repeat).sort();
    pairs.push({ pair: `${task}-r${repeat}`, task, repeat, runs: ids });
  }
}

const perReview = [];
const perRun = {};
for (const p of pairs) {
  const dir = join(reviewsDir, p.pair);
  const key = JSON.parse(await readFile(join(dir, 'key.json'), 'utf8'));
  const taskContract = JSON.parse(await readFile(join(kit, 'materials', p.task, 'task-contract.json')));
  const reviewsForRun = {};
  for (const reviewer of ['reviewer-1', 'reviewer-2']) {
    const review = JSON.parse(await readFile(join(dir, reviewer, 'review.json'), 'utf8'));
    validateReview(review);
    const host = JSON.parse(await readFile(join(dir, reviewer, 'host-events.json'), 'utf8'));
    const derived = unblindReview(key, review, { ...taskContract, hostEvents: host.events });
    perReview.push({ pair: p.pair, reviewer, raw: { pairwiseResult: review.pairwiseResult, actualViews: review.actualViews, confidence: review.confidence, taskFit: { X: review.candidates.X.taskFit, Y: review.candidates.Y.taskFit } }, derived });
    for (const runId of Object.keys(derived.taskFitByRun)) {
      (reviewsForRun[runId] ??= []).push({ reviewerSlot: review.reviewerSlot, visionEvidence: derived.visionEvidence, playbackEvidenceByRun: derived.playbackEvidenceByRun, taskFitByRun: derived.taskFitByRun, pairwiseResult: derived.pairwiseResult, preferredRun: derived.preferredRun });
    }
  }
  for (const runId of p.runs) {
    const ev = JSON.parse(await readFile(join(runsDir, runId, 'evaluate.json'), 'utf8'));
    const technical = ev.deterministic && ev.geometry?.pass && ev.finalProtection?.status === 'PASS' && ev.invalidMaterializedCandidate.count === 0 ? 'PASS' : 'FAIL';
    const protocolStatus = ev.protocol.pass ? 'PASS' : 'FAIL';
    const budget = ev.budget.budgetPass ? 'PASS' : 'FAIL';
    const success = taskSuccess({ submitted: ev.submit.success, technical, protocol: protocolStatus, budget, reviews: reviewsForRun[runId] ?? [], runId });
    perRun[runId] = {
      trialId: runId, task: p.task, repeat: p.repeat, arm: armOf(runId),
      submitted: ev.submit.success, technical, protocol: protocolStatus, budget,
      geometry: ev.geometry, finalProtection: ev.finalProtection?.status ?? null,
      candidateCount: ev.budget.candidateCount, invalidMaterialized: ev.invalidMaterializedCandidate.count,
      rejectedBeforeMaterialization: ev.rejectedBeforeMaterialization.count,
      manualCoordinateRepair: ev.manualCoordinateRepair.count,
      semanticTransform: ev.semanticTransform.count,
      validationProbe: ev.validationProbeCount.count,
      submitSuccess: ev.submit.success,
      reviews: (reviewsForRun[runId] ?? []).map((r) => ({ reviewerSlot: r.reviewerSlot, taskFit: r.taskFitByRun[runId], visionEvidence: r.visionEvidence })),
      taskSuccess: success,
    };
  }
}

// ── §32 汇总 ─────────────────────────────────────────────
const byArm = (arm) => Object.values(perRun).filter((r) => r.arm === arm);
const armStats = {};
for (const arm of ['D12', 'D13']) {
  const runs = byArm(arm);
  const cands = runs.map((r) => r.candidateCount).sort((a, b) => a - b);
  armStats[arm] = {
    taskSuccess: runs.filter((r) => r.taskSuccess === 'PASS').length,
    perRun: Object.fromEntries(runs.map((r) => [r.trialId, r.taskSuccess])),
    finalProtectionViolations: runs.filter((r) => r.finalProtection !== 'PASS').length,
    invalidMaterializedCandidates: runs.reduce((s, r) => s + r.invalidMaterialized, 0),
    invalidIncidenceRuns: runs.filter((r) => r.invalidMaterialized > 0).length,
    rejectedBeforeMaterialization: runs.reduce((s, r) => s + r.rejectedBeforeMaterialization, 0),
    manualCoordinateRepair: runs.reduce((s, r) => s + r.manualCoordinateRepair, 0),
    semanticTransform: runs.reduce((s, r) => s + r.semanticTransform, 0),
    candidateMedian: cands.length % 2 ? cands[(cands.length - 1) / 2] : (cands[cands.length / 2 - 1] + cands[cands.length / 2]) / 2,
    candidateCounts: runs.map((r) => r.candidateCount).sort((a, b) => a - b),
    validationProbes: runs.reduce((s, r) => s + r.validationProbe, 0),
    submitSuccess: runs.filter((r) => r.submitSuccess).length,
  };
}

const pairMatrix = [];
for (const p of pairs) {
  const [d12Run, d13Run] = p.runs; // sorted: 含 D12 的 id 在前（T01<T02 等，映射见 trial-map）
  const a = perRun[d12Run].arm === 'D12' ? d12Run : d13Run;
  const b = perRun[d12Run].arm === 'D12' ? d13Run : d12Run;
  const sa = perRun[a].taskSuccess, sb = perRun[b].taskSuccess;
  const matrix = sa === 'PASS' && sb === 'PASS' ? 'both pass' : sa === 'PASS' ? 'D12 only' : sb === 'PASS' ? 'D13 only' : 'neither';
  // 视觉共识
  const revs = perReview.filter((r) => r.pair === p.pair);
  const prefs = revs.map((r) => r.derived.pairwiseResult);
  const prefArm = revs.map((r) => (r.derived.preferredRun ? armOf(r.derived.preferredRun) : null));
  let visual;
  if (revs.some((r) => r.derived.visionEvidence !== 'CONFIRMED')) visual = 'UNVERIFIED';
  else if (prefs.every((v) => v === 'NO_MEANINGFUL_DIFFERENCE')) visual = 'NO_MEANINGFUL_DIFFERENCE';
  else if (prefs.every((v) => v === 'BOTH_NOT_YET')) visual = 'BOTH_NOT_YET';
  else if (prefArm[0] && prefArm[0] === prefArm[1]) visual = prefArm[0] === 'D12' ? 'CONSENSUS_D12' : 'CONSENSUS_D13';
  else visual = 'MIXED';
  pairMatrix.push({ pair: p.pair, d12: a, d13: b, matrix, visual, reviewers: revs.map((r) => ({ reviewer: r.reviewer, pairwise: r.raw.pairwiseResult, preferredArm: prefArm.shift(), taskFit: { D12: r.derived.taskFitByRun[a], D13: r.derived.taskFitByRun[b] }, visionEvidence: r.derived.visionEvidence })) });
}

// ── §33 Go 判据（冻结 protocol-frozen.go）────────────────
const g = protocol.go;
const goCriteria = [];
goCriteria.push({ id: 'D13FinalProtectionViolations', required: g.D13FinalProtectionViolations, actual: armStats.D13.finalProtectionViolations, verdict: armStats.D13.finalProtectionViolations === 0 ? 'PASS' : 'FAIL' });
goCriteria.push({ id: 'D13TaskSuccessMinimum', required: `>=${g.D13TaskSuccessMinimum}/6`, actual: armStats.D13.taskSuccess, verdict: armStats.D13.taskSuccess >= g.D13TaskSuccessMinimum ? 'PASS' : 'FAIL' });
{
  const d12 = armStats.D12.invalidMaterializedCandidates, d13 = armStats.D13.invalidMaterializedCandidates;
  goCriteria.push({ id: 'invalidRenderedCandidateIncidence', required: g.invalidRenderedCandidateIncidence, actual: { D12: d12, D13: d13 }, verdict: d12 >= 1 ? (d13 < d12 ? 'PASS' : 'FAIL') : 'INCONCLUSIVE' });
}
{
  const d12 = armStats.D12.manualCoordinateRepair, d13 = armStats.D13.manualCoordinateRepair;
  goCriteria.push({ id: 'manualCoordinateRepair', required: g.manualCoordinateRepair, actual: { D12: d12, D13: d13 }, verdict: d12 === 0 ? 'INCONCLUSIVE' : d13 < d12 ? 'PASS' : 'FAIL' });
}
{
  const d12 = armStats.D12.candidateMedian, d13 = armStats.D13.candidateMedian;
  goCriteria.push({ id: 'medianCandidateCount', required: g.medianCandidateCount, actual: { D12: d12, D13: d13 }, verdict: d13 <= d12 ? 'PASS' : 'FAIL' });
}
{
  // visualNonRegression：D13 视觉 MEETS 数不低于 D12；最多 1 对双 reviewer 一致偏好 D12；两任务均无 D13 一致 NOT_YET
  const meets = { D12: 0, D13: 0 };
  for (const r of Object.values(perRun)) {
    const fit = r.reviews.map((v) => v.taskFit);
    for (const f of fit) if (f === 'MEETS') meets[r.arm]++;
  }
  const d12PrefPairs = pairMatrix.filter((p) => p.visual === 'CONSENSUS_D12').length;
  const d13UnanimousNotYet = pairMatrix.filter((p) => p.reviewers.every((r) => r.taskFit.D13 === 'NOT_YET')).length;
  const pass = meets.D13 >= meets.D12 && d12PrefPairs <= 1 && d13UnanimousNotYet === 0;
  goCriteria.push({ id: 'visualNonRegression', required: g.visualNonRegression, actual: { meets: meets, consensusD12Pairs: d12PrefPairs, d13UnanimousNotYetPairs: d13UnanimousNotYet }, verdict: pass ? 'PASS' : 'FAIL' });
}
const overall = goCriteria.some((c) => c.verdict === 'FAIL') ? 'NO-GO' : goCriteria.some((c) => c.verdict === 'INCONCLUSIVE') ? 'INCONCLUSIVE' : 'GO';

const analysis = {
  schema: 'pga-constraint-analysis/1',
  generatedAt: new Date().toISOString(),
  protocolSha256: protocol.draftReference ? undefined : undefined,
  frozenProtocol: 'protocol-frozen.json',
  executionFreeze: 'execution-freeze-manifest.json',
  interventions: 'interventions.md',
  perRun, armStats, pairMatrix, perReview, goCriteria, decision: overall,
};
await mkdir(resultsDir, { recursive: true });
await writeFile(join(resultsDir, 'analysis.json'), JSON.stringify(analysis, null, 2) + '\n');

// summary.csv
const rows = ['trialId,arm,task,repeat,submitSuccess,deterministic,geometryPass,finalProtection,budgetPass,protocolPass,candidateCount,invalidMaterialized,rejectedBeforeMaterialization,manualCoordinateRepair,semanticTransform,validationProbe,taskSuccess'];
for (const r of Object.values(perRun)) {
  rows.push([r.trialId, r.arm, r.task, r.repeat, r.submitSuccess, r.technical === 'PASS' && r.geometry?.pass ? true : false, r.geometry?.pass, r.finalProtection, r.budget, r.protocol, r.candidateCount, r.invalidMaterialized, r.rejectedBeforeMaterialization, r.manualCoordinateRepair, r.semanticTransform, r.validationProbe, r.taskSuccess].join(','));
}
rows.push('');
rows.push('pair,d12Trial,d13Trial,matrix,visual');
for (const p of pairMatrix) rows.push([p.pair, p.d12, p.d13, p.matrix, p.visual].join(','));
await writeFile(join(resultsDir, 'summary.csv'), rows.join('\n') + '\n');

// 归档 12 份原始 review 与 6 个 key（小型文件，入库）
await mkdir(join(resultsDir, 'reviews'), { recursive: true });
await mkdir(join(resultsDir, 'keys'), { recursive: true });
for (const p of pairs) {
  const dir = join(reviewsDir, p.pair);
  for (const reviewer of ['reviewer-1', 'reviewer-2']) {
    await copyFile(join(dir, reviewer, 'review.json'), join(resultsDir, 'reviews', `${p.pair}-${reviewer}.json`));
  }
  await copyFile(join(dir, 'key.json'), join(resultsDir, 'keys', `${p.pair}-key.json`));
}

console.log(JSON.stringify({
  decision: overall,
  goCriteria,
  armStats: {
    D12: { taskSuccess: armStats.D12.taskSuccess, candidates: armStats.D12.candidateCounts, repairs: armStats.D12.manualCoordinateRepair, sem: armStats.D12.semanticTransform, probes: armStats.D12.validationProbes, invalid: armStats.D12.invalidMaterializedCandidates },
    D13: { taskSuccess: armStats.D13.taskSuccess, candidates: armStats.D13.candidateCounts, repairs: armStats.D13.manualCoordinateRepair, sem: armStats.D13.semanticTransform, probes: armStats.D13.validationProbes, invalid: armStats.D13.invalidMaterializedCandidates },
  },
  pairMatrix: pairMatrix.map((p) => ({ pair: p.pair, matrix: p.matrix, visual: p.visual })),
}, null, 1));
