import { mkdir, cp, readFile, writeFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve, sep } from 'node:path';
import { readJSON, json, tree } from '../shared/files.mjs';
import { sha256, canonical } from '../shared/accounting.mjs';
import { modelIdentityGate, visionGate } from './gates.mjs';
import { assertIdentityMaterials } from '../../../tools/benchmark/identity-lint.mjs';
import { plannedMatrix, TAG_COMMIT } from './prepare-materials.mjs';

function within(root, name) {
  const path = resolve(root, name);
  if (!path.startsWith(resolve(root) + sep)) throw new Error('PATH_ESCAPES_MATERIALS');
  return path;
}
async function verifyTree(root, descriptor, code) {
  if (canonical(await tree(root)) !== canonical({ files: descriptor.files, sha256: descriptor.sha256 })) throw new Error(`${code}_HASH_MISMATCH`);
}
export async function prepareTrial({ out, materialRoot, manifest, runId }) {
  const spec = plannedMatrix().runs.find(r => r.runId === runId);
  if (!spec) throw new Error('UNPLANNED_RUN');
  await mkdir(out);
  const staged = join(out, 'staged'); await mkdir(staged);
  for (const [descriptor, target] of [[manifest.toolkits[spec.arm], 'kit'], [manifest.shared, 'shared'], [manifest.tasks[spec.task].common, 'task']]) {
    const src = within(materialRoot, descriptor.path); await verifyTree(src, descriptor, target.toUpperCase());
    await cp(src, join(staged, target), { recursive: true });
  }
  const start = manifest.tasks[spec.task].starts[spec.arm], sourceName = spec.arm === 'A' ? 'asset.mjs' : 'start.json';
  const bytes = await readFile(within(materialRoot, start.path));
  if (sha256(bytes) !== start.sha256) throw new Error('START_HASH_MISMATCH');
  await writeFile(join(staged, sourceName), bytes);
  await writeFile(join(staged, 'run.mjs'), "import { run } from './shared/runner.mjs';\nconsole.log(JSON.stringify(await run()));\n");
  await json(join(staged, 'package.json'), { type: 'module', private: true });
  await json(join(staged, 'run-config.json'), { arm: spec.arm, task: spec.task, runId });
  await json(join(staged, 'ledger.json'), { candidates: [], events: [], submitted: false });
  if (spec.arm === 'D14') execFileSync(process.execPath, [join(staged, 'kit/bin/pga-studio.mjs'), 'create', '--doc', join(staged, 'start.json'), '--out', join(staged, 'ws')], { cwd: staged, timeout: 30000 });
  const binding = { runId, arm: spec.arm, task: spec.task, manifestHash: sha256(canonical(manifest)), stage: await tree(staged) };
  await json(join(out, 'binding.json'), binding, true);
  return verifyTrial({ out, manifest, runId });
}
export async function verifyTrial({ out, manifest, runId }) {
  try {
    const spec = plannedMatrix().runs.find(r => r.runId === runId), binding = await readJSON(join(out, 'binding.json'));
    if (!spec || binding.runId !== runId || binding.arm !== spec.arm || binding.task !== spec.task || binding.manifestHash !== sha256(canonical(manifest))) throw new Error('TRIAL_BINDING_MISMATCH');
    const kit = manifest.toolkits[spec.arm];
    if (kit.sourceCommit !== TAG_COMMIT || kit.version !== '0.8.0' || kit.arm !== spec.arm) throw new Error('FROZEN_PRODUCT_MISMATCH');
    const staged = join(out, 'staged');
    await verifyTree(join(staged, 'kit'), kit, 'TOOLKIT');
    await verifyTree(join(staged, 'shared'), manifest.shared, 'OBSERVATION');
    await verifyTree(join(staged, 'task'), manifest.tasks[spec.task].common, 'TASK');
    await verifyTree(staged, binding.stage, 'STAGED');
    const source = await readFile(join(staged, spec.arm === 'A' ? 'asset.mjs' : 'start.json'));
    if (sha256(source) !== manifest.tasks[spec.task].starts[spec.arm].sha256) throw new Error('START_HASH_MISMATCH');
    assertIdentityMaterials(await Promise.all(['participant.md', 'TASK.md', 'task-contract.json'].map(async file => ({ file, kind: 'participant', text: await readFile(join(staged, 'task', file), 'utf8') }))));
    return { status: 'PASS', runId, participantCreated: false, taskExposed: false, toolkitHash: kit.sha256, observationHash: manifest.shared.sha256, taskHash: manifest.tasks[spec.task].common.sha256 };
  } catch (e) { return { status: 'LAUNCH_BLOCKED', reason: e.message, participantCreated: false, taskExposed: false }; }
}

export async function launchParticipant({ out, manifest, execution, runId, host, contextRegistry }) {
  const blocked = reason => ({ status: 'LAUNCH_BLOCKED', reason, participantCreated: false, taskExposed: false });
  if (execution?.status !== 'FROZEN' || execution.approvedToExecute !== true || execution.manifestHash !== sha256(canonical(manifest)) || execution.protocolSha256 !== manifest.protocolSha256) return blocked('EXECUTION_NOT_FROZEN');
  if (visionGate(execution.visionEvidence).status !== 'PASS') return blocked('VISION_GATE_NOT_PASSED');
  const actual = await host.getModelIdentity();
  if (modelIdentityGate(execution.modelIdentity, actual).status !== 'PASS') return blocked('MODEL_IDENTITY_MISMATCH');
  const gate = await verifyTrial({ out, manifest, runId }); if (gate.status !== 'PASS') return gate;
  const participant = await host.createEmptyParticipant({ cwd: join(out, 'staged'), requestedModel: execution.modelIdentity.actual.model });
  const context = participant.modelContextId;
  if (!context || !participant.sessionId || contextRegistry.has(context) || modelIdentityGate(execution.modelIdentity, participant.actual).status !== 'PASS') return { ...blocked('AGENT_CONTEXT_OR_MODEL_MISMATCH'), participantCreated: true };
  contextRegistry.add(context);
  const recheck = await verifyTrial({ out, manifest, runId });
  if (recheck.status !== 'PASS') return { ...recheck, participantCreated: true };
  const prompt = await readFile(join(out, 'staged/task/participant.md'), 'utf8');
  await host.exposeTask({ participant, prompt, taskDirectory: join(out, 'staged/task') });
  return { ...gate, participantCreated: true, taskExposed: true, context, sessionId: participant.sessionId };
}
