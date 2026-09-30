import test from 'node:test';
import assert from 'node:assert/strict';
import { PixelPainter } from '../../src/core/raster.js';
import { createRasterDocument, compileRasterDocument, applyRasterOperation, checkRasterCandidate, normalizeRasterDocument, rgbaToHex } from '../../src/studio/raster-doc.js';
import { compileAny, docKindOf } from '../../src/studio/dispatch.js';
import { buildViews, buildCharacterViews } from '../../src/studio/observe.js';

const blank = () => createRasterDocument({ id: 'sample', width: 8, height: 8 });
const region = { id: 'detail', x: 2, y: 2, w: 3, h: 2, mask: ['010', '111'] };
const draw = { id: 'raster.draw', target: 'canvas', params: { region, commands: [{ kind: 'rect', x: 0, y: 0, w: 3, h: 2, color: '#ff7700' }] } };
const change = (base, op = draw) => {
  const applied = applyRasterOperation(base, op);
  return { ...applied, compiled: compileRasterDocument(applied.doc), base: compileRasterDocument(base) };
};

test('位图文档严格分派、尺寸精确、无隐式描边；编译确定且不修改输入', () => {
  const doc = blank(), before = JSON.stringify(doc), a = compileAny(doc), b = compileAny(doc);
  assert.equal(docKindOf(doc), 'raster');
  assert.deepEqual(a.hashes, b.hashes);
  assert.deepEqual(a.asset.frames[0].anchor, { x: 4, y: 8 });
  assert.equal(a.asset.kind, 'raster');
  assert.equal(a.asset.frames[0].width, 8);
  assert.equal(a.asset.frames[0].height, 8);
  assert.equal(a.asset.frames[0].bounds, null);
  assert.equal(JSON.stringify(doc), before);
  for (const schemaVersion of ['pga-studio/raster/2', 'pga-studio/character/99', 'other']) assert.throws(() => compileAny({ ...doc, schemaVersion }), /未知/);
});

test('拒绝非法像素、半透明、未知字段、越界、危险名称和错误保护', () => {
  const cases = [
    { rgba: '00' }, { rgba: '0000007f'.repeat(64) }, { canvas: { w: 257, h: 8 } },
    { anchor: { x: -1, y: 8 } }, { attachments: { prototype: { x: 0, y: 0 } } }, { url: 'https://example.com' },
    { constraints: [{ kind: 'pixels', target: 'missing' }] },
  ];
  for (const patch of cases) assert.throws(() => normalizeRasterDocument({ ...blank(), ...patch }));
  assert.throws(() => createRasterDocument({ id: 'sample', width: 100000, height: 100000 }));
});

test('事先声明的掩码限制绘制；透明擦除包含所有通道且保持选区外不变', () => {
  const result = change(blank());
  const frame = result.compiled.asset.frames[0];
  assert.equal(result.compiled.diagnostics.opaquePixels, 4);
  assert.equal(frame.rgba[(2 * 8 + 2) * 4 + 3], 0, 'mask=0 保持透明');
  const checks = checkRasterCandidate({ baseCompiled: result.base, candidateCompiled: result.compiled, plan: result.plan });
  assert.deepEqual(checks.diff, { total: 4, outside: 0 });
  assert.equal(checks.status, 'OK');
  assert.equal(checks.visualReview, 'UNVERIFIED');
  const erase = change(result.doc, { ...draw, params: { region, commands: [{ kind: 'rect', x: 0, y: 0, w: 3, h: 2, color: null }] } });
  assert.equal(erase.doc.rgba, blank().rgba);
  assert.equal(JSON.stringify(region), JSON.stringify(draw.params.region));
});

test('局部位图替换支持透明清除；元数据、未选像素精确保留', () => {
  const base = change(blank()).doc;
  const applied = change(base, { id: 'raster.replace', target: 'canvas', params: { region: { ...region, mask: ['010', '000'] }, rgba: '00000000'.repeat(6) } });
  assert.equal(applied.compiled.diagnostics.opaquePixels, 3);
  assert.deepEqual(applied.doc.anchor, base.anchor);
  assert.equal(checkRasterCandidate({ baseCompiled: applied.base, candidateCompiled: applied.compiled, plan: applied.plan }).diff.total, 1);
});

test('pixel/rect/line/poly 与底层 painter 一致，批量有界、越界不会裁掉继续', () => {
  const commands = [
    { kind: 'pixel', x: 0, y: 0, color: '#ff0000' },
    { kind: 'line', x0: 1, y0: 1, x1: 5, y1: 1, color: '#00ff00' },
    { kind: 'poly', points: [[1, 3], [6, 3], [3, 7]], color: '#0000ff' },
  ];
  const op = { id: 'raster.draw', target: 'canvas', params: { region: { id: 'whole', x: 0, y: 0, w: 8, h: 8 }, commands } };
  const p = new PixelPainter(8, 8); p.set(0, 0, '#ff0000'); p.line(1, 1, 5, 1, '#00ff00'); p.poly([[1, 3], [6, 3], [3, 7]], '#0000ff');
  assert.equal(applyRasterOperation(blank(), op).doc.rgba, rgbaToHex(p.toRGBA()));
  for (const params of [
    { ...op.params, commands: Array(129).fill(commands[0]) },
    { ...op.params, commands: [{ kind: 'pixel', x: 8, y: 0, color: '#ffffff' }] },
    { ...op.params, region: { ...region, mask: ['000', '000'] } },
    { ...op.params, region: { ...region, mask: ['01', '111'] } },
  ]) assert.throws(() => applyRasterOperation(blank(), { ...op, params }));
});

