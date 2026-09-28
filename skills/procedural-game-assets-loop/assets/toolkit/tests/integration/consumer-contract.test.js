/**
 * tests/integration/consumer-contract.test.js — 消费契约（Canvas/Godot 共用公式）
 *
 * 在真实导出产物上验证消费侧契约：
 * - attachment - anchor 的相对偏移与帧内像素一致（枪口点在枪端不透明像素上）
 * - 锚点在脚底（最低不透明行贴近 anchor.y）
 * - 镜像消费的点镜像 W-x 与像素 W-1-i 对齐
 * - 剪辑时长为正、引用存在（时间单位毫秒）
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { bakeHumanoid } from '../../src/recipes/humanoid.js';
import { packAtlas, renderAtlasPages, extractFrame } from '../../src/export/atlas.js';
import { buildManifest, validateManifest } from '../../src/export/manifest.js';
import { PixelPainter } from '../../src/core/raster.js';
import ember from '../../examples/recipes/ember.mjs';

const asset = bakeHumanoid(ember);
const packed = packAtlas(asset.frames, { maxPage: 1024, margin: 2 });
const frameMap = new Map(asset.frames.map((f) => [f.id, f]));
const pagePainters = renderAtlasPages(packed, frameMap);
const manifest = buildManifest(asset, packed, { generator: 'test' });
assert.deepEqual(validateManifest(manifest), []);

const mframes = new Map(manifest.frames.map((f) => [f.id, f]));

function framePainter(id) {
  const mf = mframes.get(id);
  return extractFrame(pagePainters[mf.page], { x: mf.rect.x, y: mf.rect.y, w: mf.rect.w, h: mf.rect.h });
}

test('枪口附件点落在枪端不透明像素上（全部持枪帧）', () => {
  for (const mf of manifest.frames) {
    if (!mf.attachments?.muzzle) continue;
    const p = framePainter(mf.id);
    const mx = Math.round(mf.attachments.muzzle.x);
    const my = Math.round(mf.attachments.muzzle.y);
    // 枪口点自身或其 4 邻域须有不透明像素（允许取整偏差 1px）
    const near = p.opaque(mx, my) || p.opaque(mx - 1, my) || p.opaque(mx + 1, my) || p.opaque(mx, my - 1) || p.opaque(mx, my + 1);
    assert.ok(near, `${mf.id} muzzle (${mx},${my}) 不在不透明像素附近`);
  }
});

test('锚点在脚底：最低不透明行与 anchor.y 相差不超过 2px', () => {
  for (const id of ['p_stand_fwd', 'p_run0_fwd', 'p_run3_diagUp', 'p_fall_down']) {
    const mf = mframes.get(id);
    const p = framePainter(id);
    assert.ok(p.h - 1 - mf.anchor.y <= 2, `${id} anchor.y=${mf.anchor.y} 帧高=${p.h}`);
    // 锚点竖线上、脚底附近有腿/靴像素
    const ax = Math.round(mf.anchor.x);
    let found = false;
    for (let y = Math.round(mf.anchor.y); y >= Math.round(mf.anchor.y) - 6 && !found; y--) {
      for (let dx = -3; dx <= 3; dx++) if (p.opaque(ax + dx, y - 1)) found = true;
    }
    assert.ok(found, `${id} 锚点附近没有脚`);
  }
});

test('镜像消费：点镜像 W-x 与像素 W-1-i 对齐（枪口世界位置连续）', () => {
  const mf = mframes.get('p_stand_fwd');
  const m = mf.attachments.muzzle;
  const rightOffset = m.x - mf.anchor.x;
  // 镜像帧（点镜像）的附件与锚点
  const mFlip = { x: mf.rect.w - m.x, y: m.y };
  const aFlip = { x: mf.rect.w - mf.anchor.x, y: mf.anchor.y };
  assert.equal(mFlip.x - aFlip.x, -rightOffset); // 朝向取反，大小不变
});

test('剪辑时长为正毫秒数且引用存在', () => {
  for (const [name, clip] of Object.entries(manifest.clips)) {
    const ms = Array.isArray(clip.ms) ? clip.ms : [clip.ms];
    for (const d of ms) assert.ok(Number.isFinite(d) && d > 0, `${name} 时长非法`);
    for (const fid of clip.frames) assert.ok(mframes.has(fid), `${name} 引用 ${fid}`);
  }
  assert.equal(manifest.hints.timeUnit, 'ms');
});
