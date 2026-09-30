import test from 'node:test';
import assert from 'node:assert/strict';
import { createRasterDocument, applyRasterOperation, compileRasterDocument, checkRasterCandidate, describeRasterCapabilities } from '../../src/studio/raster-doc.js';

const operation = (width = 2, height = 2) => ({ id: 'raster.resample', target: 'canvas', params: { width, height, sampling: 'nearest' } });
function fixture(width = 4, height = 4) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) rgba.set([x * 17, y * 19, 73, (x + y) % 3 ? 255 : 0], (y * width + x) * 4);
  return createRasterDocument({ id: 'size-probe', width, height, rgba, seed: 71,
    anchor: { x: width / 2 + 0.5, y: height }, attachments: { edge: { x: width, y: 0 }, grip: { x: 1.5, y: 3 } } });
}
function change(doc = fixture(), op = operation(), preserve = []) {
  const { doc: next, plan } = applyRasterOperation(doc, op);
  const baseCompiled = compileRasterDocument(doc), candidateCompiled = compileRasterDocument(next);
  return { next, plan, baseCompiled, candidateCompiled, checks: checkRasterCandidate({ baseCompiled, candidateCompiled, plan, preserve }) };
}

test('显式最近邻按目标像素中心采样；边界点等比变换且不取整、不改输入', () => {
  const doc = fixture(), saved = JSON.stringify(doc), result = change(doc);
  const a = result.baseCompiled.asset.frames[0], b = result.candidateCompiled.asset.frames[0];
  assert.deepEqual(result.next.canvas, { w: 2, h: 2 });
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    assert.deepEqual(b.rgba.slice((y * 2 + x) * 4, (y * 2 + x + 1) * 4), a.rgba.slice(((y * 2 + 1) * 4 + x * 2 + 1) * 4, ((y * 2 + 1) * 4 + x * 2 + 2) * 4));
  }
  assert.deepEqual(b.anchor, { x: 1.25, y: 2 });
  assert.deepEqual(b.attachments, { edge: { x: 2, y: 0 }, grip: { x: 0.75, y: 1.5 } });
  assert.equal(result.next.seed, 71); assert.equal(result.next.id, doc.id); assert.equal(result.next.schemaVersion, doc.schemaVersion);
  assert.equal(result.checks.status, 'OK'); assert.equal(result.checks.visualReview, 'UNVERIFIED');
  assert.deepEqual(result.checks.diff, { total: null, outside: null, reason: 'FRAME_SIZE_CHANGED' });
  assert.equal(result.checks.allowedRegion, null);
  assert.deepEqual(result.checks.resample.anchor, { from: doc.anchor, to: b.anchor });
  assert.equal(JSON.stringify(doc), saved);
});

test('放大复制二值 alpha；同尺寸为 UNCHANGED，边界点在最大尺寸内精确落边', () => {
  const result = change(fixture(), operation(8, 8)), a = result.baseCompiled.asset.frames[0], b = result.candidateCompiled.asset.frames[0];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const i = (Math.floor(y / 2) * 4 + Math.floor(x / 2)) * 4;
    assert.deepEqual(b.rgba.slice((y * 8 + x) * 4, (y * 8 + x + 1) * 4), a.rgba.slice(i, i + 4));
  }
  assert.equal(change(fixture(), operation(4, 4)).checks.status, 'UNCHANGED');
  assert.deepEqual(change(fixture(), operation(4, 4)).checks.diff, { total: 0, outside: 0 });
  const doc = createRasterDocument({ id: 'edge', width: 255, height: 255, anchor: { x: 255, y: 255 }, attachments: { edge: { x: 255, y: 255 } } });
  assert.deepEqual(change(doc, operation(256, 256)).next.anchor, { x: 256, y: 256 });
  const thin = createRasterDocument({ id: 'thin', width: 2, height: 4 });
  assert.deepEqual(change(thin, operation(1, 2)).next.canvas, { w: 1, h: 2 });
});

test('非整数比例仍按像素中心采样；同尺寸不让小数点位产生浮点漂移', () => {
  for (const [size, indices] of [[2, [0, 2]], [5, [0, 0, 1, 2, 2]]]) {
    const result = change(fixture(3, 3), operation(size, size));
    const source = result.baseCompiled.asset.frames[0], target = result.candidateCompiled.asset.frames[0];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const index = (indices[y] * 3 + indices[x]) * 4;
      assert.deepEqual(target.rgba.slice((y * size + x) * 4, (y * size + x + 1) * 4), source.rgba.slice(index, index + 4));
    }
  }
  const doc = { ...fixture(3, 3), anchor: { x: 0.1, y: 2.7 }, attachments: { grip: { x: 0.1, y: 2.7 } } };
  assert.deepEqual(change(doc, operation(3, 3)).next, doc);
});

test('尺寸、采样、宽高比与未知参数严格拒绝；不暗中拉伸、缩放或改保护', () => {
  for (const patch of [{ width: 0 }, { width: 257 }, { width: '2' }, { width: 2.5 }, { sampling: undefined }, { sampling: 'bilinear' }, { width: 3 }, { region: {} }, { anchor: { x: 0, y: 0 } }]) {
    assert.throws(() => applyRasterOperation(fixture(), { ...operation(), params: { ...operation().params, ...patch } }));
  }
  assert.throws(() => applyRasterOperation(fixture(), { ...operation(), target: 'anchor' }));
});

test('空白图改变尺寸也违反 pixels:canvas；元数据及 frameSize 保护按最终结果检查', () => {
  const doc = createRasterDocument({ id: 'blank', width: 4, height: 4, attachments: { edge: { x: 4, y: 4 } } });
  for (const p of [{ kind: 'pixels', target: 'canvas' }, { kind: 'metadata', target: 'frameSize' }, { kind: 'metadata', target: 'anchor' }, { kind: 'metadata', target: 'attachments.edge' }]) {
    const result = change({ ...doc, constraints: [p] }, operation(), [p]);
    assert.equal(result.checks.status, 'REJECTED'); assert.ok(result.checks.conflicts.some((c) => c.target === p.target));
    assert.deepEqual(result.next.constraints, [p]);
  }
});

test('检查不接受任意重画、错误坐标、结构或变换计划冒充重采样', () => {
  const result = change(), check = (doc, plan = result.plan) => checkRasterCandidate({ ...result, candidateCompiled: compileRasterDocument(doc), plan });
  for (const patch of [{ rgba: 'ff0000ff' + result.next.rgba.slice(8) }, { anchor: { x: 0, y: 0 } }, { seed: 72 }, { constraints: [{ kind: 'pixels', target: 'canvas' }] }]) {
    assert.equal(check({ ...result.next, ...patch }).status, 'REJECTED');
  }
  const plan = structuredClone(result.plan); plan.resample.from.w = 3;
  assert.equal(check(result.next, plan).status, 'REJECTED');
  const capabilities = describeRasterCapabilities(fixture());
  assert.ok(capabilities.operations.includes('raster.resample'));
  assert.equal(capabilities.resample.preserveAspectRatio, true);
});
