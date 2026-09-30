import { readFile, writeFile, cp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { buildSymbolicBlindPackage } from '../../../tools/benchmark/symbolic-blind.mjs';
import { assertIdentityMaterials } from '../../../tools/benchmark/identity-lint.mjs';
import { reviewTemplate, reviewSchema, schemaErrors } from './review-schema.mjs';
import { benchmark } from './prepare-materials.mjs';
import { json } from '../shared/files.mjs';
import { sha256 } from '../shared/accounting.mjs';
import { imageEvidenceGate } from './gates.mjs';

export async function buildBlind({ out, task, repeat, seed, candidateA, candidateB, baselinePNG, taskText }) {
  const convert = candidate => ({ runId: candidate.runId, asset: { frames: [{ ...candidate.state.frame, rgba: Uint8ClampedArray.from(candidate.state.frame.rgba) }] } });
  const key = await buildSymbolicBlindPackage(out, { task, repeat, seed, candidateA: convert(candidateA), candidateB: convert(candidateB), taskText });
  const prompt = await readFile(join(benchmark, 'prompts/reviewer.md'), 'utf8');
  assertIdentityMaterials([{ file: 'PROMPT.md', kind: 'reviewer', text: prompt }, { file: 'TASK.md', kind: 'reviewer', text: taskText }]);
  const packages = [];
  for (const slot of [1, 2]) {
    const dir = join(out, `reviewer-${slot}`);
    await writeFile(join(dir, 'PROMPT.md'), prompt);
    await writeFile(join(dir, 'baseline.png'), baselinePNG);
    await json(join(dir, 'review.template.json'), reviewTemplate(task, slot));
    await json(join(dir, 'review.schema.json'), reviewSchema);
    await mkdir(join(dir, 'validator')); await mkdir(join(dir, 'shared'));
    for (const file of ['review-gate.mjs', 'review-schema.mjs']) await cp(join(benchmark, 'organizer', file), join(dir, 'validator', file));
    await cp(join(benchmark, 'shared/accounting.mjs'), join(dir, 'shared/accounting.mjs'));
    await cp(join(benchmark, 'prompts/submit-review.mjs'), join(dir, 'submit-review.mjs'));
    const expectedImages = {};
    for (const view of ['X.png', 'Y.png', 'baseline.png', 'contact-sheet.png']) expectedImages[view] = sha256(await readFile(join(dir, view)));
    packages.push({ slot, expectedImages });
  }
  // key 与 expectedImages 只返回主持人；不落在任一 reviewer 目录中。
  return { key, packages };
}

export function deriveReview({ review, key, expectedImages, hostEvents, context }) {
  if (schemaErrors(review).length) throw new Error('INVALID_REVIEW');
  if (review.task !== key.task || key.balance !== 'MIRRORED_BALANCE' || key.reviewers.length !== 2 || key.reviewers.some(r => r.X !== key.identities.X || r.Y !== key.identities.Y)) throw new Error('BLIND_KEY_MISMATCH');
  const evidenceMatches = ['X.png', 'Y.png', 'baseline.png'].every(view => review.imageEvidence.some(e => e.view === view && e.sha256 === expectedImages[view] && e.modelContextId === context.modelContextId && e.sessionId === context.sessionId && hostEvents.some(h => h.view === view && h.callId === e.callId && h.sha256 === e.sha256 && h.modelContextId === e.modelContextId && h.sessionId === e.sessionId && h.modelInput === true)));
  const vision = imageEvidenceGate({ expectedImages: Object.fromEntries(['X.png', 'Y.png', 'baseline.png'].map(v => [v, expectedImages[v]])), hostEvents, context, actualViews: review.actualViews });
  const confirmed = evidenceMatches && vision.status === 'PASS';
  return { reviewerSlot: review.reviewerSlot, context, raw: review, evidence: confirmed ? 'CONFIRMED' : 'UNVERIFIED',
    taskFitByRun: Object.fromEntries(['X', 'Y'].map(id => [key.identities[id], confirmed ? review.candidates[id].taskFit : 'UNVERIFIED'])),
    preferredRun: confirmed ? review.pairwiseResult === 'X_PREFERRED' ? key.identities.X : review.pairwiseResult === 'Y_PREFERRED' ? key.identities.Y : null : null,
    pairwiseResult: confirmed ? review.pairwiseResult : 'UNVERIFIED' };
}
