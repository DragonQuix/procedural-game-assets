/**
 * tests/unit/studio-compiler-v2.test.js — /2 渲染：poly/disc 绘制、shade-diag 体积概括、
 * 局部覆盖渲染隔离、/1 渲染回归锚点。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileStudioDocument, nodeRect } from '../../src/studio/compiler.js';
import { packColor } from '../../src/core/raster.js';

const here = dirname(fileURLToPath(import.meta.url));
const wrench = JSON.parse(readFileSync(join(here, '../../examples/studio/wrench.studio.json'), 'utf8'));
const terminal = JSON.parse(readFileSync(join(here, '../../examples/studio/terminal.studio.json'), 'utf8'));

const compile = (doc) => compileStudioDocument(doc, { toolVersion: 'test' });
const px = (frame, x, y) => {
  const i = (y * frame.width + x) * 4;
  return [frame.rgba[i], frame.rgba[i + 1], frame.rgba[i + 2], frame.rgba[i + 3]];
};
const abgr = (hex) => {
  const v = packColor(hex);
  return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, v >>> 24];
};

test('/1 渲染回归锚点：终端 renderHash 与逐节点掩码不变', () => {
  const { hashes, sceneMap } = compile(terminal);
  assert.equal(hashes.renderHash, 'f645726c:6cebd809', 'pga-studio/1 渲染行为不得漂移');
  assert.deepEqual(sceneMap.final, { w: 32, h: 32 });
});

test('poly/disc 渲染：非矩形剪影、声明 bbox、确定性', () => {
  const a = compile(wrench);
  const b = compile(wrench);
  assert.deepEqual([...a.asset.frames[0].rgba], [...b.asset.frames[0].rgba]);
  const byId = new Map(a.sceneMap.nodes.map((n) => [n.id, n]));
  assert.deepEqual(byId.get('wrench.handle').rect, { x: 5, y: 10, w: 9, h: 11 }, 'poly rect 为顶点 bbox');
  assert.deepEqual(byId.get('wrench.bolt').rect, { x: 4, y: 18, w: 4, h: 4 }, 'disc rect 为半径 bbox');
  assert.equal(nodeRect(wrench.nodes[0]).w, 9);
  for (const n of a.sceneMap.nodes) assert.ok(n.opaquePixels < n.frameRect.w * n.frameRect.h, `${n.id} 应是非矩形剪影`);
  // 掩码与像素数一致
  for (const [id, mask] of Object.entries(a.masks)) {
    const count = mask.reduce((s, v) => s + v, 0);
    assert.equal(count, byId.get(id).opaquePixels);
  }
});

test('shade-diag：分带规则在独立矩形上逐像素精确成立', () => {
  const doc = {
    schemaVersion: 'pga-studio/2',
    id: 'shadeprobe',
    seed: 7,
    renderProfile: { name: 'pixel-flat', version: 1 },
    style: { id: 'probe', version: 1, ramps: { steel: wrench.style.ramps.steel } },
    canvas: { w: 14, h: 10, outline: null },
    nodes: [{ id: 'shadeprobe.body', kind: 'panel', x: 2, y: 2, w: 10, h: 6, ramp: 'steel', material: 'shade-diag', layer: 0 }],
    anchor: { x: 7, y: 8 },
  };
  const { asset } = compile(doc);
  const f = asset.frames[0]; // 无描边：内画布 = 最终帧
  const steel = wrench.style.ramps.steel;
  // span = 10+6-2 = 14；t = ((x-2)+(y-2))/14
  assert.deepEqual(px(f, 2, 2), abgr(steel[3]), 't=0 应为 highlight');
  assert.deepEqual(px(f, 4, 3), abgr(steel[2]), 't≈0.21 应为 light');
  assert.deepEqual(px(f, 6, 4), abgr(steel[1]), 't≈0.43 应为 base');
  assert.deepEqual(px(f, 11, 7), abgr(steel[0]), 't=1 应为 shadow');
  const flat = structuredClone(doc);
  flat.nodes[0].material = 'flat';
  const f2 = compile(flat).asset.frames[0];
  assert.deepEqual(px(f2, 2, 2), abgr(steel[1]), 'flat 无分带');
  assert.deepEqual(px(f2, 11, 7), abgr(steel[1]), 'flat 无分带');
});

test('局部覆盖与共享色阶同名同值时渲染一致；覆盖只作用于目标节点', () => {
  const base = compile(wrench);
  const overridden = structuredClone(wrench);
  overridden.nodes[1].ramp = { shades: [...wrench.style.ramps.steel] }; // 与共享 steel 同值的局部覆盖
  const c = compile(overridden);
  assert.deepEqual([...c.asset.frames[0].rgba], [...base.asset.frames[0].rgba], '同值局部覆盖渲染应与共享引用一致');
  // 真正改色：只影响钳口，手柄保持共享 steel
  const red = structuredClone(wrench);
  red.nodes[1].ramp = { shades: ['#3d0f1a', '#8a1f2f', '#ff4a3d', '#ffb08a'] };
  const cr = compile(red);
  const fr = cr.asset.frames[0];
  // 钳口内部：最终帧 (14,9) 为局部 light，(17,9) 为局部 base（形状斜带内不会出现 bbox 极端阴影带）
  assert.deepEqual(px(fr, 14, 9), abgr('#ff4a3d'), '钳口局部覆盖受光带生效');
  assert.deepEqual(px(fr, 17, 9), abgr('#8a1f2f'), '钳口局部覆盖基色带生效');
  // 手柄内部 (9,16)（最终帧 (10,17)）t≈0.56 → 共享 steel base 不变
  assert.deepEqual(px(fr, 10, 17), abgr(wrench.style.ramps.steel[1]), '手柄共享色阶不变');
});

test('/2 资产同样产出既有 BakedAsset 合同（kind=prop，单帧）', () => {
  const { asset, sceneMap } = compile(wrench);
  assert.equal(asset.kind, 'prop');
  assert.equal(asset.frames.length, 1);
  assert.deepEqual(sceneMap.final, { w: 26, h: 26 });
  assert.deepEqual(asset.frames[0].anchor, { x: 13, y: 23 });
});
