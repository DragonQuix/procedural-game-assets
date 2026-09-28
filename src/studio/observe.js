/**
 * studio/observe.js — Studio 观察视图（纯函数，ADR-0001/0008）
 *
 * 视图数据只含 RGBA 字节与元数据；PNG 编码与写盘在 IO 层（adapters/studio-files.js）。
 * native 不放大（不靠放大掩盖缺陷）；display 用最近邻整数倍 + 明确背景色；
 * target_crop 截取指定节点及邻域。UI 标号/遮罩只属于观察产物，不进最终资产。
 */
import { PixelPainter } from '../core/raster.js';
import { scaleNearest } from '../core/transform.js';

/** 帧 → { width, height, rgba } 普通数据。 */
function frameView(frame) {
  return { width: frame.width, height: frame.height, rgba: frame.rgba };
}

/** painter → 背景填充后的 RGBA 视图（背景色 '#rrggbb'）。 */
function withBackground(painter, background) {
  const out = new PixelPainter(painter.w, painter.h, { clip: 'error' });
  out.rect(0, 0, painter.w, painter.h, background);
  out.blit(painter, 0, 0);
  return { width: out.w, height: out.h, rgba: out.toRGBA() };
}

/** 从最终帧裁出矩形区域（边界坐标，自动夹取到帧内）。 */
function cropFrame(frame, rect, contextPx = 2) {
  const src = PixelPainter.fromRGBA(frame.width, frame.height, frame.rgba);
  const x0 = Math.max(0, rect.x - contextPx);
  const y0 = Math.max(0, rect.y - contextPx);
  const x1 = Math.min(frame.width, rect.x + rect.w + contextPx);
  const y1 = Math.min(frame.height, rect.y + rect.h + contextPx);
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const out = new PixelPainter(w, h, { clip: 'error' });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out.data[y * w + x] = src.data[(y0 + y) * src.w + (x0 + x)];
  }
  return { width: w, height: h, rgba: out.toRGBA(), origin: { x: x0, y: y0 } };
}

/**
 * 构建一次编译的观察视图集。
 * @param {object} compiled compileStudioDocument 的结果
 * @param {object} [opts]
 * @param {number} [opts.displayScale] display 放大倍数（正整数），默认 4
 * @param {string} [opts.background] display 背景色，默认 '#202028'
 * @param {string} [opts.node] 需要 target_crop 的节点 ID
 * @returns {{ native, display, crop?: object, meta: object }}
 */
export function buildViews(compiled, opts = {}) {
  const frame = compiled.asset.frames[0];
  const scale = opts.displayScale ?? 4;
  if (!Number.isInteger(scale) || scale < 1 || scale > 32) throw new RangeError(`非法 display 放大倍数：${opts.displayScale}`);
  const background = opts.background ?? '#202028';
  const native = frameView(frame);
  const scaled = scaleNearest(PixelPainter.fromRGBA(frame.width, frame.height, frame.rgba), scale);
  const display = withBackground(scaled, background);
  const views = {
    native,
    display,
    meta: {
      frameId: frame.id,
      scale,
      background,
      sampling: 'nearest',
      documentHash: compiled.hashes.documentHash,
      renderHash: compiled.hashes.renderHash,
    },
  };
  if (opts.node !== undefined) {
    const entry = compiled.sceneMap.nodes.find((n) => n.id === opts.node);
    if (!entry) throw new RangeError(`sceneMap 中不存在节点 '${opts.node}'`);
    views.crop = { ...cropFrame(frame, entry.frameRect), nodeId: entry.id };
  }
  return views;
}
