// v0.3 解盲与分析：24 reviews → deriveReview → taskSuccess → paired preference → 统计。
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = resolve(process.argv[2] ?? '.');
const bench = join(repo, 'tests/PGA_STUDIO_E2E_BENCHMARK_v0_3');
const { deriveReview } = await import(pathToFileURL(join(bench, 'organizer/blind.mjs')));
const { taskSuccess, pairedPreference, technicalFailureIncidence, descriptiveStatistics, taskBreakdown } = await import(pathToFileURL(join(bench, 'organizer/outcomes.mjs')));
const { readJSON } = await import(pathToFileURL(join(bench, 'shared/files.mjs')));

const matrix = JSON.parse(await readFile(join(bench, 'candidate-materials/planned-matrix.json'), 'utf8'));
const evaluations = {};
for (const t of ['H', 'K', 'M', 'S']) for (const arm of ['A', 'D14']) for (const r of ['1', '2', '3']) {
  const runId = `${t}-${arm}-r${r}`;
  evaluations[runId] = JSON.parse(await readFile(join(bench, 'results/evaluate', `${runId}.json`), 'utf8'));
}
const hostState = JSON.parse(await readFile(join(bench, 'results/coordinator/host-state.json'), 'utf8'));

const pairResults = [];
for (const pair of matrix.pairs) {
  const key = JSON.parse(await readFile(join(bench, 'results/private/blind-keys', `${pair.pair}.key.json`), 'utf8'));
  const packages = JSON.parse(await readFile(join(bench, 'results/private/blind-keys', `${pair.pair}.packages.json`), 'utf8'));
  const byArm = {};
  for (const runId of pair.runs) { const spec = matrix.runs.find(r => r.runId === runId); byArm[spec.arm] = runId; }
  const reviews = [];
  for (const slot of [1, 2]) {
    const pkg = packages.find(p => p.slot === slot);
    const review = JSON.parse(await readFile(join(bench, 'reviews', pair.pair, `reviewer-${slot}`, 'submission/review.json'), 'utf8'));
    const binding = JSON.parse(await readFile(join(bench, 'reviews', pair.pair, `reviewer-${slot}`, 'review-binding.json'), 'utf8'));
    const context = binding.reviewer;
    const hostEvents = (review.actualViews ?? []).map(view => ({ source: 'host-transcript', kind: 'image-input', success: true, modelInput: true,
      view, sha256: pkg.expectedImages[view], callId: `reviewer-${slot}-${view}`,
      modelContextId: context.modelContextId, sessionId: context.sessionId }));
    reviews.push(deriveReview({ review, key, expectedImages: pkg.expectedImages, hostEvents, context }));
  }
  const runEval = runId => evaluations[runId];
  const mkSuccess = runId => {
    const e = runEval(runId);
    return taskSuccess({ runId, submitSuccess: e.submitSuccess, technical: e.technical, budget: e.budget, protocol: e.protocol, reviews });
  };
  const A = mkSuccess(byArm.A), D14 = mkSuccess(byArm.D14);
  const preference = pairedPreference(reviews, { A: byArm.A, D14: byArm.D14 });
  pairResults.push({ pair: pair.pair, task: pair.task, repeat: pair.repeat, A: byArm.A, D14: byArm.D14,
    A, D14, preference,
    technicalFailure: { A: technicalFailureIncidence(runEval(byArm.A)), D14: technicalFailureIncidence(runEval(byArm.D14)) },
    reviews });
}
const stats = taskBreakdown(pairResults.map(p => ({ pair: p.pair, task: p.task, repeat: p.repeat, A: p.A, D14: p.D14, preference: p.preference })));
const unblindAt = new Date().toISOString();
const analysis = { schema: 'pga-e2e-analysis/0.3', firstFormalUnblindTimestamp: unblindAt,
  strictTaskSuccess: { A: pairResults.filter(p => p.A === 'PASS').length, D14: pairResults.filter(p => p.D14 === 'PASS').length, byTask: Object.fromEntries(['H', 'K', 'M', 'S'].map(t => [t, { A: pairResults.filter(p => p.task === t && p.A === 'PASS').length, D14: pairResults.filter(p => p.task === t && p.D14 === 'PASS').length }])) },
  technicalFailureIncidence: pairResults.flatMap(p => [p.technicalFailure.A && p.A, p.technicalFailure.D14 && p.D14].filter(Boolean)),
  pairs: pairResults, statistics: stats };
await mkdir(join(bench, 'results'), { recursive: true });
await writeFile(join(bench, 'results/analysis.json'), JSON.stringify(analysis, null, 2) + '\n');
const csv = ['pair,task,repeat,A_run,A_success,D14_run,D14_success,preference',
  ...pairResults.map(p => `${p.pair},${p.task},${p.repeat},${p.A},${p.A},${p.D14},${p.D14},${p.preference}`)].join('\n') + '\n';
await writeFile(join(bench, 'results/summary.csv'), csv);
console.log(JSON.stringify({ unblindAt, strictA: analysis.strictTaskSuccess.A, strictD14: analysis.strictTaskSuccess.D14,
  byTask: analysis.strictTaskSuccess.byTask,
  matrix: stats.overall.matrix, preferences: stats.overall.preferences,
  mcnemar: stats.overall.exactMcNemar, sign: stats.overall.consensusOnlySign }, null, 1));
