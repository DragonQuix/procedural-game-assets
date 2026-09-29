import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioStore } from '../../src/adapters/studio-store.js';
import { inspectWorkspace } from '../../src/adapters/studio-files.js';
import { borderFixture } from '../fixtures/studio-v13.js';

async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), 'pga-safe-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return (await StudioStore.create(dir, borderFixture())).store;
}
test('inspect 返回修订绑定域；非法 edit 提前拒绝且不 clamp', async (t) => {
  const store = await setup(t);
  const inspection = await inspectWorkspace(store.dir, { node: 'beacon.base' });
  assert.equal(inspection.safeDomain.revision, 'r1');
  const c = await store.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'beacon.base', params: { w: 35 } } });
  assert.equal(c.status, 'REJECTED_UNSAFE');
  assert.equal(c.requestedValue, 35);
  assert.deepEqual(c.nearestLegalValues, [28, 27, 26]);
  assert.equal(c.candidateId, null);
  assert.equal((await store._getCompiled('r1')).document.nodes[0].w, 23);
});
test('explore 混合合法/非法值，同基准分支，拒绝项不计候选', async (t) => {
  const store = await setup(t);
  const e = await store.explore({ baseRevision: 'r1', spec: { id: 'widen_about_center', target: 'beacon.base', field: 'deltaWidth', values: [3, 2, 4] } });
  assert.deepEqual(e.candidates.map((c) => c.status), ['REJECTED_UNSAFE', 'OK', 'OK']);
  assert.equal(e.uniqueCount, 2);
  assert.equal(e.renderedCandidates, 2);
  assert.equal(e.rejectedVariations, 1);
  assert.ok(e.validationProbeCount > e.renderedCandidates);
  assert.equal((await store.state()).head, 'r1');
  assert.equal((await store.state()).candidates.length, 2);
  assert.equal(e.candidates[2].geometry.oldGeometry.w, 23);
  await store.commit({ action: 'accept', candidateId: e.candidates[2].candidateId, expectedHead: 'r1' });
  assert.equal((await store._getCompiled('r2')).document.nodes[0].w, 27);
  await assert.rejects(store.commit({ action: 'accept', candidateId: e.candidates[1].candidateId, expectedHead: 'r2' }), { code: 'STALE_REVISION' });
});
test('旧 safe domain 不可授权新修订或不同目标，restore 也使旧 binding 失效', async (t) => {
  const store = await setup(t), target = 'beacon.base';
  const old = (await inspectWorkspace(store.dir, { node: target })).safeDomain.fields.w;
  const operation = { id: 'geometry.set', target, params: { w: 24 } };
  const c = await store.edit({ baseRevision: 'r1', operation, safeBinding: old });
  await store.commit({ action: 'accept', candidateId: c.candidateId, expectedHead: 'r1' });
  await assert.rejects(store.edit({ baseRevision: 'r2', operation, safeBinding: old }), { code: 'STALE_SAFE_DOMAIN' });
  await store.commit({ action: 'restore', targetRevision: 'r1', expectedHead: 'r2' });
  await assert.rejects(store.edit({ baseRevision: 'r3', operation, safeBinding: old }), { code: 'STALE_SAFE_DOMAIN' });
});
