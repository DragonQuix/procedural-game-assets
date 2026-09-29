import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateContactSheet, targetCrop, diffOverlay } from '../../src/observe/frame-views.js';
import { compileStudioDocument } from '../../src/studio/compiler.js';
import { borderFixture } from '../fixtures/studio-v13.js';

const frame = () => compileStudioDocument(borderFixture()).asset.frames[0];
test('target_crop 最终坐标可复现，nearest-neighbor 精确复制 RGBA', () => {
  const f = frame(), c = targetCrop(f, { rect: { x: 8, y: 31, w: 5, h: 6 }, scale: 3, identity: { revision: 'r1', candidateId: 'c-test' } });
  assert.deepEqual(c.meta.crop, { x: 8, y: 31, w: 5, h: 6 });
  assert.equal(c.meta.candidateId, 'c-test');
  for (let y = 0; y < c.display.height; y++) for (let x = 0; x < c.display.width; x++) {
    const i = (y * c.display.width + x) * 4, j = ((31 + Math.floor(y / 3)) * f.width + 8 + Math.floor(x / 3)) * 4;
    assert.deepEqual(c.display.rgba.slice(i, i + 4), f.rgba.slice(j, j + 4));
  }
  assert.throws(() => targetCrop(f, { rect: { x: 0.5, y: 1, w: 2, h: 2 } }), RangeError);
});
test('contact sheet 索引与候选标签/矩形一一对应', () => {
  const f = frame(), s = candidateContactSheet([{ frame: f, identity: { revision: 'r1' } }, { frame: f, identity: { candidateId: 'c-12345678', revision: 'r1' } }]);
  assert.deepEqual(s.meta.cells.map((c) => c.label), ['r1', 'c-12345678']);
  assert.deepEqual(s.meta.cells.map((c) => c.index), [0, 1]);
  assert.equal(s.meta.cells[1].displayRect.x, s.meta.cells[1].nativeRect.x * 4);
});
test('diff 按像素计算，精确边界；overlay 不修改可导出的原帧', () => {
  const a = frame(), b = frame(), saved = new Uint8ClampedArray(a.rgba);
  b.rgba.set([1, 2, 3, 255], 0);
  const candidateSaved = new Uint8ClampedArray(b.rgba), d = diffOverlay(a, b, { scale: 2 });
  assert.equal(d.meta.changedPixelCount, 1);
  assert.deepEqual(d.meta.changedBounds, { x0: 0, y0: 0, x1: 1, y1: 1 });
  assert.deepEqual(d.native.rgba.slice(0, 4), new Uint8ClampedArray([255, 64, 160, 255]));
  assert.deepEqual(a.rgba, saved);
  assert.deepEqual(b.rgba, candidateSaved);
});
