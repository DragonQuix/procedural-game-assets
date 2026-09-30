#!/usr/bin/env node
/** 归档前机械核验：reviewer actualViews 声称的 sha256 与包内文件实测一致；生成 metrics.csv。 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { sha256 } from '../../../tools/benchmark/payload-gate.mjs';

const bench = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const protocol = JSON.parse(await readFile(join(bench, 'protocol-frozen.json'), 'utf8'));
const evidence = {};
for (const pairId of Object.keys(protocol.pairs)) {
  for (const slot of [1, 2]) {
    const dir = join(bench, 'reviews', pairId, `reviewer-${slot}`);
    const review = JSON.parse(await readFile(join(dir, 'review.json'), 'utf8'));
    const claimed = {};
    for (const s of review.actualViews) {
      const m = s.match(/^(X\.png|Y\.png) sha256[=:]\s*([0-9a-f]{64})$/);
      if (m) claimed[m[1]] = m[2];
    }
    const actual = {};
    for (const label of ['X.png', 'Y.png']) actual[label] = createHash('sha256').update(await readFile(join(dir, label))).digest('hex');
    const match = Object.keys(claimed).length === 2 && Object.entries(claimed).every(([f, h]) => actual[f] === h);
    evidence[`${pairId}/reviewer-${slot}`] = { claimedViews: Object.keys(claimed).length, hashMatch: match };
    if (!match) evidence[`${pairId}/reviewer-${slot}`].detail = { claimed, actual };
  }
}
const allMatch = Object.values(evidence).every((e) => e.hashMatch);

// metrics.csv
const analysis = JSON.parse(await readFile(join(bench, 'results', 'analysis.json'), 'utf8'));
const rows = ['runId,task,arm,taskSuccess,visual,mechanical,deterministic,protection,relations,finalRequiredRelationViolationCount,finalProtectionViolationCount,candidateCount,manualCoordinateRepairCount,semanticTransformCount,relationAwareTransformCount,relationRepairCount,validationProbeCount,rejectedOperationCount,retries,errors,budgetPass,protocolPass'];
for (const runId of protocol.runOrder) {
  const ev = JSON.parse(await readFile(join(bench, 'results', 'evaluate', `${runId}.json`), 'utf8'));
  const a = analysis.runs[runId], c = ev.counts;
  rows.push([runId, ev.task, ev.arm, a.taskSuccess, a.visual, ev.mechanical, ev.deterministic, ev.protectionStatus, ev.relationsStatus,
    ev.finalRequiredRelationViolationCount, ev.finalProtectionViolationCount, c.candidateCount, c.manualCoordinateRepairCount,
    c.semanticTransformCount, c.relationAwareTransformCount, c.relationRepairCount, c.validationProbeCount,
    c.rejectedOperationCount, c.retries, c.errors, ev.budgetPass, ev.protocol.pass].join(','));
}
await mkdir(join(bench, 'results'), { recursive: true });
await writeFile(join(bench, 'results', 'metrics.csv'), rows.join('\n') + '\n');
await writeFile(join(bench, 'results', 'reviewer-image-evidence.json'), JSON.stringify({ schema: 'pga-reviewer-image-evidence/1', verifiedAt: new Date().toISOString(), method: '宿主机械比对 actualViews 声称哈希与包内文件实测哈希', allMatch, evidence }, null, 2) + '\n');
console.log(JSON.stringify({ reviewerHashMatch: allMatch, csvRows: rows.length - 1 }));
