import { readFile, writeFile, cp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { buildSymbolicBlindPackage } from '../../../tools/benchmark/symbolic-blind.mjs';
import { assertIdentityMaterials } from '../../../tools/benchmark/identity-lint.mjs';
import { reviewTemplate, reviewSchema, schemaErrors } from './review-schema.mjs';
import { benchmark } from './prepare-materials.mjs';
import { json, tree, readJSON } from '../shared/files.mjs';
import { sha256, canonical } from '../shared/accounting.mjs';
import { imageEvidenceGate, modelIdentityGate, visionGate } from './gates.mjs';

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
    await cp(join(benchmark, 'shared/hashes.mjs'), join(dir, 'shared/hashes.mjs'));
    await cp(join(benchmark, 'prompts/submit-review.mjs'), join(dir, 'submit-review.mjs'));
    const expectedImages = {};
    for (const view of ['X.png', 'Y.png', 'baseline.png', 'contact-sheet.png']) expectedImages[view] = sha256(await readFile(join(dir, view)));
    packages.push({ slot, expectedImages, payload: await tree(dir) });
  }
  // key 与 expectedImages 只返回主持人；不落在任一 reviewer 目录中。
  return { key, packages };
}

export async function launchReviewer({ directory, descriptor, manifest, execution, host, contextRegistry }) {
  const blocked = reason => ({ status: 'LAUNCH_BLOCKED', reason, reviewerCreated: false, taskExposed: false });
  if (execution?.status !== 'FROZEN' || execution.approvedToExecute !== true || execution.manifestHash !== sha256(canonical(manifest)) || execution.protocolSha256 !== manifest.protocolSha256 || visionGate(execution.visionEvidence).status !== 'PASS') return blocked('EXECUTION_NOT_FROZEN');
  if (!['vision_A.png', 'vision_B.png'].every(v => execution.visionEvidence.expectedImages[v] === manifest.vision.files[v])) return blocked('VISION_MATERIAL_HASH_MISMATCH');
  if (modelIdentityGate(execution.modelIdentity, await host.getModelIdentity()).status !== 'PASS') return blocked('MODEL_IDENTITY_MISMATCH');
  if (canonical(await tree(directory)) !== canonical(descriptor.payload)) return blocked('REVIEW_PAYLOAD_MISMATCH');
  const reviewer = await host.createEmptyReviewer({ cwd: directory, requestedModel: execution.modelIdentity.actual.model });
  if (!reviewer.modelContextId || !reviewer.sessionId || contextRegistry.has(reviewer.modelContextId) || modelIdentityGate(execution.modelIdentity, reviewer.actual).status !== 'PASS') return { ...blocked('REVIEWER_CONTEXT_OR_MODEL_MISMATCH'), reviewerCreated: true };
  contextRegistry.add(reviewer.modelContextId);
  if (canonical(await tree(directory)) !== canonical(descriptor.payload)) return { ...blocked('REVIEW_PAYLOAD_MISMATCH'), reviewerCreated: true };
  const template = await readJSON(join(directory, 'review.template.json'));
  await json(join(directory, 'review-binding.json'), { task: template.task, reviewerSlot: template.reviewerSlot,
    reviewer: { sessionId: reviewer.sessionId, modelContextId: reviewer.modelContextId } }, true);
  await host.exposeReview({ reviewer, prompt: await readFile(join(directory, 'PROMPT.md'), 'utf8') });
  return { status: 'PASS', reviewerCreated: true, taskExposed: true, modelContextId: reviewer.modelContextId };
}

export function deriveReview({ review, key, expectedImages, hostEvents, context }) {
  if (schemaErrors(review).length) throw new Error('INVALID_REVIEW');
  if (review.task !== key.task || key.balance !== 'MIRRORED_BALANCE' || key.reviewers.length !== 2 || key.identities.X === key.identities.Y ||
    key.reviewers.some(r => r.X !== key.identities.X || r.Y !== key.identities.Y) ||
    JSON.stringify(key.reviewers.map(r => r.presentationOrder)) !== JSON.stringify([['X', 'Y'], ['Y', 'X']])) throw new Error('BLIND_KEY_MISMATCH');
  const evidenceMatches = ['X.png', 'Y.png', 'baseline.png'].every(view => review.imageEvidence.some(e => e.view === view && e.sha256 === expectedImages[view] && e.modelContextId === context.modelContextId && e.sessionId === context.sessionId && hostEvents.some(h => h.view === view && h.callId === e.callId && h.sha256 === e.sha256 && h.modelContextId === e.modelContextId && h.sessionId === e.sessionId && h.modelInput === true)));
  const vision = imageEvidenceGate({ expectedImages: Object.fromEntries(['X.png', 'Y.png', 'baseline.png'].map(v => [v, expectedImages[v]])), hostEvents, context, actualViews: review.actualViews });
  const confirmed = evidenceMatches && vision.status === 'PASS';
  return { reviewerSlot: review.reviewerSlot, context, raw: review, evidence: confirmed ? 'CONFIRMED' : 'UNVERIFIED',
    taskFitByRun: Object.fromEntries(['X', 'Y'].map(id => [key.identities[id], confirmed ? review.candidates[id].taskFit : 'UNVERIFIED'])),
    preferredRun: confirmed ? review.pairwiseResult === 'X_PREFERRED' ? key.identities.X : review.pairwiseResult === 'Y_PREFERRED' ? key.identities.Y : null : null,
    pairwiseResult: confirmed ? review.pairwiseResult : 'UNVERIFIED' };
}
