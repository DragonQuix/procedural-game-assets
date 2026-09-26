import test from 'node:test';
import assert from 'node:assert/strict';
import { PixelPainter } from '../../src/core/raster.js';
import { packColor } from '../../src/core/color.js';
import {
  flipHorizontal,
  rotate90,
  silhouette,
  pad,
  mirrorXPoint,
  rot90Point,
  translatePoint,
  mirrorXFramePoints,
  rot90FramePoints,
} from '../../src/core/transform.js';

function bytes(p) {
  return [...p.toRGBA()];
}

test('镜像两次恢复原图', () => {
  const p = new PixelPainter(5, 3);
  p.rect(0, 0, 2, 1, '#ff0000');
  p.set(4, 2, '#00ff00');
  assert.deepEqual(bytes(flipHorizontal(flipHorizontal(p))), bytes(p));
});

test('旋转四次恢复原图，奇数次尺寸互换', () => {
  const p = new PixelPainter(5, 3);
  p.rect(0, 0, 2, 1, '#ff0000');
  assert.deepEqual(bytes(rotate90(p, 4)), bytes(p));
  assert.deepEqual(bytes(rotate90(p, 8)), bytes(p));
  assert.deepEqual(bytes(rotate90(p, -4)), bytes(p));
  const r1 = rotate90(p, 1);
  assert.equal(r1.w, 3);
  assert.equal(r1.h, 5);
  // 逆时针一次 = 顺时针三次
  assert.deepEqual(bytes(rotate90(p, -1)), bytes(rotate90(p, 3)));
});

test('点镜像与像素镜像相差 1px 语义：像素中心严格对齐', () => {
  const W = 38;
  for (const i of [0, 3, 17, 37]) {
    const center = { x: i + 0.5, y: 7.25 };
    const m = mirrorXPoint(center, W);
    // 镜像后的中心应落在像素 W-1-i 内
    assert.equal(Math.floor(m.x), W - 1 - i);
    assert.equal(m.y, center.y);
  }
  // 锚点 (14,46) 镜像为 (24,46)——边界坐标，不减 1
  assert.deepEqual(mirrorXPoint({ x: 14, y: 46 }, 38), { x: 24, y: 46 });
});

test('点旋转与像素旋转对齐：中心 (i+0.5,j+0.5) → 像素 (H-1-j, i)', () => {
  const H = 46;
  for (const [i, j] of [[0, 0], [5, 13], [37, 45]]) {
    const r = rot90Point({ x: i + 0.5, y: j + 0.5 }, H);
    assert.equal(Math.floor(r.x), H - 1 - j);
    assert.equal(Math.floor(r.y), i);
  }
});

test('帧点随镜像一致：anchor/attachments 全部变换且不改动入参', () => {
  const meta = { anchor: { x: 14, y: 46 }, attachments: { muzzle: { x: 34, y: 27 }, head: { x: 10, y: 18 } } };
  const m = mirrorXFramePoints(meta, 38);
  assert.deepEqual(m.anchor, { x: 24, y: 46 });
  assert.deepEqual(m.attachments.muzzle, { x: 4, y: 27 });
  assert.deepEqual(meta.anchor, { x: 14, y: 46 }); // 不变
  // 两次镜像还原
  const back = mirrorXFramePoints(m, 38);
  assert.deepEqual(back, meta);
});

test('帧点随旋转一致：rot90FramePoints 逐次应用与像素旋转同构', () => {
  const W = 38;
  const H = 46;
  const meta = { anchor: { x: 14, y: 46 }, attachments: { muzzle: { x: 34, y: 27 } } };
  const r1 = rot90FramePoints(meta, W, H, 1);
  assert.deepEqual(r1.anchor, { x: 0, y: 14 }); // (46-46, 14)
  assert.deepEqual(r1.attachments.muzzle, { x: 19, y: 34 });
  const r4 = rot90FramePoints(meta, W, H, 4);
  assert.deepEqual(r4, meta);
  // 旋转 2 次 = 单次应用两次
  const r2 = rot90FramePoints(meta, W, H, 2);
  const r1again = rot90FramePoints(r1, H, W, 1);
  assert.deepEqual(r2, r1again);
});

test('padding 扩展画布且点随 +pad 平移', () => {
  const p = new PixelPainter(2, 2);
  p.set(0, 0, '#ff0000');
  const q = pad(p, 1);
  assert.equal(q.w, 4);
  assert.equal(q.h, 4);
  assert.ok(q.opaque(1, 1) && !q.opaque(0, 0));
  assert.deepEqual(translatePoint({ x: 2, y: 2 }, 1, 1), { x: 3, y: 3 });
  assert.throws(() => pad(p, -1), RangeError);
});

test('silhouette 保留形状、统一颜色（与原实现一致，alpha 恒为 255）', () => {
  const p = new PixelPainter(3, 1);
  p.set(1, 0, packColor('#123456', 0x80));
  const s = silhouette(p, '#ff0000');
  assert.ok(!s.opaque(0, 0));
  const [r, g, b, a] = [...s.toRGBA().slice(4, 8)];
  assert.deepEqual([r, g, b, a], [0xff, 0, 0, 0xff]);
});

test('像素与点联合一致性：翻转帧后镜像附件点落在镜像像素上', () => {
  // 构造不对称图：唯一不透明像素在 (0,0)，附件点取其中心
  const p = new PixelPainter(4, 2);
  p.set(0, 0, '#ffffff');
  const att = { x: 0.5, y: 0.5 };
  const fp = flipHorizontal(p);
  assert.ok(fp.opaque(3, 0));
  const fa = mirrorXPoint(att, 4);
  assert.deepEqual([Math.floor(fa.x), Math.floor(fa.y)], [3, 0]);
  // 旋转同样成立
  const rp = rotate90(p, 1);
  assert.ok(rp.opaque(1, 0)); // 像素 (H-1-0, 0) = (1,0)
  const ra = rot90Point(att, 2);
  assert.deepEqual([Math.floor(ra.x), Math.floor(ra.y)], [1, 0]);
});
