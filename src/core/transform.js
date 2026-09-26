/**
 * core/transform.js — 像素变换与几何点变换（ADR-0002）
 *
 * 两类变换严格区分：
 * - 像素索引：水平镜像 i → W-1-i；顺时针 90° (i,j) → (H-1-j, i)。
 * - 几何点（像素边界坐标，锚点/附件点）：水平镜像 x → W-x；顺时针 90° (x,y) → (H-y, x)。
 *
 * 两者相差 1 像素语义，不得混用。像素中心 (i+0.5, j+0.5) 在两种映射下对齐。
 */
import { PixelPainter } from './raster.js';
import { packColor } from './color.js';

/** 水平镜像副本（像素索引 W-1-i）。 */
export function flipHorizontal(src) {
  const p = new PixelPainter(src.w, src.h, { clip: src.clip });
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) p.data[y * src.w + x] = src.data[y * src.w + (src.w - 1 - x)];
  }
  return p;
}

/** 顺时针旋转 90°×turns（像素精确；turns 取模 4，支持负数）。尺寸变为 (H,W)（奇数次）。 */
export function rotate90(src, turns) {
  let p = src;
  for (let t = 0; t < ((turns % 4) + 4) % 4; t++) {
    const r = new PixelPainter(p.h, p.w, { clip: src.clip });
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) r.data[x * r.w + (p.h - 1 - y)] = p.data[y * p.w + x];
    p = r;
  }
  return p;
}

/** 不透明像素全部变成同一颜色的副本（受击白闪）。 */
export function silhouette(src, color = '#ffffff') {
  const p = new PixelPainter(src.w, src.h, { clip: src.clip });
  const c = packColor(color);
  for (let i = 0; i < src.data.length; i++) if (src.data[i] >>> 24) p.data[i] = c;
  return p;
}

/** 四周补 pad 像素的透明边。几何点须配合 translatePoint 平移 +pad。 */
export function pad(src, padPx) {
  if (!Number.isInteger(padPx) || padPx < 0) throw new RangeError(`非法 padding：${padPx}`);
  if (padPx === 0) return src.clone();
  const p = new PixelPainter(src.w + padPx * 2, src.h + padPx * 2, { clip: 'error' });
  p.blit(src, padPx, padPx);
  return p;
}

/* ---------- 几何点变换（锚点/附件点，像素边界坐标） ---------- */

/** 水平镜像点：(x,y) → (W-x, y)。W 为帧宽（边界坐标）。 */
export function mirrorXPoint(pt, W) {
  return { x: W - pt.x, y: pt.y };
}

/** 顺时针 90° 点：(x,y) → (H-y, x)。H 为原帧高；新尺寸 (H,W)。 */
export function rot90Point(pt, H) {
  return { x: H - pt.y, y: pt.x };
}

/** 平移点（padding 等）：+dx, +dy。 */
export function translatePoint(pt, dx, dy) {
  return { x: pt.x + dx, y: pt.y + dy };
}

/**
 * 对 {anchor, attachments} 形式的元数据套用点变换。
 * @param {object} meta 含可选 anchor 与 attachments（{name: {x,y}}）
 * @param {(pt:{x:number,y:number}) => {x:number,y:number}} fn
 * @returns {object} 新对象，不改动入参
 */
export function mapFramePoints(meta, fn) {
  const out = {};
  if (meta.anchor) out.anchor = fn(meta.anchor);
  if (meta.attachments) {
    out.attachments = {};
    for (const [name, pt] of Object.entries(meta.attachments)) out.attachments[name] = fn(pt);
  }
  return out;
}

/** 元数据水平镜像（配合 flipHorizontal，W 为帧宽）。 */
export function mirrorXFramePoints(meta, W) {
  return mapFramePoints(meta, (pt) => mirrorXPoint(pt, W));
}

/** 元数据顺时针 90°×turns（配合 rotate90，逐次应用）。W/H 为原帧尺寸。 */
export function rot90FramePoints(meta, W, H, turns) {
  const n = ((turns % 4) + 4) % 4;
  let out = meta;
  let h = H;
  for (let t = 0; t < n; t++) {
    out = mapFramePoints(out, (pt) => rot90Point(pt, h));
    h = t % 2 === 0 ? W : H; // 旋转后高变为原宽，再次旋转时用新高
  }
  return out;
}
