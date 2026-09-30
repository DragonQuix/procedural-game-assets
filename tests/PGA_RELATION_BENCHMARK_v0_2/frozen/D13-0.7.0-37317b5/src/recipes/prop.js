/**
 * recipes/prop.js — 道具配方与烘焙
 *
 * 原则（方案 §7 P4）：共享外壳 + 颜色与图标变体；不同种类不能只靠颜色区分——
 * 图标用不同形状的 ASCII 图，外壳也可以换形状。图标绘制在外壳内容区中央。
 *
 * PropSpec（kind: 'prop'）：
 *   id, seed, palette,
 *   frame: { w, h },
 *   shell: string[] | ((painter, ctx) => void),   // 外壳（ASCII 或绘制函数）
 *   icon?: string[] | ((painter, ctx) => void),   // 图标，置于图标区中央
 *   iconBox?: { x, y, w, h },                      // 图标区，默认整帧内缩 2px
 *   anchor?: 默认底边中点
 */
import { PixelPainter } from '../core/raster.js';
import { parseArt } from '../core/ascii.js';
import { assembleFrame, DEFAULT_OUTLINE } from '../bake/frame.js';
import { assembleAsset } from '../bake/asset.js';

function drawPiece(painter, piece, palette, box, clip) {
  if (!piece) return;
  if (typeof piece === 'function') {
    piece(painter, { palette });
    return;
  }
  const { painter: art } = parseArt(piece, palette, {}, { painterOpts: { clip } });
  const dx = box.x + Math.floor((box.w - art.w) / 2);
  const dy = box.y + Math.floor((box.h - art.h) / 2);
  painter.blit(art, dx, dy);
}

export function drawProp(spec) {
  const { frame, palette } = spec;
  const p = new PixelPainter(frame.w, frame.h, { clip: spec.clip ?? 'error' });
  drawPiece(p, spec.shell, palette, { x: 0, y: 0, w: frame.w, h: frame.h }, spec.clip ?? 'error');
  const box = spec.iconBox ?? { x: 2, y: 2, w: frame.w - 4, h: frame.h - 4 };
  drawPiece(p, spec.icon, palette, box, spec.clip ?? 'error');
  return p;
}

export function bakeProp(spec) {
  if (spec.kind !== 'prop') throw new TypeError(`bakeProp 收到 kind='${spec.kind}'`);
  const painter = drawProp(spec);
  const outline = spec.outline === undefined ? DEFAULT_OUTLINE : spec.outline;
  const frame = assembleFrame(spec.frameId ?? spec.id, painter, {
    anchor: spec.anchor ?? { x: spec.frame.w / 2, y: spec.frame.h },
    attachments: spec.attachments ?? {},
    outline,
    diagnostics: painter.diagnostics.empty ? null : painter.diagnostics.toJSON(),
  });
  return assembleAsset({ id: spec.id, kind: spec.kind, seed: spec.seed ?? 0, frames: [frame], clips: {} });
}
