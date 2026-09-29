/**
 * core/color.js — 颜色打包与调整
 *
 * 像素缓冲内部用 32 位无符号整数，布局固定为 ABGR（低字节起 R,G,B,A），
 * 与 CPU 字节序无关：打包/解包全部是显式位移运算。
 * 对外像素数据一律是 Uint8ClampedArray RGBA（见 raster.js 的 toRGBA/fromRGBA）。
 */

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

/**
 * '#rrggbb' → ABGR 32 位整数。已是number 时按原值返回（>>>0）。
 * @param {string|number} hex
 * @param {number} [alpha] 0–255
 */
export function packColor(hex, alpha = 255) {
  if (typeof hex === 'number') return hex >>> 0;
  if (typeof hex !== 'string' || !HEX_RE.test(hex)) {
    throw new TypeError(`非法颜色：${JSON.stringify(hex)}，期望 '#rrggbb'`);
  }
  if (!Number.isInteger(alpha) || alpha < 0 || alpha > 255) {
    throw new TypeError(`非法 alpha：${alpha}，期望 0–255 整数`);
  }
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return ((alpha << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/** ABGR 32 位整数 → [r, g, b, a]（各 0–255）。 */
export function unpackColor(c) {
  return [c & 255, (c >>> 8) & 255, (c >>> 16) & 255, c >>> 24];
}

/** 颜色明暗调整（factor>1 变亮，<1 变暗），返回 '#rrggbb'。 */
export function shade(hex, factor) {
  if (!Number.isFinite(factor) || factor < 0) throw new TypeError(`非法明暗系数：${factor}`);
  const h = String(hex).replace('#', '');
  const ch = (i) => Math.max(0, Math.min(255, Math.round(parseInt(h.slice(i, i + 2), 16) * factor)));
  return `#${[ch(0), ch(2), ch(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** 两色按 t ∈ [0,1] 混合，返回 '#rrggbb'。 */
export function mix(a, b, t) {
  if (!Number.isFinite(t)) throw new TypeError(`非法混合比例：${t}`);
  const pa = String(a).replace('#', '');
  const pb = String(b).replace('#', '');
  const ch = (i) => Math.round(parseInt(pa.slice(i, i + 2), 16) * (1 - t) + parseInt(pb.slice(i, i + 2), 16) * t);
  return `#${[ch(0), ch(2), ch(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