test('独立检查拒绝选区外像素、元数据偷改，不能从实际差分反推允许域', () => {
  const { doc, base, plan } = change(blank());
  const outside = compileRasterDocument({ ...doc, rgba: 'ff0000ff' + doc.rgba.slice(8) });
  const checks = checkRasterCandidate({ baseCompiled: base, candidateCompiled: outside, plan });
  assert.equal(checks.status, 'REJECTED');
  assert.equal(checks.diff.outside, 1);
  const metadata = compileRasterDocument({ ...doc, anchor: { x: 1, y: 8 } });
  assert.equal(checkRasterCandidate({ baseCompiled: base, candidateCompiled: metadata, plan }).status, 'REJECTED');
});

test('元数据修改和请求保护有效；未变化返回 UNCHANGED', () => {
  const result = change(blank(), { id: 'raster.metadata', target: 'anchor', value: { x: 3, y: 7 } });
  const args = { baseCompiled: result.base, candidateCompiled: result.compiled, plan: result.plan };
  assert.equal(checkRasterCandidate(args).status, 'OK');
  assert.equal(checkRasterCandidate({ ...args, preserve: [{ kind: 'metadata', target: 'anchor' }] }).status, 'REJECTED');
  const again = change(result.doc, { id: 'raster.metadata', target: 'anchor', value: { x: 3, y: 7 } });
  assert.equal(checkRasterCandidate({ baseCompiled: again.base, candidateCompiled: again.compiled, plan: again.plan }).status, 'UNCHANGED');
});

test('观察含明暗背景、剪影、选区和裁切；图层不污染资产', () => {
  const result = change(blank());
  const hash = result.compiled.hashes.renderHash;
  const views = buildViews(result.compiled, { displayScale: 2, region });
  for (const key of ['native', 'display', 'light', 'silhouette', 'selection', 'crop']) assert.ok(views[key].rgba.length);
  assert.equal(views.meta.region.id, 'detail');
  assert.equal(compileRasterDocument(result.doc).hashes.renderHash, hash);
  assert.throws(() => buildViews(result.compiled, { node: 'canvas', region }));
  assert.throws(() => buildCharacterViews({ kind: 'character' }, { region }), /region/);
});

test('局部浅底与剪影显出透明缺口；保留邻域、掩码内外像素与原始裁切', () => {
  const painter = new PixelPainter(8, 8);
  painter.rect(1, 2, 4, 1, '#0d1116');
  painter.rect(2, 4, 2, 2, '#34434e');
  const doc = createRasterDocument({ id: 'seam', width: 8, height: 8, rgba: painter.toRGBA() });
  const compiled = compileRasterDocument(doc), before = new Uint8ClampedArray(compiled.asset.frames[0].rgba);
  for (const cropRegion of [region, { id: 'edge', x: 0, y: 0, w: 3, h: 4 }]) {
    for (const scale of [1, 3]) {
      const views = buildViews(compiled, { region: cropRegion, displayScale: scale, revision: 'r1', candidateId: 'c-seam' });
      const { crop, cropLight, cropSilhouette } = views;
      assert.ok(cropLight && cropSilhouette, '局部审图无需依赖宿主的透明背景颜色');
      assert.equal(cropLight.width, crop.width * scale); assert.equal(cropLight.height, crop.height * scale);
      assert.equal(cropSilhouette.width, cropLight.width); assert.equal(cropSilhouette.height, cropLight.height);
      assert.deepEqual(views.meta.target_crop.backgrounds, { light: '#eee8db', silhouette: '#eee8db' });
      assert.equal(views.meta.target_crop.candidateId, 'c-seam'); assert.equal(views.meta.target_crop.regionId, cropRegion.id);
      assert.equal(views.meta.target_crop.documentHash, compiled.hashes.documentHash);
      for (let y = 0; y < cropLight.height; y++) for (let x = 0; x < cropLight.width; x++) {
        const sourceIndex = (Math.floor(y / scale) * crop.width + Math.floor(x / scale)) * 4;
        const index = (y * cropLight.width + x) * 4;
        const opaque = crop.rgba[sourceIndex + 3] === 255;
        assert.deepEqual([...cropLight.rgba.slice(index, index + 4)], opaque ? [...crop.rgba.slice(sourceIndex, sourceIndex + 4)] : [238, 232, 219, 255]);
        assert.deepEqual([...cropSilhouette.rgba.slice(index, index + 4)], opaque ? [21, 25, 34, 255] : [238, 232, 219, 255]);
      }
      assert.ok(crop.rgba.some((v, i) => i % 4 === 3 && v === 0), '原始裁切仍保留真实透明缺口');
    }
  }
  assert.deepEqual(compiled.asset.frames[0].rgba, before);
  const noRegion = buildViews(compiled);
  assert.equal(noRegion.cropLight, undefined); assert.equal(noRegion.cropSilhouette, undefined);
});
