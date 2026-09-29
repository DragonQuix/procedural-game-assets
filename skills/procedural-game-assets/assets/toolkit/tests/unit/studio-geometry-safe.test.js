import test from 'node:test';
import assert from 'node:assert/strict';
import { compileStudioDocument as compile, createProtectedDocument } from '../../src/studio/compiler.js';
import { applyOperation } from '../../src/studio/operators.js';
import { enumerateSafeDomain, evaluateSafeOperation, compressValues, validateSafeBinding } from '../../src/studio/safe-domain.js';
import { borderFixture } from '../fixtures/studio-v13.js';

const target = 'beacon.base';
const run = (id, params, doc = borderFixture()) => applyOperation(doc, { id, target, params });
const domain = (doc, field = 'w', opts = {}) => enumerateSafeDomain({ compiled: compile(doc), revision: 'r1', operator: 'geometry.set', target, field, ...opts });

test('widen_about_center 自动补 x，精确保中心，奇数宽差不漂移', () => {
  const result = run('widen_about_center', { deltaWidth: 4 });
  assert.deepEqual(result.plan.geometry.newGeometry, { x: 6, y: 32, w: 27, h: 3 });
  assert.equal(result.plan.geometry.preservedInvariant, 'centerX');
  assert.deepEqual(result.plan.geometry.delta, { x: -2, y: 0, w: 4, h: 0 });
  assert.throws(() => run('widen_about_center', { deltaWidth: 3 }), { code: 'REJECTED_UNSAFE' });
});

test('squash_keep_base 自动补 y，精确保 bottomY，不推测其它节点依赖', () => {
  const doc = borderFixture(), result = run('squash_keep_base', { deltaHeight: -2 }, doc);
  const geometry = result.plan.geometry;
  assert.deepEqual(geometry.newGeometry, { x: 8, y: 34, w: 23, h: 1 });
  assert.equal(geometry.oldGeometry.y + geometry.oldGeometry.h, geometry.newGeometry.y + geometry.newGeometry.h);
  assert.equal(geometry.preservedInvariant, 'bottomY');
  assert.deepEqual(result.doc.nodes[1], doc.nodes[1]);
});

test('resize_about_anchor 支持命名与 normalized anchor，delta/target 冲突拒绝', () => {
  for (const anchor of ['center', 'bottom-center', 'top-left', { x: 0.25, y: 1 }]) {
    const r = run('resize_about_anchor', { deltaWidth: 4, targetHeight: 1, anchor });
    const g = r.plan.geometry;
    assert.deepEqual({ x: g.newGeometry.x + g.newGeometry.w * g.anchor.x, y: g.newGeometry.y + g.newGeometry.h * g.anchor.y }, g.anchorPoint);
  }
  assert.throws(() => run('resize_about_anchor', { deltaWidth: 2, targetWidth: 4, anchor: 'center' }), { code: 'INVALID_DOCUMENT' });
  assert.throws(() => run('resize_about_anchor', { deltaWidth: 2 }), { code: 'INVALID_DOCUMENT' });
});

test('边界、unsupported 节点与确定性', () => {
  assert.throws(() => run('widen_about_center', { deltaWidth: 100 }), { code: 'CANDIDATE_INVALID' });
  const doc = borderFixture();
  doc.nodes[0] = { id: target, kind: 'disc', cx: 19, cy: 20, rx: 3, ry: 3, material: 'flat', ramp: 'steel', layer: 0 };
  assert.throws(() => run('widen_about_center', { deltaWidth: 2 }, doc), { code: 'UNSUPPORTED' });
  assert.deepEqual(run('squash_keep_base', { deltaHeight: -1 }), run('squash_keep_base', { deltaHeight: -1 }));
});

test('已知 exact range 含描边约束，宣称合法的每个值都通过真实检查', () => {
  const doc = borderFixture(), d = domain(doc);
  assert.deepEqual(d.theoreticalRange, [1, 38]);
  assert.deepEqual(d.safeRange.intervals, [[1, 28]]);
  for (const value of d.safeRange.values) assert.equal(evaluateSafeOperation(compile(doc), { id: 'geometry.set', target, params: { w: value } }).legal, true);
  assert.ok(d.rejected.some((v) => v.error?.code === 'CANDIDATE_INVALID'));
});

function holesFixture() {
  const base = borderFixture().protection.baseline;
  base.canvas = { w: 12, h: 8, outline: null };
  base.anchor = { x: 6, y: 8 }; base.attachments = {};
  base.nodes = [{ ...base.nodes[0], x: 1, y: 2, w: 1, h: 1 }];
  return createProtectedDocument(base, { protectedRegions: [{ x: 4, y: 2, w: 1, h: 1 }, { x: 8, y: 2, w: 1, h: 1 }] });
}

test('安全域支持多个不连续区间；离散值不伪装为连续范围', () => {
  const d = domain(holesFixture(), 'x');
  assert.deepEqual(d.safeRange.intervals, [[0, 3], [5, 7], [9, 11]]);
  const semantic = domain(borderFixture(), 'deltaWidth', { operator: 'widen_about_center' });
  assert.ok(semantic.safeRange.values.every((v) => v % 2 === 0));
  assert.ok(semantic.safeRange.intervals.every(([a, b]) => a === b));
  assert.deepEqual(compressValues([8, 1, 2, 5, 5]), { intervals: [[1, 2], [5, 5], [8, 8]], values: [1, 2, 5, 8] });
});

test('无合法值、保护变化影响域、确定性枚举与搜索上限', () => {
  const doc = holesFixture();
  const a = domain(doc, 'x');
  assert.deepEqual(a, domain(doc, 'x'));
  doc.protection.nodeIds = [target];
  assert.deepEqual(domain(doc, 'x').safeRange.values, [1]);
  doc.anchor.x++; doc.protection.metadataPaths = ['anchor'];
  assert.deepEqual(domain(doc, 'x').safeRange.values, []);
  assert.throws(() => domain(doc, 'x', { maxSearch: 3 }), { code: 'SEARCH_LIMIT' });
  assert.throws(() => domain(doc, 'x', { maxSearch: 10000 }), { code: 'SEARCH_LIMIT' });
});

test('revision/hash 改变使旧结果失效，即使恢复到相同内容也需新 revision', () => {
  const compiled = compile(borderFixture()), d = domain(borderFixture());
  const op = { id: 'geometry.set', target };
  assert.doesNotThrow(() => validateSafeBinding(d, compiled, 'r1', op));
  assert.throws(() => validateSafeBinding(d, compiled, 'r2', op), { code: 'STALE_SAFE_DOMAIN' });
  const changed = borderFixture(); changed.protection.nodeIds = [];
  assert.throws(() => validateSafeBinding(d, compile(changed), 'r1', op), { code: 'STALE_SAFE_DOMAIN' });
  assert.notEqual(domain(changed).cacheKey, d.cacheKey);
});
