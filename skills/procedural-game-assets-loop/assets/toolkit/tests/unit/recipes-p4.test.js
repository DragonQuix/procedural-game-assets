import test from 'node:test';
import assert from 'node:assert/strict';
import { bakeVegetation, drawVegetation } from '../../src/recipes/vegetation.js';
import { bakeProp } from '../../src/recipes/prop.js';
import { bakeTerrain, drawTerrainTile } from '../../src/recipes/terrain.js';
import { PixelPainter } from '../../src/core/raster.js';
import trees from '../../examples/recipes/trees.mjs';
import supply from '../../examples/recipes/supply.mjs';
import ground from '../../examples/recipes/ground.mjs';

const mask = (rgba) => {
  const m = [];
  for (let i = 0; i < rgba.length; i += 4) m.push(rgba[i + 3] > 0 ? 1 : 0);
  return m;
};

test('植被：同种子同字节，不同种子只改细节不改轮廓（jitter=0 时）', () => {
  const [broadleaf] = trees;
  const a = drawVegetation(broadleaf);
  const b = drawVegetation(broadleaf);
  assert.deepEqual([...a.toRGBA()], [...b.toRGBA()]);
  const other = drawVegetation({ ...broadleaf, seed: 999, canopy: broadleaf.canopy.map((c) => ({ ...c, jitter: 0 })) });
  const base = drawVegetation({ ...broadleaf, seed: 11, canopy: broadleaf.canopy.map((c) => ({ ...c, jitter: 0 })) });
  assert.deepEqual(mask(other.toRGBA()), mask(base.toRGBA())); // 轮廓一致
  assert.notDeepEqual([...other.toRGBA()], [...base.toRGBA()]); // 细节不同
});

test('植被：锚点在树干底部（含描边扩边 +1），两种树结构不同', () => {
  const assets = trees.map(bakeVegetation);
  const [bl, dp] = assets;
  assert.deepEqual(bl.frames[0].anchor, { x: 25, y: 56 }); // (24,55) + 1px 扩边
  assert.notDeepEqual(mask(bl.frames[0].rgba), mask(dp.frames[0].rgba));
});

test('道具：图标居中、种类靠形状区分而非仅颜色', () => {
  const assets = supply.map(bakeProp);
  const [scatter, laser, missile, med] = assets.map((a) => a.frames[0]);
  // 三个补给舱共享外壳：外壳像素一致，仅图标区不同
  const sameOutsideIconBox = (a, b) => {
    for (let y = 0; y < a.height; y++) {
      for (let x = 0; x < a.width; x++) {
        if (x >= 3 && x < 11 && y >= 3 && y < 6) continue; // 图标区（含描边外扩 1px）
        const i = (y * a.width + x) * 4;
        if (a.rgba[i + 3] !== b.rgba[i + 3]) return false;
      }
    }
    return true;
  };
  assert.ok(sameOutsideIconBox(scatter, laser));
  // 图标形状两两不同：无外壳单独烘焙图标，比较轮廓
  const iconOnly = supply.slice(0, 3).map((s) => bakeProp({ ...s, shell: null, outline: null }).frames[0]);
  assert.notDeepEqual(mask(iconOnly[0].rgba), mask(iconOnly[1].rgba));
  assert.notDeepEqual(mask(iconOnly[0].rgba), mask(iconOnly[2].rgba));
  // 医疗包连外壳也不同
  assert.notDeepEqual(mask(scatter.rgba), mask(med.rgba));
});

test('地形：同世界坐标同字节；不同世界坐标纹理不同', () => {
  const a = drawTerrainTile(ground, { worldX: 0, worldY: 48 });
  const a2 = drawTerrainTile(ground, { worldX: 0, worldY: 48 });
  const b = drawTerrainTile(ground, { worldX: 16, worldY: 48 });
  assert.deepEqual([...a.toRGBA()], [...a2.toRGBA()]);
  assert.notDeepEqual([...a.toRGBA()], [...b.toRGBA()]);
});

test('地形：跨块接缝不劣于块内变化（纹理由世界坐标决定）', () => {
  // 渲染 3 个水平相邻填充块，比较缝两侧与块内的水平色差
  const size = ground.tile.size;
  const strip = new PixelPainter(size * 3, size, { clip: 'error' });
  for (let i = 0; i < 3; i++) strip.blit(drawTerrainTile(ground, { worldX: i * size, worldY: 48 }), i * size, 0);
  const delta = (x, y) => {
    const l = strip.data[y * strip.w + x - 1];
    const r = strip.data[y * strip.w + x];
    return Math.abs((l & 255) - (r & 255)) + Math.abs(((l >>> 8) & 255) - ((r >>> 8) & 255)) + Math.abs(((l >>> 16) & 255) - ((r >>> 16) & 255));
  };
  let maxInner = 0;
  let maxSeam = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 1; x < size * 3; x++) {
      const d = delta(x, y);
      if (x === size || x === size * 2) maxSeam = Math.max(maxSeam, d);
      else maxInner = Math.max(maxInner, d);
    }
  }
  assert.ok(maxSeam <= maxInner, `接缝色差 ${maxSeam} > 块内 ${maxInner}`);
});

test('地形：顶边与裸露侧边语义正确', () => {
  const topTile = drawTerrainTile(ground, { worldX: 0, worldY: 0, edge: 'top' });
  const lip = ground.palette.top.lip.replace('#', '');
  const [lr, lg, lb] = [parseInt(lip.slice(0, 2), 16), parseInt(lip.slice(2, 4), 16), parseInt(lip.slice(4, 6), 16)];
  assert.deepEqual([...topTile.toRGBA().slice(0, 3)], [lr, lg, lb]); // (0,0) 为地表亮边
  const leftTile = drawTerrainTile(ground, { worldX: 0, worldY: 16, edge: 'left' });
  const edge = ground.palette.side.edge.replace('#', '');
  const [er, eg, eb] = [parseInt(edge.slice(0, 2), 16), parseInt(edge.slice(2, 4), 16), parseInt(edge.slice(4, 6), 16)];
  assert.deepEqual([...leftTile.toRGBA().slice(0, 3)], [er, eg, eb]); // 左缘为暗边线
});

test('地形：烘焙帧以左上角为锚点（对齐世界网格）', () => {
  const asset = bakeTerrain(ground);
  assert.equal(asset.frames.length, 9);
  assert.deepEqual(asset.frames[0].anchor, { x: 0, y: 0 });
});
