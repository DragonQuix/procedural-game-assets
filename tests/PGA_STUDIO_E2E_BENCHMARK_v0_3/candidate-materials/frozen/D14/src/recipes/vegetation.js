/**
 * recipes/vegetation.js — 植被配方与烘焙
 *
 * 原则（方案 §7 P4）：整体轮廓与树冠分组先行，种子只改变受控细节
 * （表面斑点与树冠团在容差内的抖动），不改变结构。同一 spec 同种子结果一致；
 * 想要不同结构的树，改 canopy 数据而不是加种子。
 *
 * VegetationSpec（kind: 'vegetation'）：
 *   id, seed,
 *   palette: { trunk, trunkDark, leafDark, leafMid, leafLight, speckle? },
 *   frame: { w, h },
 *   trunk: { x, yBottom, width, lean?, segments? },   // x/yBottom 为底部中心；lean 向右为正（px/全高）
 *   canopy: [{ cx, cy, rx, ry, tone: 0|1|2, jitter? }], // tone 0 暗(后) 1 中 2 亮(前)；jitter 为 px 容差
 *   speckle?: { density, color },                      // 叶面高光点缀（种子控制）
 *   anchor?: 默认底部中心 { x: trunk.x, y: trunk.yBottom }
 */
import { PixelPainter } from '../core/raster.js';
import { Rng } from '../core/rng.js';
import { assembleFrame, DEFAULT_OUTLINE } from '../bake/frame.js';
import { assembleAsset } from '../bake/asset.js';

const TONES = ['leafDark', 'leafMid', 'leafLight'];

export function drawVegetation(spec) {
  const { frame, palette, trunk, canopy } = spec;
  const p = new PixelPainter(frame.w, frame.h, { clip: spec.clip ?? 'error' });
  const rng = new Rng((typeof spec.seed === 'number' ? spec.seed : 0) || 1);
  // 树干：分段竖线，随 lean 偏移；右侧亮边
  const topX = Math.round(trunk.x + (trunk.lean ?? 0));
  const topY = trunk.yBottom - trunk.height;
  const half = Math.floor(trunk.width / 2);
  for (let y = trunk.yBottom - 1; y >= topY; y--) {
    const t = (trunk.yBottom - y) / trunk.height;
    const cx = Math.round(trunk.x + (topX - trunk.x) * t);
    for (let i = -half; i <= half - (trunk.width % 2 === 0 ? 1 : 0); i++) p.set(cx + i, y, palette.trunk);
    p.set(cx + half - (trunk.width % 2 === 0 ? 1 : 0), y, palette.trunkDark);
  }
  // 树冠团：暗→中→亮顺序画，抖动只移位置不改尺寸
  const blobs = canopy.map((c) => {
    const j = c.jitter ?? 0;
    return { ...c, cx: c.cx + Math.round((rng.next() * 2 - 1) * j), cy: c.cy + Math.round((rng.next() * 2 - 1) * j) };
  });
  for (const tone of [0, 1, 2]) {
    for (const b of blobs) {
      if (b.tone !== tone) continue;
      p.ellipse(b.cx, b.cy, b.rx, b.ry, palette[TONES[tone]]);
    }
  }
  // 受控细节：叶表斑点（只画在已有不透明叶面上）
  if (spec.speckle) {
    p.speckle(0, 0, frame.w, frame.h, spec.speckle.color ?? palette.leafLight, spec.speckle.density, () => rng.next());
  }
  return p;
}

export function bakeVegetation(spec) {
  if (spec.kind !== 'vegetation') throw new TypeError(`bakeVegetation 收到 kind='${spec.kind}'`);
  const painter = drawVegetation(spec);
  const outline = spec.outline === undefined ? DEFAULT_OUTLINE : spec.outline;
  const frame = assembleFrame(spec.frameId ?? spec.id, painter, {
    anchor: spec.anchor ?? { x: spec.trunk.x, y: spec.trunk.yBottom },
    attachments: spec.attachments ?? {},
    outline,
    diagnostics: painter.diagnostics.empty ? null : painter.diagnostics.toJSON(),
  });
  return assembleAsset({ id: spec.id, kind: spec.kind, seed: spec.seed ?? 0, frames: [frame], clips: {} });
}
