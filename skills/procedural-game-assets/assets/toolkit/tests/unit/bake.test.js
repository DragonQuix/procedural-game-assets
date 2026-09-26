import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleFrame, computeBounds, DEFAULT_OUTLINE } from '../../src/bake/frame.js';
import { assembleAsset, BakeError } from '../../src/bake/asset.js';
import { bakeHumanoid } from '../../src/recipes/humanoid.js';
import { PixelPainter } from '../../src/core/raster.js';
import ember from '../../examples/recipes/ember.mjs';

test('assembleFrame：默认 1px 扩边 + 描边，锚点与附件点 +1 平移', () => {
  const p = new PixelPainter(4, 4);
  p.rect(1, 1, 2, 2, '#ff0000');
  const f = assembleFrame('t', p, { anchor: { x: 2, y: 4 }, attachments: { muzzle: { x: 3, y: 1 } } });
  assert.equal(f.width, 6);
  assert.equal(f.height, 6);
  assert.deepEqual(f.anchor, { x: 3, y: 5 });
  assert.deepEqual(f.attachments.muzzle, { x: 4, y: 2 });
  assert.equal(f.rgba.length, 6 * 6 * 4);
  // 描边色出现在原不透明像素的 4 邻域（(2,1) 即源 (1,0)，矩形上方）
  const c = DEFAULT_OUTLINE;
  const px = (x, y) => [...f.rgba.slice((y * 6 + x) * 4, (y * 6 + x) * 4 + 3)].map((v) => v.toString(16).padStart(2, '0')).join('');
  assert.equal(`#${px(2, 1)}`, c);
});

test('assembleFrame：outline:null 不扩边', () => {
  const p = new PixelPainter(4, 4);
  p.rect(1, 1, 2, 2, '#ff0000');
  const f = assembleFrame('t', p, { anchor: { x: 2, y: 4 }, outline: null });
  assert.equal(f.width, 4);
  assert.deepEqual(f.anchor, { x: 2, y: 4 });
});

test('computeBounds：不透明包围盒与全透明', () => {
  const p = new PixelPainter(6, 6);
  assert.equal(computeBounds(p), null);
  p.rect(2, 3, 2, 1, '#ffffff');
  assert.deepEqual(computeBounds(p), { x0: 2, y0: 3, x1: 4, y1: 4 });
});

test('assembleAsset 校验：ID 冲突、缺帧、非法时长、内存上限', () => {
  const mk = (id) => assembleFrame(id, new PixelPainter(2, 2), { anchor: { x: 1, y: 2 }, outline: null });
  assert.throws(() => assembleAsset({ id: 'a', kind: 'k', seed: 0, frames: [mk('x'), mk('x')] }), BakeError);
  assert.throws(() => assembleAsset({ id: 'a', kind: 'k', seed: 0, frames: [mk('x')], clips: { c: { frames: ['nope'], ms: 100 } } }), /引用不存在的帧 'nope'/);
  assert.throws(() => assembleAsset({ id: 'a', kind: 'k', seed: 0, frames: [mk('x')], clips: { c: { frames: ['x'], ms: 0 } } }), /时长/);
  assert.throws(() => assembleAsset({ id: 'a', kind: 'k', seed: 0, frames: [mk('x')], clips: { c: { frames: ['x'], ms: [100, 200] } } }), /≠ 帧数/);
  assert.throws(() => assembleAsset({ id: 'a', kind: 'k', seed: 0, frames: [mk('x')], memoryCap: 4 }), /超过上限/);
  const ok = assembleAsset({ id: 'a', kind: 'k', seed: 0, frames: [mk('x')], clips: { c: { frames: ['x'], ms: 100 } } });
  assert.equal(ok.frames.length, 1);
});

test('bakeHumanoid：ember 34 帧、锚点在脚底、附件含枪口与头', () => {
  const asset = bakeHumanoid(ember);
  assert.equal(asset.frames.length, 34);
  const stand = asset.frames.find((f) => f.id === 'p_stand_fwd');
  assert.deepEqual(stand.anchor, { x: 15, y: 47 }); // (14,46) + 1px 扩边
  assert.ok(stand.attachments.muzzle.x > stand.anchor.x); // 朝右枪口在身体右侧
  assert.ok(stand.bounds && stand.bounds.y1 <= stand.height);
  const ball = asset.frames.find((f) => f.id === 'p_ball0');
  assert.equal(ball.width, 22); // 20 + 2
  assert.deepEqual(ball.anchor, { x: 11, y: 25 }); // (10, 24) + 1
});

test('bakeHumanoid：帧约束不足时默认报错（不静默裁剪）', () => {
  const base = {
    kind: 'humanoid',
    id: 'cramped',
    seed: 0,
    palette: ember.palette,
    art: ember.art,
    rig: ember.rig,
    frame: { w: 20, h: 20, feetY: 20, bodyX: 10 },
    poses: [{ id: 'stand_fwd', kind: 'rig', legs: [[-9, 3], [11, 5]], aim: 'fwd' }],
  };
  assert.throws(() => bakeHumanoid(base), /绘制越界/);
  // 显式声明有意裁剪后可烘焙，诊断随帧返回
  const asset = bakeHumanoid({ ...base, clip: 'warn' });
  const clipped = asset.frames.filter((f) => f.diagnostics && f.diagnostics.clips > 0);
  assert.ok(clipped.length > 0);
});

test('bakeHumanoid：同配方同种子两次烘焙字节一致', () => {
  const a = bakeHumanoid(ember);
  const b = bakeHumanoid(ember);
  for (let i = 0; i < a.frames.length; i++) {
    assert.deepEqual([...a.frames[i].rgba], [...b.frames[i].rgba], a.frames[i].id);
  }
});
