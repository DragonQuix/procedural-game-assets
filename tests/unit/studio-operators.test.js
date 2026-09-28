/**
 * tests/unit/studio-operators.test.js — 三个受约束文档变换
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyOperation, exploreOperation, StudioOperationError } from '../../src/studio/operators.js';

const here = dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(readFileSync(join(here, '../../examples/studio/terminal.studio.json'), 'utf8'));

function codeOf(fn) {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof StudioOperationError, `应为 StudioOperationError，实际 ${e}`);
    return e.code;
  }
  throw new Error('应抛出 StudioOperationError');
}

test('geometry.set：只改目标字段，plan 记录旧/新值，不改动输入文档', () => {
  const before = JSON.stringify(sample);
  const { doc, plan } = applyOperation(sample, { id: 'geometry.set', target: 'terminal.shell', params: { w: 28 } });
  assert.equal(JSON.stringify(sample), before);
  assert.equal(doc.nodes.find((n) => n.id === 'terminal.shell').w, 28);
  assert.equal(doc.nodes.find((n) => n.id === 'terminal.screen').w, 14);
  assert.deepEqual(plan, { id: 'geometry.set', target: 'terminal.shell', changedFields: { w: { from: 26, to: 28 } } });
  // 其余节点逐字段不变
  for (const n of doc.nodes) if (n.id !== 'terminal.shell') assert.deepEqual(n, sample.nodes.find((m) => m.id === n.id));
});

test('geometry.set 拒绝：空 params / 未知字段 / 非整数 / 越界结果', () => {
  assert.equal(codeOf(() => applyOperation(sample, { id: 'geometry.set', target: 'terminal.shell', params: {} })), 'CANDIDATE_INVALID');
  assert.equal(codeOf(() => applyOperation(sample, { id: 'geometry.set', target: 'terminal.shell', params: { width: 28 } })), 'CANDIDATE_INVALID');
  assert.equal(codeOf(() => applyOperation(sample, { id: 'geometry.set', target: 'terminal.shell', params: { w: 26.5 } })), 'CANDIDATE_INVALID');
  const code = codeOf(() => applyOperation(sample, { id: 'geometry.set', target: 'terminal.shell', params: { w: 40 } }));
  assert.equal(code, 'CANDIDATE_INVALID');
});

test('material.set / ramp.set：合法切换与非法取值', () => {
  const flat = applyOperation(sample, { id: 'material.set', target: 'terminal.shell', material: 'flat' });
  assert.equal(flat.doc.nodes.find((n) => n.id === 'terminal.shell').material, 'flat');
  assert.equal(codeOf(() => applyOperation(sample, { id: 'material.set', target: 'terminal.screen', material: 'bevel-metal' })), 'CANDIDATE_INVALID');
  const amber = applyOperation(sample, { id: 'ramp.set', target: 'terminal.screen', ramp: 'amber' });
  assert.equal(amber.doc.nodes.find((n) => n.id === 'terminal.screen').ramp, 'amber');
  assert.equal(codeOf(() => applyOperation(sample, { id: 'ramp.set', target: 'terminal.screen', ramp: 'ghost' })), 'CANDIDATE_INVALID');
});

test('拒绝：未知操作 / 未知目标 / 操作形状非法 / 未知操作字段', () => {
  assert.equal(codeOf(() => applyOperation(sample, { id: 'color.set', target: 'terminal.shell' })), 'UNSUPPORTED_OPERATION');
  assert.equal(codeOf(() => applyOperation(sample, { id: 'geometry.set', target: 'terminal.ghost', params: { w: 4 } })), 'CANDIDATE_INVALID');
  assert.equal(codeOf(() => applyOperation(sample, 'geometry.set')), 'INVALID_DOCUMENT');
  assert.equal(codeOf(() => applyOperation(sample, { id: 'geometry.set', target: 'terminal.shell', params: { w: 4 }, script: 'x' })), 'INVALID_DOCUMENT');
});

test('exploreOperation：同基准逐值派生；非法取值不中断整批', () => {
  const entries = exploreOperation(sample, { id: 'geometry.set', target: 'terminal.shell', field: 'w', values: [24, 26, 40] });
  assert.equal(entries.length, 3);
  assert.equal(entries[0].doc.nodes.find((n) => n.id === 'terminal.shell').w, 24);
  assert.equal(entries[1].plan.changedFields.w.to, 26);
  assert.equal(entries[2].error.code, 'CANDIDATE_INVALID'); // 40 越界
});

test('exploreOperation 拒绝：字段与操作不匹配 / 取值超限', () => {
  assert.equal(codeOf(() => exploreOperation(sample, { id: 'material.set', target: 'terminal.shell', field: 'w', values: ['flat'] })), 'CANDIDATE_INVALID');
  assert.equal(codeOf(() => exploreOperation(sample, { id: 'geometry.set', target: 'terminal.shell', field: 'w', values: Array.from({ length: 17 }, (_, i) => i) })), 'RESOURCE_LIMIT');
});
