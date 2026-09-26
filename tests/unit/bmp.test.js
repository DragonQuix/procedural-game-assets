import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeBMP } from '../../src/export/bmp.js';

test('BMP 头字段与尺寸', () => {
  const rgba = new Uint8ClampedArray(2 * 3 * 4);
  const bmp = encodeBMP(2, 3, rgba);
  assert.equal(bmp[0], 0x42);
  assert.equal(bmp[1], 0x4d);
  const view = new DataView(bmp.buffer);
  assert.equal(view.getUint32(2, true), 54 + 2 * 3 * 4);
  assert.equal(view.getUint32(10, true), 54);
  assert.equal(view.getInt32(18, true), 2);
  assert.equal(view.getInt32(22, true), 3);
  assert.equal(view.getUint16(28, true), 32);
});

test('像素位置：自底向上、BGR 序', () => {
  // 2×2：左上当红色，右下当绿色
  const rgba = new Uint8ClampedArray(16);
  rgba.set([255, 0, 0, 255], 0); // (0,0) 红
  rgba.set([0, 255, 0, 255], 12); // (1,1) 绿
  const bmp = encodeBMP(2, 2, rgba);
  // 文件第一行 = 图像底行 (y=1)：(0,1) 透明、(1,1) 绿
  assert.deepEqual([...bmp.slice(54, 58)], [0, 0, 0, 0]);
  assert.deepEqual([...bmp.slice(58, 62)], [0, 255, 0, 255]); // BGRA
  // 第二行 = 图像顶行：(0,0) 红
  assert.deepEqual([...bmp.slice(62, 66)], [0, 0, 255, 255]);
});

test('透明像素按 background 合成', () => {
  const rgba = new Uint8ClampedArray([255, 0, 0, 128]); // 半透明红
  const bmp = encodeBMP(1, 1, rgba, { background: '#000000' });
  const a = 128 / 255;
  assert.equal(bmp[54], 0); // B
  assert.equal(bmp[55], 0); // G
  assert.equal(bmp[56], Math.round(255 * a)); // R
  assert.equal(bmp[57], 128); // A 保留
  // 全透明 → 底色
  const t = encodeBMP(1, 1, new Uint8ClampedArray(4), { background: '#102030' });
  assert.deepEqual([...t.slice(54, 57)], [0x30, 0x20, 0x10]); // BGR
});

test('非法输入被拒绝', () => {
  assert.throws(() => encodeBMP(0, 2, new Uint8ClampedArray(8)), RangeError);
  assert.throws(() => encodeBMP(1, 1, new Uint8ClampedArray(8)), RangeError);
});
