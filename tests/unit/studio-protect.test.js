/**
 * tests/unit/studio-protect.test.js — 候选保护：独立影响区域与像素/结构/元数据检查
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileStudioDocument } from '../../src/studio/compiler.js';
import { applyOperation } from '../../src/studio/operators.js';
import { checkCandidate, preserveFromDocument } from '../../src/studio/protect.js';

const here = dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(readFileSync(join(here, '../../examples/studio/terminal.studio.json'), 'utf8'));

const compile = (doc) => compileStudioDocument(doc, { toolVersion: 'test' });
const preserve = preserveFromDocument(compile(sample).document); // 样例声明：pixels terminal.screen + metadata anchor

function run(op, doc = sample, extraPreserve = []) {
  const base = compile(doc);
  const { doc: candDoc, plan } = applyOperation(base.document, op);
  const candidate = compile(candDoc);
  return checkCandidate({ baseCompiled: base, candidateCompiled: candidate, plan, preserve: [...preserve, ...extraPreserve] });
}

test('机箱加宽：OK；变化全部落在独立计算的允许区域内；屏幕像素与锚点保护通过', () => {
  const checks = run({ id: 'geometry.set', target: 'terminal.shell', params: { w: 28 } });
  assert.equal(checks.status, 'OK', JSON.stringify(checks.conflicts));
  assert.equal(checks.code, null);
  assert.ok(checks.diff.pixels > 0, '应有实际像素变化');
  assert.equal(checks.diff.outside, 0, '不允许有区域外变化');
  assert.deepEqual(checks.protections.pixels, ['terminal.screen']);
  assert.deepEqual(checks.protections.metadata, ['anchor']);
});

test('机箱缩窄到侧板边缘：OK；露出的透明区与描边变化都在允许区域内', () => {
  const checks = run({ id: 'geometry.set', target: 'terminal.shell', params: { w: 20 } });
  assert.equal(checks.status, 'OK', JSON.stringify(checks.conflicts));
  assert.equal(checks.diff.outside, 0);
});

test('相同取值：UNCHANGED，不冒充"已经改好"', () => {
  assert.equal(run({ id: 'geometry.set', target: 'terminal.shell', params: { w: 26 } }).status, 'UNCHANGED');
  assert.equal(run({ id: 'material.set', target: 'terminal.shell', material: 'bevel-metal' }).status, 'UNCHANGED');
});

test('material.set：OK 且只影响目标矩形；屏幕区域不受影响', () => {
  const checks = run({ id: 'material.set', target: 'terminal.shell', material: 'flat' });
  assert.equal(checks.status, 'OK', JSON.stringify(checks.conflicts));
  assert.ok(checks.diff.pixels > 0);
  assert.equal(checks.diff.outside, 0);
});

test('目标受像素保护：geometry.set / ramp.set 直接 CONSTRAINT_CONFLICT（前置，不经渲染）', () => {
  const geo = run({ id: 'geometry.set', target: 'terminal.screen', params: { w: 10 } });
  assert.equal(geo.status, 'REJECTED');
  assert.equal(geo.code, 'CONSTRAINT_CONFLICT');
  assert.ok(geo.conflicts.some((c) => c.target === 'terminal.screen' && c.upfront));
  const ramp = run({ id: 'ramp.set', target: 'terminal.screen', ramp: 'amber' });
  assert.equal(ramp.code, 'CONSTRAINT_CONFLICT');
});

test('篡改检测：锚点被改动 → 结构与元数据双重冲突', () => {
  const base = compile(sample);
  const { doc: candDoc, plan } = applyOperation(base.document, { id: 'geometry.set', target: 'terminal.shell', params: { w: 28 } });
  const forged = structuredClone(candDoc);
  forged.anchor = { x: 10, y: 20 }; // 合法但未经授权的改动（越界值会在校验期就被拒）
  const checks = checkCandidate({ baseCompiled: base, candidateCompiled: compile(forged), plan, preserve });
  assert.equal(checks.status, 'REJECTED');
  assert.equal(checks.code, 'CANDIDATE_INVALID');
  assert.ok(checks.conflicts.some((c) => c.kind === 'structure' && c.target === 'anchor'));
  assert.ok(checks.conflicts.some((c) => c.kind === 'metadata' && c.target === 'anchor'));
});

test('篡改检测：非目标节点被改动 → 结构冲突', () => {
  const base = compile(sample);
  const { doc: candDoc, plan } = applyOperation(base.document, { id: 'geometry.set', target: 'terminal.shell', params: { w: 28 } });
  const forged = structuredClone(candDoc);
  forged.nodes.find((n) => n.id === 'terminal.side_panel').x = 19;
  const checks = checkCandidate({ baseCompiled: base, candidateCompiled: compile(forged), plan, preserve });
  assert.equal(checks.status, 'REJECTED');
  assert.ok(checks.conflicts.some((c) => c.kind === 'structure' && c.target === 'terminal.side_panel'));
});

test('篡改检测：目标节点未声明字段被改动 → 结构冲突', () => {
  const base = compile(sample);
  const { doc: candDoc, plan } = applyOperation(base.document, { id: 'geometry.set', target: 'terminal.shell', params: { w: 28 } });
  const forged = structuredClone(candDoc);
  forged.nodes.find((n) => n.id === 'terminal.shell').y = 3; // 不在 changedFields 中
  const checks = checkCandidate({ baseCompiled: base, candidateCompiled: compile(forged), plan, preserve });
  assert.equal(checks.status, 'REJECTED');
  assert.ok(checks.conflicts.some((c) => c.kind === 'structure' && c.target === 'terminal.shell'));
});

test('像素泄漏检测：允许区域外的变化像素被发现并定位（屏幕受遮挡保护）', () => {
  const base = compile(sample);
  const { doc: candDoc, plan } = applyOperation(base.document, { id: 'geometry.set', target: 'terminal.shell', params: { w: 28 } });
  const candidate = compile(candDoc);
  // 人为污染一个屏幕中心像素（最终帧坐标），模拟渲染被改坏
  const frame = candidate.asset.frames[0];
  const cx = 12;
  const cy = 12;
  frame.rgba[(cy * frame.width + cx) * 4] = 255 - frame.rgba[(cy * frame.width + cx) * 4];
  const checks = checkCandidate({ baseCompiled: base, candidateCompiled: candidate, plan, preserve });
  assert.equal(checks.status, 'REJECTED');
  assert.equal(checks.code, 'CANDIDATE_INVALID');
  assert.ok(checks.diff.outside >= 1, '应识别出区域外变化');
  assert.ok(checks.conflicts.some((c) => c.kind === 'pixels' && c.target === 'terminal.screen'), '屏幕像素保护区域应命中');
});

test('未知元数据保护目标报错而非静默放过', () => {
  const checks = run({ id: 'material.set', target: 'terminal.side_panel', material: 'flat' }, sample, [{ kind: 'metadata', target: 'mystery' }]);
  assert.equal(checks.status, 'REJECTED');
  assert.ok(checks.conflicts.some((c) => c.kind === 'metadata' && c.target === 'mystery'));
});
