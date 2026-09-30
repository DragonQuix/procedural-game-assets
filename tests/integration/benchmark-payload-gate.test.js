import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareTrial, launchParticipant, hashTree, treeHash, sha256 } from '../../tools/benchmark/payload-gate.mjs';
import { buildSymbolicBlindPackage, unblindSymbolicPreference } from '../../tools/benchmark/symbolic-blind.mjs';
import { compileStudioDocument } from '../../src/studio/compiler.js';
import { relationFixture } from '../fixtures/studio-v14.js';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'pga-launch-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const name of ['kit', 'shared', 'task']) await mkdir(join(root, name));
  await writeFile(join(root, 'kit/package.json'), JSON.stringify({ name: 'procedural-game-assets', version: '0.8.0' }));
  await writeFile(join(root, 'shared/observe.mjs'), 'export const version = 1;');
  await writeFile(join(root, 'task/participant.md'), '只操作 Node A，保持 R1；查看 Image A。');
  await writeFile(join(root, 'start.json'), '{}');
  const descriptor = async path => { const files = await hashTree(join(root, path)); return { path, files, sha256: treeHash(files) }; };
  const manifest = { status: 'FROZEN', approvedToExecute: true,
    toolkits: { D14: { ...await descriptor('kit'), arm: 'D14', version: '0.8.0' } },
    sharedObservation: await descriptor('shared'), tasks: { C: { common: await descriptor('task'), documents: { D14: { path: 'start.json', sha256: sha256('{}') } } } },
    agentMaterials: [{ file: 'participant.md', kind: 'participant' }] };
  return { root, manifest, args: { trialRoot: join(root, 'trial'), materialRoot: root, manifest, expectedArm: 'D14', taskId: 'C' } };
}

test('pre-agent payload gate checks actual installed kit/shared/task before callback; draft cannot launch', async (t) => {
  const { args } = await fixture(t);
  assert.equal((await prepareTrial(args)).status, 'PASS');
  let called = 0;
  const createParticipant = ({ prompt }) => { called++; assert.match(prompt, /Node A/); return 'fake-test-host'; };
  const launched = await launchParticipant({ ...args, createParticipant });
  assert.equal(launched.gate.status, 'PASS'); assert.equal(called, 1);
  const blocked = await launchParticipant({ ...args, manifest: { ...args.manifest, status: 'DRAFT_NOT_RUN' }, createParticipant });
  assert.equal(blocked.status, 'LAUNCH_BLOCKED'); assert.equal(called, 1);
});

for (const path of ['kit/package.json', 'shared/observe.mjs', 'task/participant.md', 'start.studio.json']) test(`pre-agent rehash blocks tampering of ${path} without exposing task`, async (t) => {
  const { args } = await fixture(t); await prepareTrial(args);
  await writeFile(join(args.trialRoot, 'staged', path), 'tampered');
  const result = await launchParticipant({ ...args, createParticipant() { assert.fail('Participant must not be created'); } });
  assert.equal(result.status, 'LAUNCH_BLOCKED'); assert.equal(result.taskExposed, false); assert.equal(result.participantCreated, false);
});

test('wrong arm, extra installed file and identity lint all block launch', async (t) => {
  const { args } = await fixture(t);
  assert.equal((await prepareTrial({ ...args, expectedArm: 'D13' })).status, 'LAUNCH_BLOCKED');
  const good = { ...args, trialRoot: join(args.materialRoot, 'trial2') }; await prepareTrial(good);
  await writeFile(join(good.trialRoot, 'staged/kit/extra.txt'), 'unexpected');
  assert.equal((await launchParticipant({ ...good, createParticipant() { assert.fail(); } })).status, 'LAUNCH_BLOCKED');
  const prompt = 'Compare the left candidate and Node A.';
  await writeFile(join(args.materialRoot, 'task/participant.md'), prompt);
  const changed = structuredClone(args.manifest);
  changed.tasks.C.common.files = await hashTree(join(args.materialRoot, 'task'));
  changed.tasks.C.common.sha256 = treeHash(changed.tasks.C.common.files);
  const lintBlocked = await prepareTrial({ ...args, manifest: changed, trialRoot: join(args.materialRoot, 'trial3') });
  assert.equal(lintBlocked.status, 'LAUNCH_BLOCKED');
  assert.match(lintBlocked.reason, /symbolic identity/);
  assert.equal(lintBlocked.taskExposed, false);
});

test('v0.2 mirrored review retains X/Y mappings and emits independent files without key leakage', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'pga-symbolic-blind-')); t.after(() => rm(root, { recursive: true, force: true }));
  const asset = compileStudioDocument(relationFixture()).asset;
  const key = await buildSymbolicBlindPackage(join(root, 'pair'), { task: 'C', repeat: 1, seed: 'draft', candidateA: { runId: 'run-a', asset }, candidateB: { runId: 'run-b', asset }, taskText: '保持 Node A 与 Node B 的 R1。' });
  assert.equal(key.reviewers[0].X, key.reviewers[1].X); assert.equal(key.reviewers[0].Y, key.reviewers[1].Y);
  assert.deepEqual(key.reviewers[1].presentationOrder, ['Y', 'X']);
  assert.deepEqual(await readFile(join(root, 'pair/reviewer-1/X.png')), await readFile(join(root, 'pair/reviewer-2/X.png')));
  assert.equal(unblindSymbolicPreference(key, 1, 'X_PREFERRED'), unblindSymbolicPreference(key, 2, 'X_PREFERRED'));
  await assert.rejects(readFile(join(root, 'pair/key.json')));
});
