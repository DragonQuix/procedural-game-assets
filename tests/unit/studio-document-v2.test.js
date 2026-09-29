/**
 * tests/unit/studio-document-v2.test.js — pga-studio/2：poly/disc 几何、色阶局部覆盖、style.meta、版本隔离
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStudioDocument, normalizeStudioDocument, SCHEMA_VERSIONS } from '../../src/studio/document.js';

const here = dirname(fileURLToPath(import.meta.url));
const wrench = JSON.parse(readFileSync(join(here, '../../examples/studio/wrench.studio.json'), 'utf8'));
const terminal = JSON.parse(readFileSync(join(here, '../../examples/studio/terminal.studio.json'), 'utf8'));

const has = (doc, frag) => validateStudioDocument(doc).some((i) => `${i.target}|${i.code}|${i.message}`.includes(frag));

test('/2 样例合法；/1 样例在多版本校验器下依然合法且版本保留', () => {
  assert.deepEqual(validateStudioDocument(wrench), []);
  assert.deepEqual(validateStudioDocument(terminal), []);
  assert.equal(normalizeStudioDocument(wrench).schemaVersion, 'pga-studio/2');
  assert.equal(normalizeStudioDocument(terminal).schemaVersion, 'pga-studio/1');
  assert.deepEqual(SCHEMA_VERSIONS, ['pga-studio/1', 'pga-studio/2', 'pga-studio/3', 'pga-studio/4']);
  // 规范化保留 /2 结构
  const norm = normalizeStudioDocument(wrench);
  assert.deepEqual(norm.nodes.find((n) => n.id === 'wrench.handle').vertices, wrench.nodes[0].vertices);
  assert.equal(norm.style.meta.focusRamp, 'amber');
});

test('未知版本仍拒绝（/999 不存在）', () => {
  const doc = { ...structuredClone(wrench), schemaVersion: 'pga-studio/999' };
  const issues = validateStudioDocument(doc);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].target, 'schemaVersion');
});

test('版本隔离：/1 拒绝 poly/disc 节点、ramp 局部覆盖、style.meta 与 shade-diag', () => {
  const doc = structuredClone(terminal);
  doc.nodes[0] = { id: 'terminal.wing', kind: 'poly', vertices: [[1, 1], [5, 1], [3, 5]], ramp: 'steel', material: 'flat', layer: 4 };
  assert.ok(has(doc, 'UNSUPPORTED_OPERATION'));
  const doc2 = structuredClone(terminal);
  doc2.nodes[0].ramp = { shades: ['#000000', '#111111', '#222222', '#333333'] };
  assert.ok(has(doc2, 'pga-studio/1 的 ramp'));
  const doc3 = structuredClone(terminal);
  doc3.style.meta = { license: 'CC0' };
  assert.ok(has(doc3, 'style.meta'));
  const doc4 = structuredClone(terminal);
  doc4.nodes[0].material = 'shade-diag';
  assert.ok(has(doc4, 'UNSUPPORTED_OPERATION'));
});

test('/2 接受 shade-diag（panel/poly/disc），screen 仍拒绝', () => {
  const doc = structuredClone(wrench);
  assert.deepEqual(validateStudioDocument(doc), []);
  doc.nodes.push({ id: 'wrench.plate', kind: 'panel', x: 0, y: 0, w: 3, h: 3, ramp: 'steel', material: 'shade-diag', layer: 9 });
  assert.deepEqual(validateStudioDocument(doc), []);
  const bad = structuredClone(doc);
  bad.nodes.push({ id: 'wrench.dial', kind: 'screen', x: 0, y: 0, w: 4, h: 4, ramp: 'amber', material: 'shade-diag', layer: 10 });
  assert.ok(has(bad, 'UNSUPPORTED_OPERATION'));
});

test('poly vertices：数量/整数/范围/字段隔离', () => {
  for (const mutate of [
    (d) => (d.nodes[0].vertices = [[1, 1], [2, 2]]), // 太少
    (d) => (d.nodes[0].vertices = Array.from({ length: 9 }, (_, i) => [i, i])), // 太多
    (d) => (d.nodes[0].vertices = [[1.5, 1], [2, 2], [3, 3]]), // 非整数
    (d) => (d.nodes[0].vertices = [[1, 1], [2, 2], [99, 3]]), // 越界
    (d) => (d.nodes[0].x = 3), // poly 不得含 rect 字段
  ]) {
    const doc = structuredClone(wrench);
    mutate(doc);
    assert.ok(validateStudioDocument(doc).length > 0, `应被拒绝：${mutate}`);
  }
  const ok = structuredClone(wrench); // 合法的顶点改写（jaw 6 点 → 4 点）
  ok.nodes[1].vertices = [[11, 11], [18, 3], [22, 5], [14, 12]];
  assert.deepEqual(validateStudioDocument(ok), []);
});

test('disc：半径/边界/字段隔离', () => {
  for (const mutate of [
    (d) => (d.nodes[2].rx = 0),
    (d) => (d.nodes[2].cx = 1), // cx-rx < 0
    (d) => (d.nodes[2].cy = 23), // cy+ry = 25 > 24
    (d) => (d.nodes[2].w = 4), // disc 不得含 rect 字段
  ]) {
    const doc = structuredClone(wrench);
    mutate(doc);
    assert.ok(validateStudioDocument(doc).length > 0, `应被拒绝：${mutate}`);
  }
});

test('ramp 局部覆盖：形状校验与风格隔离', () => {
  const doc = structuredClone(wrench);
  doc.nodes[1].ramp = { shades: ['#1a1d24', '#333945', '#4d5566', '#7c8698'] };
  assert.deepEqual(validateStudioDocument(doc), []);
  const bad1 = structuredClone(wrench);
  bad1.nodes[1].ramp = { shades: ['#000000'] };
  assert.ok(has(bad1, 'ramp.shades'));
  const bad2 = structuredClone(wrench);
  bad2.nodes[1].ramp = { shades: ['#000000', '#111111', '#222222', '#333333'], extra: 1 };
  assert.ok(has(bad2, '未知字段'));
  const bad3 = structuredClone(wrench);
  bad3.nodes[1].ramp = 42;
  assert.ok(has(bad3, 'ramp'));
});

test('style.meta：白名单、长度、focusRamp 必须已声明', () => {
  const bad1 = structuredClone(wrench);
  bad1.style.meta.focusRamp = 'ghost';
  assert.ok(has(bad1, 'focusRamp'));
  const bad2 = structuredClone(wrench);
  bad2.style.meta.origin = 'x';
  assert.ok(has(bad2, '未知字段'));
  const bad3 = structuredClone(wrench);
  bad3.style.meta.notes = 'x'.repeat(201);
  assert.ok(has(bad3, 'notes'));
});
