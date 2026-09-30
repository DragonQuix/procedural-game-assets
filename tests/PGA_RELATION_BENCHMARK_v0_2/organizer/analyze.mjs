#!/usr/bin/env node
/** 解盲 + 全量分析：reviewer 隔离校验 → 解盲映射 → 冻结规则聚合 → Go/No-Go。 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashTree, treeHash, sha256 } from '../../../tools/benchmark/payload-gate.mjs';
import { unblindSymbolicPreference } from '../../../tools/benchmark/symbolic-blind.mjs';
import { validateReview } from '../../../tools/benchmark/review.mjs';

const bench = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const protocol = JSON.parse(await readFile(join(bench, 'protocol-frozen.json'), 'utf8'));
const packageManifest = JSON.parse(await readFile(join(bench, 'reviews', 'package-manifest.json'), 'utf8'));

// ---------- 1) reviewer 隔离：输入文件与构建时逐文件一致（双向同规则） ----------
const isolation = { status: 'PASS', pairs: {} };
for (const [pairId, rec] of Object.entries(packageManifest.pairs)) {
  for (const slot of ['reviewer-1', 'reviewer-2']) {
    const now = await hashTree(join(bench, 'reviews', pairId, slot));
    const built = rec.reviewerInputs[slot];
    const inputs = Object.keys(built);
    const mismatch = inputs.filter((f) => now[f] !== built[f]);
    const extra = Object.keys(now).filter((f) => !built[f]);
    const ok = mismatch.length === 0;
    if (!ok) isolation.status = 'FAIL';
    isolation.pairs[`${pairId}/${slot}`] = { inputsChecked: inputs.length, mismatch, extraFiles: extra };
  }
}

// ---------- 2) 解盲 ----------
const firstFormalUnblindTimestamp = new Date().toISOString();
const reviews = {};
for (const pairId of Object.keys(protocol.pairs)) {
  reviews[pairId] = {};
  for (const slot of [1, 2]) {
    const raw = JSON.parse(await readFile(join(bench, 'reviews', pairId, `reviewer-${slot}`, 'review.json'), 'utf8'));
    reviews[pairId][slot] = validateReview(raw);
  }
}
// 映射：pair 的 taskFit / preference → runId
const pairAnalysis = {};
for (const [pairId, pair] of Object.entries(protocol.pairs)) {
  const key = JSON.parse(await readFile(join(bench, 'results', 'blind-keys', `${pairId}.key.json`), 'utf8'));
  const entry = { pairId, X: key.identities.X, Y: key.identities.Y, reviewers: {} };
  for (const slot of [1, 2]) {
    const r = reviews[pairId][slot];
    const prefRun = unblindSymbolicPreference(key, slot, r.pairwiseResult); // X_PREFERRED→X runId 等；NMD/BOTH_NOT_YET/UNVERIFIED→null
    entry.reviewers[slot] = {
      taskFitX: r.candidates.X.taskFit, taskFitY: r.candidates.Y.taskFit,
      pairwiseRaw: r.pairwiseResult, preferenceRun: prefRun, preferenceArm: prefRun ? prefRun.split('-')[1] : null,
      actualViews: r.actualViews, confidence: r.confidence,
    };
  }
  const [r1, r2] = [entry.reviewers[1], entry.reviewers[2]];
  entry.pairVerdict =
    r1.pairwiseRaw === 'UNVERIFIED' || r2.pairwiseRaw === 'UNVERIFIED' ? 'UNVERIFIED'
    : r1.pairwiseRaw === 'BOTH_NOT_YET' && r2.pairwiseRaw === 'BOTH_NOT_YET' ? 'BOTH_NOT_YET'
    : r1.preferenceArm && r1.preferenceArm === r2.preferenceArm ? `CONSENSUS_${r1.preferenceArm}`
    : r1.pairwiseRaw === 'NO_MEANINGFUL_DIFFERENCE' && r2.pairwiseRaw === 'NO_MEANINGFUL_DIFFERENCE' ? 'NO_MEANINGFUL_DIFFERENCE'
    : 'MIXED';
  pairAnalysis[pairId] = entry;
}

// ---------- 3) runVisual（冻结规则） + taskSuccess ----------
const runs = {};
for (const runId of protocol.runOrder) {
  const ev = JSON.parse(await readFile(join(bench, 'results', 'evaluate', `${runId}.json`), 'utf8'));
  const [task, arm, rep] = runId.split('-');
  const pairId = `${task}-r${Number(rep.slice(1))}`;
  const fits = Object.values(pairAnalysis[pairId].reviewers).map((r) => (arm === pairAnalysis[pairId].X.slice(0, 3) === false ? null : null));
  // 该 run 的候选 = pair 中 X 或 Y；取对应 reviewer taskFit
  const isX = pairAnalysis[pairId].X === runId;
  const taskFits = Object.values(pairAnalysis[pairId].reviewers).map((r) => (isX ? r.taskFitX : r.taskFitY));
  let visual = 'UNVERIFIED';
  if (taskFits.some((f) => f === 'UNVERIFIED') || taskFits.length < 2) visual = 'UNVERIFIED';
  else if (taskFits.some((f) => f === 'MEETS')) visual = 'PASS';
  else visual = 'NOT_YET';
  const components = {
    submit: ev.submitSuccess ? 'PASS' : 'FAIL', deterministic: ev.deterministic, mechanical: ev.mechanical,
    protection: ev.protectionStatus, relations: ev.relationsStatus,
    budget: ev.budgetPass ? 'PASS' : 'FAIL', protocol: ev.protocol.pass ? 'PASS' : 'FAIL', visual,
  };
  const statuses = Object.values(components);
  const taskSuccess = statuses.some((s) => ['FAIL', 'REJECTED', 'NOT_YET'].includes(s)) ? 'FAIL'
    : statuses.every((s) => s === 'PASS') ? 'PASS' : 'UNVERIFIED';
  runs[runId] = { ...ev, visual, components, taskSuccess };
}

// ---------- 4) 聚合与 Go/No-Go（冻结条件） ----------
const agg = (arm) => Object.values(runs).filter((r) => r.arm === arm);
const d13 = agg('D13'), d14 = agg('D14');
const sum = (arr, f) => arr.reduce((a, r) => a + f(r), 0);
const median = (arr) => { const v = arr.map((r) => r.counts.candidateCount).sort((a, b) => a - b); return (v[2] + v[3]) / 2; };
const verifiedPairs = Object.values(pairAnalysis).filter((p) => p.pairVerdict !== 'UNVERIFIED');
const meetsOf = (arm) => verifiedPairs.reduce((acc, p) => {
  for (const r of Object.values(p.reviewers)) {
    const fit = (arm === 'D13' ? (p.X.endsWith('-D13-?'.replace('?', '')) || p.X.split('-')[1] === 'D13' ? r.taskFitX : r.taskFitY) : (p.X.split('-')[1] === 'D14' ? r.taskFitX : r.taskFitY));
    if (fit === 'MEETS') acc++;
  }
  return acc;
}, 0);
const consensusD13Pairs = verifiedPairs.filter((p) => p.pairVerdict === 'CONSENSUS_D13').length;
const d14ConsistentNotYet = Object.values(pairAnalysis).filter((p) => {
  const d14IsX = p.X.split('-')[1] === 'D14';
  const fits = Object.values(p.reviewers).map((r) => (d14IsX ? r.taskFitX : r.taskFitY));
  const bothNotYetCandidate = fits.length === 2 && fits.every((f) => f === 'NOT_YET');
  const pairwiseBothNotYet = p.pairVerdict === 'BOTH_NOT_YET';
  return bothNotYetCandidate || pairwiseBothNotYet;
}).length;

const conditions = [
  { id: 1, name: 'D14FinalRequiredRelationViolations', value: sum(d14, (r) => r.finalRequiredRelationViolationCount), rule: '= 0', verdict: sum(d14, (r) => r.finalRequiredRelationViolationCount) === 0 ? 'PASS' : 'FAIL' },
  { id: 2, name: 'D14FinalProtectionViolations', value: sum(d14, (r) => r.finalProtectionViolationCount), rule: '= 0（硬约束）', verdict: sum(d14, (r) => r.finalProtectionViolationCount) === 0 ? 'PASS' : 'FAIL' },
  { id: 3, name: 'D14TaskSuccessMinimum', value: `${d14.filter((r) => r.taskSuccess === 'PASS').length}/6`, rule: '≥ 5/6', verdict: d14.filter((r) => r.taskSuccess === 'PASS').length >= 5 ? 'PASS' : 'FAIL' },
  { id: 4, name: 'ManualCoordinateRepair', value: { D14: sum(d14, (r) => r.counts.manualCoordinateRepairCount), D13: sum(d13, (r) => r.counts.manualCoordinateRepairCount) }, rule: 'D14 < D13', verdict: sum(d14, (r) => r.counts.manualCoordinateRepairCount) < sum(d13, (r) => r.counts.manualCoordinateRepairCount) ? 'PASS' : 'FAIL' },
  { id: 5, name: 'MedianCandidateCount', value: { D14: median(d14), D13: median(d13) }, rule: 'D14 ≤ D13', verdict: median(d14) <= median(d13) ? 'PASS' : 'FAIL' },
  { id: 6, name: 'VisualNonRegression',
    value: { MEETS_D14: meetsOf('D14'), MEETS_D13: meetsOf('D13'), consensusD13Pairs, d14ConsistentNotYet, verifiedPairs: verifiedPairs.length, unverifiedPairs: 6 - verifiedPairs.length },
    rule: 'MEETS_D14 ≥ MEETS_D13 ∧ CONSENSUS_D13 ≤ 1 ∧ 无 D14 一致 NOT_YET；已验证 pair < 4 → INCONCLUSIVE',
    verdict: verifiedPairs.length < 4 ? 'INCONCLUSIVE'
      : (meetsOf('D14') >= meetsOf('D13') && consensusD13Pairs <= 1 && d14ConsistentNotYet === 0) ? 'PASS' : 'FAIL' },
];
const anyFail = conditions.some((c) => c.verdict === 'FAIL');
const anyInconclusive = conditions.some((c) => c.verdict === 'INCONCLUSIVE');
const decision = anyFail ? 'NO-GO' : anyInconclusive ? 'INCONCLUSIVE' : 'GO';

// ---------- 5) 模型一致性 ----------
const modelReports = new Set();
for (const runId of protocol.runOrder) {
  const m = JSON.parse(await readFile(join(bench, 'runs', runId, 'trial', 'staged', 'metadata.json'), 'utf8'));
  modelReports.add(m.modelSelfReport);
}
for (const pairId of Object.keys(protocol.pairs)) for (const slot of [1, 2]) {
  const m = JSON.parse(await readFile(join(bench, 'reviews', pairId, `reviewer-${slot}`, 'metadata.json'), 'utf8'));
  modelReports.add(m.modelSelfReport);
}

// ---------- 6) 结果文件 ----------
await mkdir(join(bench, 'results', 'reviews'), { recursive: true });
for (const [pairId] of Object.entries(protocol.pairs)) {
  for (const slot of [1, 2]) {
    const src = join(bench, 'reviews', pairId, `reviewer-${slot}`);
    await writeFile(join(bench, 'results', 'reviews', `${pairId}-reviewer-${slot}.review.json`), JSON.stringify(reviews[pairId][slot], null, 2) + '\n');
    await writeFile(join(bench, 'results', 'reviews', `${pairId}-reviewer-${slot}.metadata.json`), JSON.stringify(JSON.parse(await readFile(join(src, 'metadata.json'), 'utf8')), null, 2) + '\n');
  }
}
const analysis = {
  schema: 'pga-relation-analysis/1', generatedAt: new Date().toISOString(),
  isolation,
  firstFormalUnblindTimestamp,
  runs: Object.fromEntries(Object.entries(runs).map(([k, v]) => [k, { taskSuccess: v.taskSuccess, visual: v.visual, components: v.components, counts: v.counts, finalRequiredRelationViolationCount: v.finalRequiredRelationViolationCount, finalProtectionViolationCount: v.finalProtectionViolationCount }])),
  pairedResults: Object.fromEntries(Object.entries(protocol.pairs).map(([pid, p]) => {
    const a = runs[p.runA].taskSuccess, b = runs[p.runB].taskSuccess;
    const both = a === 'PASS' && b === 'PASS', neither = a !== 'PASS' && b !== 'PASS';
    const kind = both ? 'both pass' : neither ? 'neither' : `${p.runA.split('-')[1]} only`;
    return [pid, { X: p.runA, Y: p.runB, verdict: pairAnalysis[pid].pairVerdict, pairKind: kind }];
  })),
  primary: {
    taskSuccess: { D13: `${d13.filter((r) => r.taskSuccess === 'PASS').length}/6`, D14: `${d14.filter((r) => r.taskSuccess === 'PASS').length}/6` },
    finalRequiredRelationViolationCount: { D13: sum(d13, (r) => r.finalRequiredRelationViolationCount), D14: sum(d14, (r) => r.finalRequiredRelationViolationCount) },
    manualCoordinateRepairCount: { D13: sum(d13, (r) => r.counts.manualCoordinateRepairCount), D14: sum(d14, (r) => r.counts.manualCoordinateRepairCount) },
  },
  hardConstraint: { finalProtectionViolationCount: { D13: sum(d13, (r) => r.finalProtectionViolationCount), D14: sum(d14, (r) => r.finalProtectionViolationCount) } },
  secondary: {
    candidateCount: { D13: d13.map((r) => r.counts.candidateCount), D14: d14.map((r) => r.counts.candidateCount), median: { D13: median(d13), D14: median(d14) } },
    rejectedOperationCount: { D13: sum(d13, (r) => r.counts.rejectedOperationCount), D14: sum(d14, (r) => r.counts.rejectedOperationCount) },
    semanticTransformCount: { D13: sum(d13, (r) => r.counts.semanticTransformCount), D14: sum(d14, (r) => r.counts.semanticTransformCount) },
    relationAwareTransformCount: { D13: sum(d13, (r) => r.counts.relationAwareTransformCount), D14: sum(d14, (r) => r.counts.relationAwareTransformCount) },
    relationRepairCount: { D13: sum(d13, (r) => r.counts.relationRepairCount), D14: sum(d14, (r) => r.counts.relationRepairCount) },
    validationProbeCount: { D13: sum(d13, (r) => r.counts.validationProbeCount), D14: sum(d14, (r) => r.counts.validationProbeCount) },
    retries: { D13: sum(d13, (r) => r.counts.retries), D14: sum(d14, (r) => r.counts.retries) },
    errors: { D13: sum(d13, (r) => r.counts.errors), D14: sum(d14, (r) => r.counts.errors) },
  },
  visual: { pairVerdicts: Object.fromEntries(Object.entries(pairAnalysis).map(([k, v]) => [k, v.pairVerdict])), conditions: conditions[5].value },
  modelConsistency: { distinctSelfReports: [...modelReports], consistent: modelReports.size === 1 },
  goNoGo: { conditions, decision },
};
await writeFile(join(bench, 'results', 'analysis.json'), JSON.stringify(analysis, null, 2) + '\n');
console.log(JSON.stringify({ isolation: isolation.status, modelConsistency: analysis.modelConsistency, primary: analysis.primary, visualPairVerdicts: analysis.visual.pairVerdicts, pairedResults: analysis.pairedResults, conditions: conditions.map((c) => ({ id: c.id, name: c.name, verdict: c.verdict, value: c.value })), decision }, null, 2));
