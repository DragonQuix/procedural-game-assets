/**
 * bake/variants.js — 帧级变体后处理（方向、状态），供各配方复用
 *
 * 变体输出新帧数据，锚点与附件点随像素变换联动（ADR-0002）。
 */
import { flipHorizontal, mirrorXFramePoints, scaleNearest } from '../core/transform.js';
import { PixelPainter } from '../core/raster.js';
import { shade, packColor } from '../core/color.js';

/**
 * 水平镜像变体：像素翻转 + 锚点/附件点镜像。
 * @returns {{painter: PixelPainter, points: object}}
 */
export function flipVariant(painter, points) {
  return { painter: flipHorizontal(painter), points: mirrorXFramePoints(points, painter.w) };
}

/**
 * 损坏状态变体（机械/建筑用）：整体压暗 + 确定性烧灼斑点与剥落孔洞。
 * @param {PixelPainter} painter
 * @param {object} points {anchor, attachments}
 * @param {object} opts { rng: () => number, darken?: number, scorch?: string, holes?: number, scorchDensity?: number }
 */
export function damageVariant(painter, points, opts) {
  const rng = opts.rng;
  if (typeof rng !== 'function') throw new TypeError('damageVariant 需要确定性 rng');
  const p = painter.clone();
  const darken = opts.darken ?? 0.55;
  const scorch = packColor(opts.scorch ?? '#16100c');
  p.map((x, y, c) => {
    const r = c & 255;
    const g = (c >>> 8) & 255;
    const b = (c >>> 16) & 255;
    const a = c >>> 24;
    return (((a << 24) | (Math.round(b * darken) << 16) | (Math.round(g * darken) << 8) | Math.round(r * darken)) >>> 0);
  });
  const holeRate = opts.holes ?? 0.06;
  const scorchRate = opts.scorchDensity ?? 0.12;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const i = y * p.w + x;
      if (!(p.data[i] >>> 24)) continue;
      const roll = rng();
      if (roll < holeRate) p.data[i] = 0; // 剥落
      else if (roll < holeRate + scorchRate) p.data[i] = scorch; // 烧灼
    }
  }
  return { painter: p, points };
}

/**
 * 最近邻放大变体（展示用，不改变语义）。
 */
export function scaleVariant(painter, points, k) {
  const scaled = scaleNearest(painter, k);
  const scalePt = (pt) => ({ x: pt.x * k, y: pt.y * k });
  const mapPts = (m) => {
    const out = {};
    if (m.anchor) out.anchor = scalePt(m.anchor);
    if (m.attachments) {
      out.attachments = {};
      for (const [n, pt] of Object.entries(m.attachments)) out.attachments[n] = scalePt(pt);
    }
    return out;
  };
  return { painter: scaled, points: mapPts(points) };
}

export { shade };
