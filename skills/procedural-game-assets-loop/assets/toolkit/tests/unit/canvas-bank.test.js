import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasBank, clipFrameAt, attachmentWorld } from '../../src/adapters/canvas.js';
import { bakeHumanoid } from '../../src/recipes/humanoid.js';
import ember from '../../examples/recipes/ember.mjs';

/** 记录像素写入的 stub Canvas 工厂（Node 无 DOM，验证适配逻辑）。 */
function stubFactory() {
  const calls = [];
  const factory = (w, h) => ({ w, h, kind: 'stub-canvas' });
  const putPixels = (canvas, w, h, rgba) => calls.push({ canvas, w, h, rgba: new Uint8ClampedArray(rgba) });
  return { factory, putPixels, calls };
}

const asset = bakeHumanoid(ember);

test('CanvasBank：启动烘焙缓存为精灵，锚点/附件点随帧返回', () => {
  const { factory, putPixels, calls } = stubFactory();
  const bank = createCanvasBank({ assets: [asset], makeCanvas: factory, putPixels });
  const s = bank.sprite('p_stand_fwd');
  assert.equal(s.width, 40);
  assert.equal(s.height, 48);
  assert.deepEqual(s.anchor, { x: 15, y: 47 });
  assert.equal(calls.length, 1);
  // 缓存：再取不重复写像素
  bank.sprite('p_stand_fwd');
  assert.equal(calls.length, 1);
  // 像素与烘焙结果一致（与导出路径同源）
  const f = bank.frame('p_stand_fwd');
  assert.deepEqual([...calls[0].rgba], [...f.rgba]);
});

test('CanvasBank：flip 变体像素镜像且锚点 W-x 联动', () => {
  const { factory, putPixels, calls } = stubFactory();
  const bank = createCanvasBank({ assets: [asset], makeCanvas: factory, putPixels });
  const orig = bank.sprite('p_stand_fwd');
  const flip = bank.sprite('p_stand_fwd', 'flip');
  assert.equal(flip.anchor.x, orig.width - orig.anchor.x);
  assert.equal(flip.attachments.muzzle.x, orig.width - orig.attachments.muzzle.x);
  const flipPx = calls.at(-1).rgba;
  const f = bank.frame('p_stand_fwd');
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      const a = (y * f.width + x) * 4;
      const b = (y * f.width + (f.width - 1 - x)) * 4;
      assert.deepEqual([...flipPx.slice(a, a + 4)], [...f.rgba.slice(b, b + 4)]);
    }
  }
});

test('CanvasBank：flash 变体不透明处全白、形状不变', () => {
  const { factory, putPixels, calls } = stubFactory();
  const bank = createCanvasBank({ assets: [asset], makeCanvas: factory, putPixels });
  bank.sprite('p_stand_fwd', 'flash');
  const px = calls.at(-1).rgba;
  const f = bank.frame('p_stand_fwd');
  for (let i = 0; i < f.rgba.length; i += 4) {
    if (f.rgba[i + 3] > 0) {
      assert.deepEqual([...px.slice(i, i + 3)], [255, 255, 255]);
    } else {
      assert.equal(px[i + 3], 0);
    }
  }
});

test('CanvasBank：帧 ID 冲突报错，缺帧报错', () => {
  const { factory, putPixels } = stubFactory();
  assert.throws(() => createCanvasBank({ assets: [asset, asset], makeCanvas: factory, putPixels }), /冲突/);
  const bank = createCanvasBank({ assets: [asset], makeCanvas: factory, putPixels });
  assert.throws(() => bank.sprite('nope'), /没有帧 'nope'/);
});

test('clipFrameAt：按毫秒序列取帧，支持负时间与数组时长', () => {
  const clip = { frames: ['a', 'b', 'c'], ms: 100 };
  assert.equal(clipFrameAt(clip, 0), 'a');
  assert.equal(clipFrameAt(clip, 99), 'a');
  assert.equal(clipFrameAt(clip, 100), 'b');
  assert.equal(clipFrameAt(clip, 250), 'c');
  assert.equal(clipFrameAt(clip, 300), 'a'); // 循环
  assert.equal(clipFrameAt(clip, -1), 'c');
  const uneven = { frames: ['a', 'b'], ms: [50, 150] };
  assert.equal(clipFrameAt(uneven, 49), 'a');
  assert.equal(clipFrameAt(uneven, 50), 'b');
  assert.equal(clipFrameAt(uneven, 199), 'b');
  assert.equal(clipFrameAt(uneven, 200), 'a');
});

test('attachmentWorld：朝向取反、大小不变（消费公式）', () => {
  const f = bank0().frame('p_stand_fwd');
  const pos = { x: 100, y: 50 };
  const right = attachmentWorld(f, 'muzzle', pos, 1);
  const left = attachmentWorld(f, 'muzzle', pos, -1);
  assert.equal(right.x - pos.x, -(left.x - pos.x));
  assert.equal(right.y, left.y);
  assert.equal(attachmentWorld(f, 'nope', pos), null);
});

function bank0() {
  const { factory, putPixels } = stubFactory();
  return createCanvasBank({ assets: [asset], makeCanvas: factory, putPixels });
}
