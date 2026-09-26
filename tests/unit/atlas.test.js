import test from 'node:test';
import assert from 'node:assert/strict';
import { packAtlas, renderAtlasPages, extractFrame } from '../../src/export/atlas.js';
import { buildManifest, validateManifest, SCHEMA_VERSION } from '../../src/export/manifest.js';
import { encodePNG, decodePNG } from '../../src/export/png.js';
import { PixelPainter } from '../../src/core/raster.js';

const mk = (id, w, h, color = '#ff0000') => {
  const p = new PixelPainter(w, h);
  p.rect(0, 0, w, h, color);
  return { id, width: w, height: h, rgba: p.toRGBA() };
};

test('打包确定性：同集合任意输入顺序得同一布局', () => {
  const frames = [mk('a', 10, 20), mk('b', 30, 10), mk('c', 10, 10), mk('d', 40, 40)];
  const p1 = packAtlas(frames, { maxPage: 64 });
  const p2 = packAtlas([...frames].reverse(), { maxPage: 64 });
  assert.deepEqual(p1, p2);
});

test('放置不重叠、不出页、含边距', () => {
  const frames = [mk('a', 10, 20), mk('b', 30, 10), mk('c', 10, 10), mk('d', 40, 40), mk('e', 5, 5)];
  const { pages } = packAtlas(frames, { maxPage: 64, margin: 2 });
  for (const page of pages) {
    const rects = page.placements;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      assert.ok(r.x >= 2 && r.y >= 2 && r.x + r.w + 2 <= page.width && r.y + r.h + 2 <= page.height, `边距/出界 ${r.id}`);
      for (let j = i + 1; j < rects.length; j++) {
        const q = rects[j];
        const overlap = r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y;
        assert.ok(!overlap, `重叠 ${r.id} × ${q.id}`);
      }
    }
  }
});

test('超过页面容量时产生多页', () => {
  const frames = [mk('a', 30, 30), mk('b', 30, 30), mk('c', 30, 30), mk('d', 30, 30)];
  const { pages } = packAtlas(frames, { maxPage: 40, margin: 2 });
  assert.ok(pages.length > 1);
  const total = pages.reduce((n, p) => n + p.placements.length, 0);
  assert.equal(total, 4);
});

test('单帧加边距超过页面被拒绝', () => {
  assert.throws(() => packAtlas([mk('big', 100, 100)], { maxPage: 64 }), RangeError);
  assert.throws(() => packAtlas([mk('a', 10, 10)], { maxPage: 4 }), RangeError);
});

test('往返：渲染页面 → PNG 编解码 → 逐帧切回，RGBA 与烘焙一致', () => {
  const a = mk('a', 6, 4, '#112233');
  const b = mk('b', 3, 7, '#445566');
  const packed = packAtlas([a, b], { maxPage: 32 });
  const frameMap = new Map([[a.id, a], [b.id, b]]);
  const pagePainters = renderAtlasPages(packed, frameMap);
  for (const [pi, page] of packed.pages.entries()) {
    const pngBytes = encodePNG(pagePainters[pi].w, pagePainters[pi].h, pagePainters[pi].toRGBA());
    const decoded = decodePNG(pngBytes);
    const pagePainter = PixelPainter.fromRGBA(decoded.width, decoded.height, decoded.rgba);
    for (const pl of page.placements) {
      const back = extractFrame(pagePainter, pl);
      const src = frameMap.get(pl.id);
      assert.deepEqual([...back.toRGBA()], [...src.rgba], `帧 ${pl.id} 往返不一致`);
    }
  }
});

test('清单：字段齐全、帧排序确定、校验通过', () => {
  const asset = {
    id: 'demo',
    kind: 'humanoid',
    seed: 7,
    frames: [
      { id: 'b', width: 3, height: 3, rgba: mk('b', 3, 3).rgba, anchor: { x: 1, y: 3 }, attachments: {}, bounds: null },
      { id: 'a', width: 2, height: 2, rgba: mk('a', 2, 2).rgba, anchor: { x: 1, y: 2 }, attachments: { muzzle: { x: 2, y: 1 } }, bounds: null },
    ],
    clips: { run: { frames: ['a', 'b'], ms: 90 } },
  };
  const packed = packAtlas(asset.frames, { maxPage: 32 });
  const doc = buildManifest(asset, packed, { generator: 'test@1' });
  assert.equal(doc.schemaVersion, SCHEMA_VERSION);
  assert.equal(doc.hints.filter, 'nearest');
  assert.equal(doc.hints.mipmap, false);
  assert.deepEqual(doc.frames.map((f) => f.id), ['a', 'b']); // 按 ID 排序
  assert.deepEqual(validateManifest(doc), []);
  // 无绝对路径、无时间戳
  const text = JSON.stringify(doc);
  assert.ok(!/[A-Za-z]:[\\/]/.test(text) && !/\d{4}-\d{2}-\d{2}T/.test(text));
});

test('清单校验：schema 不兼容即失败并说明原因', () => {
  const errors = validateManifest({ schemaVersion: 999 });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /不兼容/);
});

test('清单校验：帧 ID 冲突、缺引用、rect 越界被报出', () => {
  const base = {
    schemaVersion: SCHEMA_VERSION,
    pages: [{ file: 'x.page0.png', width: 8, height: 8 }],
    frames: [],
    clips: {},
  };
  assert.ok(validateManifest({ ...base, frames: [{ id: 'a', page: 0, rect: { x: 0, y: 0, w: 2, h: 2 }, anchor: { x: 0, y: 0 } }, { id: 'a', page: 0, rect: { x: 0, y: 0, w: 2, h: 2 }, anchor: { x: 0, y: 0 } }] }).some((e) => e.includes('冲突')));
  assert.ok(validateManifest({ ...base, frames: [{ id: 'a', page: 0, rect: { x: 6, y: 0, w: 4, h: 2 }, anchor: { x: 0, y: 0 } }] }).some((e) => e.includes('超出页面')));
  assert.ok(validateManifest({ ...base, frames: [{ id: 'a', page: 0, rect: { x: 0, y: 0, w: 2, h: 2 }, anchor: { x: 0, y: 0 } }], clips: { c: { frames: ['ghost'], ms: 100 } } }).some((e) => e.includes('ghost')));
});

test('PNG 字节在锁定编码器下确定', () => {
  const f = mk('x', 8, 8, '#123456');
  const b1 = encodePNG(f.width, f.height, f.rgba);
  const b2 = encodePNG(f.width, f.height, f.rgba);
  assert.deepEqual([...b1], [...b2]);
});
