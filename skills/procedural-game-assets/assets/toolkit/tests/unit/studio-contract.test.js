import test from 'node:test';
import assert from 'node:assert/strict';
import { compileStudioDocument as compile } from '../../src/studio/compiler.js';
import { applyOperation } from '../../src/studio/operators.js';
import { checkCandidate } from '../../src/studio/protect.js';
import { borderFixture, t05Operation } from '../fixtures/studio-v13.js';

test('T05-D-r1 等价回归：最终外描边 (7..33,38) 的 27px 被合同拒绝', () => {
  const base = compile(borderFixture());
  const { doc, plan } = applyOperation(base.document, t05Operation);
  const candidate = compile(doc);
  const checks = checkCandidate({ baseCompiled: base, candidateCompiled: candidate, plan, revision: 'r1' });
  assert.equal(checks.operationFootprintStatus, 'PASS');
  assert.equal(checks.taskContractStatus, 'REJECTED');
  const c = checks.conflicts.find((c) => c.protectionType === 'pixels');
  assert.equal(c.changedPixelCount, 27);
  assert.deepEqual(c.changedBounds, { x0: 7, y0: 38, x1: 34, y1: 39 });
  assert.equal(c.affectedNode, 'beacon.base');
  assert.equal(c.operator, 'geometry.set');
  assert.equal(c.revision, 'r1');
  assert.match(c.suggestedInspectAction, /inspect/);
});

test('邻近合法变化通过，合同与基线参与 documentHash', () => {
  const base = compile(borderFixture());
  const { doc } = applyOperation(base.document, { ...t05Operation, params: { x: 6, y: 32, w: 27, h: 4 } });
  assert.equal(compile(doc).protection.status, 'PASS');
  const changed = borderFixture(); changed.protection.metadataPaths.push('bounds');
  assert.notEqual(compile(changed).hashes.documentHash, base.hashes.documentHash);
});

test('metadata-only 变化独立拒绝，bounds 路径用最终帧比较', () => {
  const doc = borderFixture(), before = compile(doc);
  doc.anchor.x++;
  const after = compile(doc);
  assert.deepEqual(after.asset.frames[0].rgba, before.asset.frames[0].rgba);
  assert.equal(after.protection.conflicts[0].protectionType, 'metadata');
  const bounds = borderFixture(); bounds.protection.metadataPaths.push('bounds');
  bounds.nodes[0].x--;
  assert.ok(compile(bounds).protection.conflicts.some((c) => c.path === 'bounds'));
});

test('受保护节点语义变化即拒绝，即使 RGBA 不变', () => {
  const doc = borderFixture(); doc.nodes[1].layer++;
  assert.equal(compile(doc).protection.conflicts[0].protectionType, 'node');
});

test('rect 与稀疏 mask 支持透明像素保护，多类合同采用 AND', () => {
  const doc = borderFixture();
  doc.protection.protectedRegions = [{ x: 9, y: 33, w: 2, h: 1, mask: [1, 0] }];
  doc.nodes[0].ramp = { shades: ['#000000', '#ffffff', '#000000', '#ffffff'] };
  doc.anchor.x++;
  const conflicts = compile(doc).protection.conflicts;
  assert.equal(conflicts.find((c) => c.protectionType === 'pixels').changedPixelCount, 1);
  assert.ok(conflicts.some((c) => c.protectionType === 'metadata'));
});

test('合同 schema 拒绝递归基线、函数字段、非法 mask/path 和旧版悄悄使用合同', () => {
  for (const mutate of [
    (d) => { d.protection.baseline.schemaVersion = 'pga-studio/3'; },
    (d) => { d.protection.eval = '() => true'; },
    (d) => { d.protection.protectedRegions = [{ x: 0, y: 0, w: 2, h: 1, mask: [1] }]; },
    (d) => { d.protection.metadataPaths = ['attachments.__proto__']; },
    (d) => { d.schemaVersion = 'pga-studio/2'; },
  ]) { const doc = borderFixture(); mutate(doc); assert.throws(() => compile(doc), { code: 'INVALID_DOCUMENT' }); }
});
