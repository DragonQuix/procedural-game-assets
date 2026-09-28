/**
 * tests/unit/studio-compiler.test.js — Studio 编译桥：确定性、尺寸/padding、锚点、节点定位
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileStudioDocument, renderHash, describeCapabilities } from '../../src/studio/compiler.js';
import { StudioDocumentError, normalizeStudioDocument } from '../../src/studio/document.js';
import { assetToJSON, assetFromJSON } from '../../src/adapters/asset-file.js';
import { packColor } from '../../src/core/raster.js';

const here = dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(readFileSync(join(here, '../../examples/studio/terminal.studio.json'), 'utf8'));

const compile = (doc = sample) => compileStudioDocument(doc, { toolVersion: 'test' });
const px = (frame, x, y) => {
  const i = (y * frame.width + x) * 4;
  return [frame.rgba[i], frame.rgba[i + 1], frame.rgba[i + 2], frame.rgba[i + 3]];
};
const abgr = (hex) => {
  const v = packColor(hex);
  return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, v >>> 24];
};

test('确定性：同文档同种子两次编译，RGBA 与关键元数据哈希一致', () => {
  const a = compile();
  const b = compile();
  assert.equal(a.hashes.documentHash, b.hashes.documentHash);
  assert.equal(a.hashes.renderHash, b.hashes.renderHash);
  assert.deepEqual([...a.asset.frames[0].rgba], [...b.asset.frames[0].rgba]);
  assert.deepEqual(a.sceneMap, b.sceneMap);
  assert.equal(renderHash(a.asset.frames[0]), renderHash(b.asset.frames[0]));
});

test('种子敏感：改种子改变屏幕纹理但保持其余结构', () => {
  const a = compile();
  const doc2 = structuredClone(sample);
  doc2.seed = sample.seed + 1;
  const b = compile(doc2);
  assert.notEqual(a.hashes.renderHash, b.hashes.renderHash);
  assert.equal(a.sceneMap.final.w, b.sceneMap.final.w);
});

test('尺寸合同：内画布 30×30 → 最终 32×32（1px 描边扩边）', () => {
  const { asset, sceneMap } = compile();
  assert.deepEqual(sceneMap.inner, { w: 30, h: 30 });
  assert.deepEqual(sceneMap.final, { w: 32, h: 32 });
  assert.equal(asset.frames[0].width, 32);
  assert.equal(asset.frames[0].height, 32);
  assert.equal(sceneMap.padding, 1);
});

test('无描边配置：最终尺寸 = 内画布，锚点不平移', () => {
  const doc = structuredClone(sample);
  doc.canvas.outline = null;
  const { asset, sceneMap } = compile(doc);
  assert.deepEqual(sceneMap.final, { w: 30, h: 30 });
  assert.equal(sceneMap.padding, 0);
  assert.deepEqual(asset.frames[0].anchor, { x: 15, y: 28 });
});

test('锚点与附件点随 padding +1 平移（ADR-0002）', () => {
  const { asset } = compile();
  assert.deepEqual(asset.frames[0].anchor, { x: 16, y: 29 });
  assert.deepEqual(asset.frames[0].attachments.screenCenter, { x: 12, y: 12.5 });
});

test('节点定位：稳定 ID、最终帧坐标、屏幕在机箱内部、每节点都有像素', () => {
  const { sceneMap } = compile();
  assert.deepEqual(
    sceneMap.nodes.map((n) => n.id),
    ['terminal.base', 'terminal.shell', 'terminal.screen', 'terminal.side_panel'],
  );
  const byId = new Map(sceneMap.nodes.map((n) => [n.id, n]));
  assert.deepEqual(byId.get('terminal.shell').frameRect, { x: 3, y: 3, w: 26, h: 23 });
  const screen = byId.get('terminal.screen');
  const shell = byId.get('terminal.shell');
  assert.ok(screen.frameRect.x > shell.frameRect.x && screen.frameRect.y > shell.frameRect.y);
  assert.ok(screen.frameRect.x + screen.frameRect.w < shell.frameRect.x + shell.frameRect.w);
  for (const n of sceneMap.nodes) assert.ok(n.opaquePixels > 0, `${n.id} 无像素`);
  for (const n of sceneMap.nodes) assert.ok(n.frameBounds, `${n.id} 无包围盒`);
});

test('实际像素：倒角金属上缘受光、下缘阴影；屏幕扫描线材质生效', () => {
  const { asset } = compile();
  const f = asset.frames[0];
  const steel = sample.style.ramps.steel;
  // shell 内画布 (2,2) → 最终帧 (3,3)：上缘受光色、左上高光、下缘阴影
  assert.deepEqual(px(f, 5, 3), abgr(steel[2]), 'shell 上缘应为 light');
  assert.deepEqual(px(f, 3, 3), abgr(steel[3]), 'shell 左上角应为 highlight');
  assert.deepEqual(px(f, 5, 3 + 22), abgr(steel[0]), 'shell 下缘应为 shadow');
  assert.deepEqual(px(f, 4, 4), abgr(steel[1]), 'shell 内部（屏幕覆盖区之外）应为 base');
  // 屏幕边框为 shadow（screen 内画布 (4,5) → 最终 (5,6)）
  const scr = sample.style.ramps.screen;
  assert.deepEqual(px(f, 10, 6), abgr(scr[0]), 'screen 上边框应为 shadow');
  // 侧板使用 amber 色阶
  const amber = sample.style.ramps.amber;
  assert.deepEqual(px(f, 22, 6), abgr(amber[2]), 'side_panel 上缘应为 amber light');
});

test('旧格式兼容：kind 记为 prop，asset-file 往返一致，可被既有导出消费', () => {
  const { asset } = compile();
  assert.equal(asset.kind, 'prop');
  const back = assetFromJSON(assetToJSON(asset, { generator: 'test' }));
  assert.deepEqual([...back.frames[0].rgba], [...asset.frames[0].rgba]);
  assert.deepEqual(back.frames[0].anchor, asset.frames[0].anchor);
});

test('非法文档编译抛 StudioDocumentError，不静默修正', () => {
  const doc = structuredClone(sample);
  doc.nodes[1].w = 40;
  assert.throws(() => compile(doc), StudioDocumentError);
});

test('能力声明：逐节点操作范围与单位，引用实际画布与色阶', () => {
  const caps = describeCapabilities(normalizeStudioDocument(sample));
  const shell = caps.nodes['terminal.shell'];
  assert.equal(shell.operations['geometry.set'].fields.w.max, 30 - 2);
  assert.deepEqual(shell.operations['material.set'].options, ['flat', 'bevel-metal']);
  const screen = caps.nodes['terminal.screen'];
  assert.deepEqual(screen.operations['material.set'].options, ['flat', 'scanlines']);
  assert.deepEqual(shell.operations['ramp.set'].options, ['steel', 'screen', 'amber']);
});
