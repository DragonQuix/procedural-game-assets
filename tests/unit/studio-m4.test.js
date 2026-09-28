/**
 * tests/unit/studio-m4.test.js — /2 操作与保护：poly/disc geometry.set、ramp.set 局部覆盖、
 * 非矩形几何的区域与保护检查（含 bbox 透明角透变捕获）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileStudioDocument } from '../../src/studio/compiler.js';
import { applyOperation, exploreOperation, StudioOperationError } from '../../src/studio/operators.js';
import { checkCandidate, preserveFromDocument } from '../../src/studio/protect.js';

const here = dirname(fileURLToPath(import.meta.url));
const wrench = JSON.parse(readFileSync(join(here, '../../examples/studio/wrench.studio.json'), 'utf8'));

const compile = (doc) => compileStudioDocument(doc, { toolVersion: 'test' });
const preserve = preserveFromDocument(compile(wrench).document); // pixels wrench.bolt + metadata anchor

function run(op) {
  const base = compile(wrench);
  const { doc: candDoc, plan } = applyOperation(base.document, op);
  return checkCandidate({ baseCompiled: base, candidateCompiled: compile(candDoc), plan, preserve });
}

test('geometry.set：poly 顶点与 disc 半径按类型放行，rect 字段按类型拒绝', () => {
  const { doc, plan } = applyOperation(wrench, { id: 'geometry.set', target: 'wrench.handle', params: { vertices: [[6, 21], [8, 19], [15, 12], [13, 10]] } });
  assert.deepEqual(plan.changedFields.vertices.to[0], [6, 21]);
  assert.deepEqual(doc.nodes.find((n) => n.id === 'wrench.handle').vertices[0], [6, 21]);
  const disc = applyOperation(wrench, { id: 'geometry.set', target: 'wrench.bolt', params: { rx: 3, ry: 3 } });
  assert.equal(disc.doc.nodes.find((n) => n.id === 'wrench.bolt').rx, 3);
  assert.throws(() => applyOperation(wrench, { id: 'geometry.set', target: 'wrench.handle', params: { w: 4 } }), (e) => e instanceof StudioOperationError && e.code === 'CANDIDATE_INVALID');
  assert.throws(() => applyOperation(wrench, { id: 'geometry.set', target: 'wrench.handle', params: { vertices: [[1, 1], [2, 2]] } }), (e) => e.code === 'CANDIDATE_INVALID');
  // 越界顶点在规范化期拒绝
  assert.throws(() => applyOperation(wrench, { id: 'geometry.set', target: 'wrench.handle', params: { vertices: [[1, 1], [2, 2], [99, 3]] } }), (e) => e.code === 'CANDIDATE_INVALID');
});

test('exploreOperation 按目标类型校验字段；vertices 探索可用', () => {
  const baseV = wrench.nodes[0].vertices;
  const entries = exploreOperation(wrench, { id: 'geometry.set', target: 'wrench.handle', field: 'vertices', values: [baseV, baseV.map(([x, y]) => [x + 1, y])] });
  assert.equal(entries.length, 2);
  assert.equal(entries[1].plan.changedFields.vertices.to[0][0], baseV[0][0] + 1);
  assert.throws(() => exploreOperation(wrench, { id: 'geometry.set', target: 'wrench.handle', field: 'w', values: [4] }), (e) => e.code === 'CANDIDATE_INVALID');
});

test('ramp.set 局部覆盖：/2 放行且 plan 记录；/1 拒绝', () => {
  const shades = ['#1a1d24', '#333945', '#4d5566', '#7c8698'];
  const { doc, plan } = applyOperation(wrench, { id: 'ramp.set', target: 'wrench.jaw', ramp: { shades } });
  assert.deepEqual(doc.nodes.find((n) => n.id === 'wrench.jaw').ramp, { shades });
  assert.deepEqual(plan.changedFields.ramp.to, { shades });
  assert.equal(doc.style.ramps.steel.join(), wrench.style.ramps.steel.join(), '共享色阶不受影响');
  const terminal = JSON.parse(readFileSync(join(here, '../../examples/studio/terminal.studio.json'), 'utf8'));
  assert.throws(() => applyOperation(terminal, { id: 'ramp.set', target: 'terminal.shell', ramp: { shades } }), (e) => e.code === 'CANDIDATE_INVALID');
});

test('非矩形几何的保护：钳口平移 OK；螺栓保护不命中', () => {
  const checks = run({ id: 'geometry.set', target: 'wrench.jaw', params: { vertices: [[11, 12], [18, 4], [22, 6], [20, 10], [17, 9], [14, 13]] } });
  assert.equal(checks.status, 'OK', JSON.stringify(checks.conflicts));
  assert.equal(checks.diff.outside, 0);
  assert.ok(checks.diff.pixels > 0);
});

test('bbox 透明角透变捕获：手柄平移改变螺栓区域内 1 个像素 → CANDIDATE_INVALID', () => {
  const v = wrench.nodes[0].vertices.map(([x, y]) => [x + 1, y]);
  const checks = run({ id: 'geometry.set', target: 'wrench.handle', params: { vertices: v } });
  assert.equal(checks.status, 'REJECTED');
  assert.equal(checks.code, 'CANDIDATE_INVALID');
  assert.ok(checks.conflicts.some((c) => c.kind === 'pixels' && c.target === 'wrench.bolt'), '应命中螺栓像素保护区域');
});

test('修改受保护的螺栓本身 → CONSTRAINT_CONFLICT', () => {
  assert.equal(run({ id: 'geometry.set', target: 'wrench.bolt', params: { rx: 3 } }).code, 'CONSTRAINT_CONFLICT');
  assert.equal(run({ id: 'ramp.set', target: 'wrench.bolt', ramp: 'steel' }).code, 'CONSTRAINT_CONFLICT');
});
