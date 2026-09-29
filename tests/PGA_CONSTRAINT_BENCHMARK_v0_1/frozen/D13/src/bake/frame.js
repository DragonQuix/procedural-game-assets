/**
 * bake/frame.js — 帧组装：描边扩边、锚点/附件点平移、包围盒、BakedFrame
 *
 * 对齐原 SpriteBank.add 的行为（见 docs/provenance.md）：
 * 默认加 1px 透明边 + 描边（#120d16），锚点与附件点随 padding +1 平移。
 * 输出普通数据（RGBA 字节），不创建 Canvas（ADR-0001）。
 */
import { pad } from '../core/transform.js';
import { translatePoint } from '../core/transform.js';

/** 默认描边色（与原项目一致）。 */
export const DEFAULT_OUTLINE = '#120d16';

/** 不透明像素包围盒 {x0,y0,x1,y1}（开区间右界）；全透明返回 null。 */
export function computeBounds(painter) {
  let x0 = painter.w;
  let y0 = painter.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < painter.h; y++) {
    for (let x = 0; x < painter.w; x++) {
      if (painter.data[y * painter.w + x] >>> 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/**
 * 组装一帧。
 * @param {string} id 帧 ID（资产内唯一）
 * @param {PixelPainter} painter 绘制结果（未描边）
 * @param {object} opts
 * @param {{x:number,y:number}} opts.anchor 锚点（未描边坐标系）
 * @param {Record<string,{x:number,y:number}>} [opts.attachments]
 * @param {string|null} [opts.outline] 描边色；null 表示不描边不扩边
 * @param {object} [opts.diagnostics] 烘焙诊断（随帧返回）
 * @returns {BakedFrame}
 */
export function assembleFrame(id, painter, opts = {}) {
  if (!id) throw new TypeError('帧需要 id');
  const outline = opts.outline === undefined ? DEFAULT_OUTLINE : opts.outline;
  let p = painter;
  let anchor = { ...opts.anchor };
  let attachments = {};
  for (const [k, v] of Object.entries(opts.attachments ?? {})) attachments[k] = { ...v };
  if (outline) {
    p = pad(painter, 1);
    p.outline(outline);
    anchor = translatePoint(anchor, 1, 1);
    for (const k of Object.keys(attachments)) attachments[k] = translatePoint(attachments[k], 1, 1);
  }
  return {
    id,
    width: p.w,
    height: p.h,
    rgba: p.toRGBA(),
    anchor,
    attachments,
    bounds: computeBounds(p),
    diagnostics: opts.diagnostics ?? null,
  };
}
