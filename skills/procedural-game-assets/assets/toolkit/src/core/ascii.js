/**
 * core/ascii.js — ASCII 像素图解析
 *
 * 规则（源自 others_003 的 spriteBuilder.js）：
 * '.' 或空格为透明；其余字符查调色板；行宽可以不等（右侧视为透明）。
 * 标记字符（markers）既画成指定颜色，也记录坐标。
 *
 * 坐标约定（ADR-0002）：marks 记录像素索引，语义为像素中心
 * （边界坐标 = 索引 + 0.5，用 markToCenter 换算）。
 * 脚底等边界位置用显式 anchor 字段，不从 marks 隐式猜测。
 */
import { PixelPainter } from './raster.js';

/**
 * @param {string[]} rows 字符行，至少一行且至少一个非空行
 * @param {Record<string,string>} palette 字符 → '#rrggbb'
 * @param {Record<string,{name:string,color:string}>} [markers]
 * @param {object} [opts]
 * @param {'error'|'replace'} [opts.onDuplicateMarker] 同名 marker 策略，默认 'error'
 * @param {object} [opts.painterOpts] 传给 PixelPainter（clip 等）
 * @returns {{painter: PixelPainter, marks: Record<string, [number, number]>}}
 */
export function parseArt(rows, palette, markers = {}, opts = {}) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.every((r) => r.length === 0)) {
    throw new RangeError('像素图为空：至少需要一行非空字符');
  }
  for (const r of rows) {
    if (typeof r !== 'string') throw new TypeError(`像素图行必须是字符串：${JSON.stringify(r)}`);
  }
  const onDup = opts.onDuplicateMarker ?? 'error';
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const painter = new PixelPainter(w, h, opts.painterOpts);
  const marks = {};
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const mk = markers[ch];
      if (mk) {
        if (marks[mk.name] && onDup === 'error') {
          throw new Error(`重复标记 '${mk.name}'：(${marks[mk.name]}) 与 (${x}, ${y})。有意覆盖请设 onDuplicateMarker: 'replace'`);
        }
        marks[mk.name] = [x, y];
        if (mk.color && palette[mk.color]) painter.set(x, y, palette[mk.color]);
        continue;
      }
      const col = palette[ch];
      if (!col) throw new Error(`像素图含未知字符 '${ch}'（第 ${y} 行第 ${x} 列）`);
      painter.set(x, y, col);
    }
  });
  return { painter, marks };
}

/** mark 像素索引 → 像素中心的边界坐标。 */
export function markToCenter(mark) {
  return { x: mark[0] + 0.5, y: mark[1] + 0.5 };
}
