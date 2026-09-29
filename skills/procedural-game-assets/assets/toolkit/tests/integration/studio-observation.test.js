import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioStore, candidateIdentity } from '../../src/adapters/studio-store.js';
import { observeWorkspace, exportWorkspace } from '../../src/adapters/studio-files.js';
import { assetFromJSON } from '../../src/adapters/asset-file.js';
import { borderFixture, t05Operation } from '../fixtures/studio-v13.js';
import { compileAny, applyAnyOperation, checkAnyCandidate } from '../../src/studio/dispatch.js';

test('观察只读取已有候选；PNG/标签可复查，overlay 不进入最终 export', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'pga-observe-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { store } = await StudioStore.create(join(root, 'ws'), borderFixture());
  const c = await store.edit({ baseRevision: 'r1', operation: { id: 'widen_about_center', target: 'beacon.base', params: { deltaWidth: 2 } } });
  const state = await store.state();
  const observation = await observeWorkspace(store.dir, join(root, 'views'), { revision: 'r1', candidateIds: [c.candidateId], node: 'beacon.base' });
  assert.deepEqual(await store.state(), state);
  assert.equal(observation.observations.length, 4);
  assert.equal(observation.observations[0].cells[1].candidateId, c.candidateId);
  assert.equal(observation.observations[0].cells[1].status, 'VALID');
  assert.equal(observation.validation.candidates[0].status, 'VALID');
  assert.equal(observation.validation.candidates[0].protection.status, 'PASS');
  assert.ok((await readFile(join(root, 'views', 'diff-1.display.png'))).length > 0);
  await store.commit({ action: 'accept', candidateId: c.candidateId, expectedHead: 'r1' });
  const result = await exportWorkspace(store.dir, join(root, 'export'));
  const asset = assetFromJSON(JSON.parse(await readFile(join(root, 'export', result.files.asset))));
  assert.deepEqual(asset.frames[0].rgba, (await store._getCompiled('r2')).asset.frames[0].rgba);
  assert.ok(!JSON.stringify(result.files).includes('overlay'));
});

test('观察重验内容、身份与真实保护状态；异常候选只留诊断，不进入拼图或 diff', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'pga-observe-invalid-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { store } = await StudioStore.create(join(root, 'ws'), borderFixture());
  const c = await store.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'beacon.base', params: { w: 24 } } });
  const file = join(store.dir, 'candidates', `${c.candidateId}.json`);
  const original = JSON.parse(await readFile(file));
  for (const [name, mutate] of [
    ['content', (r) => { r.doc.nodes[0].w++; }],
    ['content-and-hashes', (r) => { r.doc.nodes[0].w++; r.hashes = compileAny(r.doc).hashes; }],
    ['identity', (r) => { r.candidateId = 'c-00000000'; }],
    ['base', (r) => { r.baseRevision = 'r999'; }],
  ]) {
    const record = structuredClone(original); mutate(record);
    await writeFile(file, JSON.stringify(record));
    const out = join(root, name), observed = await observeWorkspace(store.dir, out, { candidateIds: [c.candidateId] });
    assert.equal(observed.validation.candidates[0].status, 'TAMPERED', name);
    assert.equal(observed.validation.candidates[0].displayed, false);
    assert.equal(observed.observations[0].cells.length, 1);
    assert.ok(!(await readdir(out)).some((f) => f.startsWith('diff-')));
  }
  await writeFile(file, JSON.stringify(original));
  const base = await store._getCompiled('r1'), { doc, plan } = applyAnyOperation(base.document, t05Operation);
  const compiled = compileAny(doc), checks = checkAnyCandidate({ baseCompiled: base, candidateCompiled: compiled, plan, preserve: [], revision: 'r1' });
  assert.equal(checks.status, 'REJECTED');
  const candidateId = candidateIdentity('r1', base, t05Operation, []);
  const rejectedFile = join(store.dir, 'candidates', `${candidateId}.json`);
  await writeFile(rejectedFile, JSON.stringify({ candidateId, baseRevision: 'r1', operation: t05Operation, doc, hashes: compiled.hashes, preserveRequest: [], checks }));
  const out = join(root, 'rejected'), observed = await observeWorkspace(store.dir, out, { candidateIds: [c.candidateId, candidateId] });
  assert.deepEqual(observed.validation.candidates.map((c) => c.status), ['VALID', 'REJECTED']);
  assert.equal(observed.validation.candidates[1].protection.status, 'REJECTED');
  assert.equal(observed.validation.candidates[1].protection.changedPixelCount, 27);
  assert.equal(observed.observations[0].cells.length, 2);
  assert.ok(!(await readdir(out)).includes('diff-2.display.png'));
  assert.deepEqual(JSON.parse(await readFile(join(out, 'observation.json'))).validation, observed.validation);
  // 自报 OK 不能把真实保护失败升级成 VALID。
  await writeFile(rejectedFile, JSON.stringify({ candidateId, baseRevision: 'r1', operation: t05Operation, doc, hashes: compiled.hashes, preserveRequest: [], checks: { status: 'OK' } }));
  const forged = await observeWorkspace(store.dir, join(root, 'forged'), { candidateIds: [candidateId] });
  assert.equal(forged.validation.candidates[0].status, 'TAMPERED');
  assert.ok(forged.validation.candidates[0].conflicts.length > 0);
});

test('错误观察基准与已过期候选显式 STALE，旧 revision 观察也不能标 VALID', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'pga-observe-stale-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { store } = await StudioStore.create(join(root, 'ws'), borderFixture());
  const c = await store.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'beacon.base', params: { w: 24 } } });
  await store.commit({ action: 'accept', candidateId: c.candidateId, expectedHead: 'r1' });
  for (const revision of ['r1', 'r2']) {
    const observed = await observeWorkspace(store.dir, join(root, revision), { revision, candidateIds: [c.candidateId] });
    assert.equal(observed.validation.candidates[0].status, 'STALE');
    assert.equal(observed.validation.candidates[0].reason, revision === 'r1' ? 'STALE_REVISION' : 'BASE_REVISION_MISMATCH');
    assert.equal(observed.observations[0].cells.length, 1);
  }
});
