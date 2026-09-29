import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioStore } from '../../src/adapters/studio-store.js';
import { inspectWorkspace } from '../../src/adapters/studio-files.js';
import { borderFixture, searchLimitFixture } from '../fixtures/studio-v13.js';

async function setup(t, doc = borderFixture()) {
  const dir = await mkdtemp(join(tmpdir(), 'pga-safe-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return (await StudioStore.create(dir, doc)).store;
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
  assert.equal(e.validationProbeCount, 38);
  assert.deepEqual(e.candidates.map((c) => c.validation.domainReused), [false, true, true]);
  assert.ok(e.candidates.every((c) => c.safeDomain.status === 'COMPLETE'));
  assert.equal((await store.state()).head, 'r1');
  assert.equal((await store.state()).candidates.length, 2);
  assert.equal(e.candidates[2].geometry.oldGeometry.w, 23);
  await store.commit({ action: 'accept', candidateId: e.candidates[2].candidateId, expectedHead: 'r1' });
  assert.equal((await store._getCompiled('r2')).document.nodes[0].w, 27);
  await assert.rejects(store.commit({ action: 'accept', candidateId: e.candidates[1].candidateId, expectedHead: 'r2' }), { code: 'STALE_REVISION' });
});

test('pixelWork 超限的 inspect 不给部分域，合法 edit 仍可单点验证并提交', async (t) => {
  const store = await setup(t, searchLimitFixture());
  const d = (await inspectWorkspace(store.dir, { node: 'beacon.base' })).safeDomain.fields.w;
  assert.equal(d.status, 'SEARCH_LIMIT');
  assert.ok(d.details.pixelWork > d.details.limits.maxPixelWork);
  assert.equal(d.safeRange, undefined);
  const c = await store.edit({ baseRevision: 'r1', safeBinding: d, operation: { id: 'geometry.set', target: 'beacon.base', params: { w: 24 } } });
  assert.equal(c.status, 'OK');
  assert.equal(c.validationMode, 'POINT_FALLBACK');
  assert.equal(c.safeDomain.status, 'SEARCH_LIMIT');
  assert.equal(c.safeDomain.safeRange, undefined);
  assert.equal(c.validationProbeCount, 1);
  assert.equal(c.validation.trialCompiles, 1);
  assert.equal(c.renderedCandidates, 1);
  await store.commit({ action: 'accept', candidateId: c.candidateId, expectedHead: 'r1' });
  assert.equal((await store._getCompiled('r2')).protection.status, 'PASS');
});

test('binding 仅绑定域身份，不授权自报合法值；字段和固定 anchor 错配在 IO 前拒绝', async (t) => {
  const store = await setup(t), target = 'beacon.base';
  const info = (await inspectWorkspace(store.dir, { node: target })).safeDomain;
  await assert.rejects(store.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target, params: { h: 2 } }, safeBinding: info.fields.w }), { code: 'STALE_SAFE_DOMAIN' });
  await assert.rejects(store.edit({ baseRevision: 'r1', operation: { id: 'resize_about_anchor', target, params: { targetWidth: 25, anchor: 'center' } }, safeBinding: info.recommendedTransforms.resize_about_anchor }), { code: 'STALE_SAFE_DOMAIN' });
  const forged = { ...info.fields.w, safeRange: { values: [35], intervals: [[35, 35]] } };
  const rejected = await store.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target, params: { w: 35 } }, safeBinding: forged });
  assert.equal(rejected.status, 'REJECTED_UNSAFE');
  assert.equal(rejected.candidateId, null);
  assert.deepEqual(rejected.nearestLegalValues, [28, 27, 26]);
  assert.equal((await readdir(join(store.dir, 'candidates'))).length, 0);
});

test('超限 explore 只验证显式取值，保护与编译失败不写候选或 PNG，不偷偷 clamp', async (t) => {
  const store = await setup(t, searchLimitFixture());
  const e = await store.explore({ baseRevision: 'r1', spec: { id: 'geometry.set', target: 'beacon.base', field: 'w', values: [24, 35, 300, 26] } });
  assert.deepEqual(e.candidates.map((c) => c.status), ['OK', 'REJECTED_UNSAFE', 'REJECTED_UNSAFE', 'OK']);
  assert.ok(e.candidates.every((c) => c.validationMode === 'POINT_FALLBACK' && c.safeDomain.status === 'SEARCH_LIMIT' && !c.safeDomain.safeRange));
  assert.equal(e.validationProbeCount, 4);
  assert.deepEqual(e.candidates.map((c) => c.validation.trialCompiles), [1, 1, 0, 1]);
  assert.equal(e.renderedCandidates, 2);
  assert.equal(e.uniqueCount, 2);
  for (const c of e.candidates.slice(1, 3)) {
    assert.equal(c.candidateId, null);
    assert.equal(c.renderedCandidates, 0);
    assert.deepEqual(c.nearestLegalValues, []);
    assert.equal(c.previews, undefined);
  }
  assert.ok(e.candidates[1].conflicts.some((c) => c.changedPixelCount > 0));
  assert.equal(e.candidates[2].error.code, 'CANDIDATE_INVALID');
  assert.equal((await readdir(join(store.dir, 'candidates'))).length, 2);
  assert.deepEqual((await readdir(join(store.dir, 'previews'))).sort(), ['r1-base', e.candidates[0].candidateId, e.candidates[3].candidateId].sort());
  for (const c of [e.candidates[0], e.candidates[3]]) assert.equal((await store._readCandidate(c.candidateId)).doc.nodes[0].w, c.value);
  const rejected = await store.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'beacon.base', params: { w: 35 } } });
  assert.equal(rejected.status, 'REJECTED_UNSAFE');
  assert.equal(rejected.validationProbeCount, 1);
  assert.ok(rejected.conflicts.length);
  assert.equal((await readdir(join(store.dir, 'candidates'))).length, 2);
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
