/** Coordinator-only staging. No participant or task prompt is released before verified PASS. */
import { createHash } from 'node:crypto';
import { mkdir, cp, readFile, readdir, writeFile, lstat } from 'node:fs/promises';
import { resolve, join, relative, sep } from 'node:path';
import { assertIdentityMaterials } from './identity-lint.mjs';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const canonical = (v) => v && typeof v === 'object' ? Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v);
export const treeHash = (files) => sha256(canonical(files));
export async function hashTree(dir) {
  const files = {};
  async function walk(path) {
    if ((await lstat(path)).isSymbolicLink()) throw new Error('Symlink payload is not supported');
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : 1)) {
      const p = join(path, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Symlink payload is not supported');
      if (entry.isDirectory()) await walk(p);
      else if (entry.isFile()) files[relative(dir, p).replaceAll('\\', '/')] = sha256(await readFile(p));
      else throw new Error('Non-file payload entry');
    }
  }
  await walk(dir); return files;
}
function within(root, name) {
  if (typeof name !== 'string' || !name || name.includes('\\') || name.split('/').includes('..')) throw new Error('Invalid manifest path');
  const path = resolve(root, name), base = resolve(root);
  if (!path.startsWith(base + sep)) throw new Error('Manifest path escapes root');
  return path;
}
async function verify(dir, descriptor, name) {
  const files = await hashTree(dir);
  if (!descriptor || canonical(files) !== canonical(descriptor.files) || treeHash(files) !== descriptor.sha256) throw new Error(`${name}_HASH_MISMATCH`);
  return descriptor.sha256;
}
function armSpec(manifest, expectedArm, taskId) {
  const arm = manifest.toolkits?.[expectedArm], task = manifest.tasks?.[taskId];
  if (!['D13', 'D14'].includes(expectedArm) || arm?.arm !== expectedArm || !task || arm.version !== (expectedArm === 'D13' ? '0.7.0' : '0.8.0')) throw new Error('EXPECTED_ARM_IDENTITY_MISMATCH');
  return { arm, task };
}
async function receipt(trialRoot, value) {
  await writeFile(join(trialRoot, 'launch-gate.json'), JSON.stringify(value, null, 2) + '\n');
  return value;
}

export async function verifyTrial({ trialRoot, manifest, expectedArm, taskId }) {
  try {
    const { arm, task } = armSpec(manifest, expectedArm, taskId), stage = join(trialRoot, 'staged');
    const binding = JSON.parse(await readFile(join(trialRoot, 'binding.json'), 'utf8'));
    if (binding.expectedArm !== expectedArm || binding.taskId !== taskId || binding.manifestHash !== sha256(canonical(manifest))) throw new Error('TRIAL_BINDING_MISMATCH');
    const toolkitHash = await verify(join(stage, 'kit'), arm, 'TOOLKIT');
    const pkg = JSON.parse(await readFile(join(stage, 'kit/package.json'), 'utf8'));
    if (pkg.version !== arm.version || pkg.name !== 'procedural-game-assets') throw new Error('INSTALLED_ARM_IDENTITY_MISMATCH');
    const observationHash = await verify(join(stage, 'shared'), manifest.sharedObservation, 'COMMON_OBSERVATION');
    const taskHash = await verify(join(stage, 'task'), task.common, 'TASK');
    if (sha256(await readFile(join(stage, 'start.studio.json'))) !== task.documents[expectedArm].sha256) throw new Error('START_DOCUMENT_HASH_MISMATCH');
    const materials = [];
    for (const m of manifest.agentMaterials) materials.push({ ...m, text: await readFile(within(join(stage, 'task'), m.file), 'utf8') });
    assertIdentityMaterials(materials);
    return receipt(trialRoot, { status: 'PASS', expectedArm, taskId, toolkitHash, observationHash, taskHash, participantCreated: false, taskExposed: false });
  } catch (e) {
    return receipt(trialRoot, { status: 'LAUNCH_BLOCKED', reason: e.message, participantCreated: false, taskExposed: false });
  }
}

export async function prepareTrial({ trialRoot, materialRoot, manifest, expectedArm, taskId }) {
  await mkdir(trialRoot); // Fail on an existing trial, including an earlier blocked attempt.
  try {
    const { arm, task } = armSpec(manifest, expectedArm, taskId), stage = join(trialRoot, 'staged');
    await mkdir(stage);
    for (const [src, dst] of [[arm.path, 'kit'], [manifest.sharedObservation.path, 'shared'], [task.common.path, 'task']]) {
      const source = within(materialRoot, src);
      await hashTree(source); // Reject symlinks before copying.
      await cp(source, join(stage, dst), { recursive: true, dereference: false, errorOnExist: true });
    }
    const start = within(materialRoot, task.documents[expectedArm].path);
    if ((await lstat(start)).isSymbolicLink()) throw new Error('Symlink start document');
    await cp(start, join(stage, 'start.studio.json'), { errorOnExist: true });
    await writeFile(join(trialRoot, 'binding.json'), JSON.stringify({ expectedArm, taskId, manifestHash: sha256(canonical(manifest)) }));
    return verifyTrial({ trialRoot, manifest, expectedArm, taskId });
  } catch (e) { return receipt(trialRoot, { status: 'LAUNCH_BLOCKED', reason: e.message, participantCreated: false, taskExposed: false }); }
}

export async function launchParticipant({ createParticipant, ...input }) {
  // The execution owner must explicitly freeze and authorize. A candidate snapshot is never launchable.
  if (input.manifest.status !== 'FROZEN' || input.manifest.approvedToExecute !== true) return receipt(input.trialRoot,
    { status: 'LAUNCH_BLOCKED', reason: 'NOT_FROZEN_OR_NOT_AUTHORIZED', participantCreated: false, taskExposed: false });
  const gate = await verifyTrial(input);
  if (gate.status !== 'PASS') return gate;
  if (typeof createParticipant !== 'function') throw new TypeError('A host createParticipant adapter is required');
  const cwd = join(input.trialRoot, 'staged');
  const prompt = await readFile(join(cwd, 'task/participant.md'), 'utf8');
  if (sha256(prompt) !== input.manifest.tasks[input.taskId].common.files['participant.md']) return receipt(input.trialRoot,
    { status: 'LAUNCH_BLOCKED', reason: 'PROMPT_CHANGED_BEFORE_START', participantCreated: false, taskExposed: false });
  return { gate, participant: await createParticipant({ cwd, prompt }) };
}
