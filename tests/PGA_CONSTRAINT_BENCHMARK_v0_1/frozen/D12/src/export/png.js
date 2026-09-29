/**
 * export/png.js — PNG 编解码（pngjs 薄封装，版本锁定见 package.json）
 *
 * 数据约定：RGBA 字节（Uint8ClampedArray/Buffer），与 core/raster.js 一致。
 * 编码器版本固定后 PNG 字节输出确定；跨平台一致性判据为解码后 RGBA（ADR-0003）。
 */
import { PNG } from 'pngjs';

/** RGBA → PNG 文件字节。 */
export function encodePNG(width, height, rgba) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`非法 PNG 尺寸 ${width}×${height}`);
  }
  if (rgba.length !== width * height * 4) throw new RangeError(`RGBA 长度 ${rgba.length} ≠ ${width * height * 4}`);
  const png = new PNG({ width, height });
  png.data = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  return PNG.sync.write(png);
}

/** PNG 文件字节 → { width, height, rgba }。 */
export function decodePNG(bytes) {
  const png = PNG.sync.read(Buffer.from(bytes));
  return { width: png.width, height: png.height, rgba: new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.byteLength) };
}
