/**
 * export/bmp.js — 32 位 BMP 编码（纯函数，无 IO 依赖）
 *
 * 用于审图与测试快照：BITMAPFILEHEADER + BITMAPINFOHEADER，BGRA 字节序，
 * 自底向上行序，支持 alpha（BI_BITFIELDS 未启用，多数查看器按 BGRX 读取，
 * 透明像素可能显示为白色或黑色——审图时用 background 参数显式打底）。
 */

/**
 * @param {number} width
 * @param {number} height
 * @param {Uint8ClampedArray|Uint8Array} rgba RGBA 字节（length = w*h*4）
 * @param {object} [opts]
 * @param {string} [opts.background] 透明像素打底色 '#rrggbb'（不透明度合成）
 * @returns {Uint8Array} BMP 文件字节
 */
export function encodeBMP(width, height, rgba, opts = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`非法 BMP 尺寸 ${width}×${height}`);
  }
  if (rgba.length !== width * height * 4) throw new RangeError(`RGBA 长度 ${rgba.length} ≠ ${width * height * 4}`);
  let bg = null;
  if (opts.background) {
    const h = opts.background.replace('#', '');
    bg = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rowSize = width * 4; // 32bpp 行已 4 字节对齐
  const pixelBytes = rowSize * height;
  const fileSize = 54 + pixelBytes;
  const out = new Uint8Array(fileSize);
  const view = new DataView(out.buffer);
  // BITMAPFILEHEADER
  out[0] = 0x42; // 'B'
  out[1] = 0x4d; // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint32(10, 54, true);
  // BITMAPINFOHEADER
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // 正数 = 自底向上
  view.setUint16(26, 1, true);
  view.setUint16(28, 32, true);
  view.setUint32(34, pixelBytes, true);
  for (let y = 0; y < height; y++) {
    const srcRow = height - 1 - y; // 自底向上
    for (let x = 0; x < width; x++) {
      const si = (srcRow * width + x) * 4;
      const di = 54 + (y * width + x) * 4;
      let r = rgba[si];
      let g = rgba[si + 1];
      let b = rgba[si + 2];
      const a = rgba[si + 3] / 255;
      if (bg && a < 1) {
        r = Math.round(r * a + bg[0] * (1 - a));
        g = Math.round(g * a + bg[1] * (1 - a));
        b = Math.round(b * a + bg[2] * (1 - a));
      }
      out[di] = b;
      out[di + 1] = g;
      out[di + 2] = r;
      out[di + 3] = rgba[si + 3];
    }
  }
  return out;
}
