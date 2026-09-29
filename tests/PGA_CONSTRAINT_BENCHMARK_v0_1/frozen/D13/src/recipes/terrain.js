/**
 * recipes/terrain.js — 地形图块配方与烘焙
 *
 * 原则（方案 §7 P4）：纹理用世界坐标哈希（core/hash.js 的 hash2）选取——
 * 跨图块天然连续、无需存随机数、每次运行一致。图块之间不能有接缝突变：
 * 相邻块的填充像素由同一世界坐标函数决定（有接缝测试覆盖）。
 *
 * TerrainSpec（kind: 'terrain'）：
 *   id, seed,
 *   palette: { fill: string[], top?: { surface, surfaceDark, lip? }, side?: { dark, edge } },
 *   tile: { size },                                  // 正方形图块边长
 *   bake: [{ id, worldX, worldY, edge? }],           // 要烘焙的块；edge: 'top'|'left'|'right'|'bottom'|['top','left']...
 *   noise?: { light, dark },                         // 填充纹理的亮/暗噪点密度
 *
 * edge 语义：'top' = 顶边地表（草皮/亮边）；'left'/'right'/'bottom' = 裸露侧边（暗化 + 边缘线）。
 * worldX/worldY 为该块左上角的世界像素坐标——接缝连续性的关键。
 */
import { PixelPainter } from '../core/raster.js';
import { hash2 } from '../core/hash.js';
import { assembleFrame, DEFAULT_OUTLINE } from '../bake/frame.js';
import { assembleAsset } from '../bake/asset.js';
import { shade } from '../core/color.js';

export function drawTerrainTile(spec, { worldX = 0, worldY = 0, edge = [] } = {}) {
  const size = spec.tile.size;
  const edges = new Set(Array.isArray(edge) ? edge : [edge]);
  const p = new PixelPainter(size, size, { clip: spec.clip ?? 'error' });
  const { palette } = spec;
  const seed = typeof spec.seed === 'number' ? spec.seed : 0;
  const noise = spec.noise ?? { light: 0.08, dark: 0.08 };
  const fills = palette.fill;
  const top = palette.top ?? null;
  const side = palette.side ?? null;
  const topDepth = edges.has('top') && top ? (top.depth ?? 3) : 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wx = worldX + x;
      const wy = worldY + y;
      // 填充：世界坐标哈希选色 + 稀疏噪点
      let color = fills[Math.floor(hash2(wx, wy, seed) * fills.length) % fills.length];
      const n = hash2(wx * 3 + 11, wy * 5 + 7, seed ^ 0x9e37);
      if (n < noise.dark) color = shade(color, 0.72);
      else if (n > 1 - noise.light) color = shade(color, 1.25);
      // 顶边地表层
      if (y < topDepth) {
        color = y === 0 && top.lip ? top.lip : y < topDepth - 1 ? top.surface : top.surfaceDark;
        const g = hash2(wx, wy, seed ^ 0x51f);
        if (y > 0 && g < 0.18) color = shade(color, 0.8);
      }
      // 裸露侧边：向边方向逐级暗化
      if (side) {
        const dists = [];
        if (edges.has('left')) dists.push(x);
        if (edges.has('right')) dists.push(size - 1 - x);
        if (edges.has('bottom')) dists.push(size - 1 - y);
        if (dists.length) {
          const d = Math.min(...dists);
          if (d === 0) color = side.edge;
          else if (d < (side.depth ?? 4)) color = shade(color, 1 - 0.18 * ((side.depth ?? 4) - d));
        }
      }
      p.set(x, y, color);
    }
  }
  return p;
}

export function bakeTerrain(spec) {
  if (spec.kind !== 'terrain') throw new TypeError(`bakeTerrain 收到 kind='${spec.kind}'`);
  if (!Array.isArray(spec.bake) || spec.bake.length === 0) throw new TypeError(`地形 '${spec.id}' 需要 bake 列表`);
  const outline = spec.outline === undefined ? null : spec.outline; // 地形默认不描边
  const frames = [];
  for (const t of spec.bake) {
    const painter = drawTerrainTile(spec, t);
    frames.push(
      assembleFrame(t.id, painter, {
        anchor: { x: 0, y: 0 }, // 地形以左上角对齐世界网格
        attachments: {},
        outline,
        diagnostics: painter.diagnostics.empty ? null : painter.diagnostics.toJSON(),
      }),
    );
  }
  return assembleAsset({ id: spec.id, kind: spec.kind, seed: spec.seed ?? 0, frames, clips: {} });
}
