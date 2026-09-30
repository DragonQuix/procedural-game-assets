/** Stable visible labels in a non-asset band; tile order never assigns identity. */
import { PixelPainter } from '../core/raster.js';
import { scaleNearest } from '../core/transform.js';

const GLYPHS = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011',
  X: '101101010101101', Y: '101101010010010',
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111',
  '3': '111001111001111', '4': '101101111001001', '5': '111100111001111',
  '6': '111100111101111', '7': '111001001001001', '8': '111101111101111', '9': '111101111001111',
};

export function symbolicContactSheet(entries, { scale = 4, gap = 2, background = '#202028' } = {}) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 17 || !Number.isInteger(scale) || scale < 1 || scale > 32 || !Number.isInteger(gap) || gap < 1 || gap > 32) throw new RangeError('Invalid symbolic sheet dimensions');
  const labels = entries.map((e) => e.label);
  if (labels.some((s) => typeof s !== 'string' || !/^[ABCXY0-9]{1,16}$/.test(s)) || new Set(labels).size !== labels.length) throw new RangeError('Unique explicit labels A/B/C/X/Y or numeric IDs required');
  const w = Math.max(...entries.map((e) => Math.max(e.frame.width, e.label.length * 4))), h = Math.max(...entries.map((e) => e.frame.height));
  const p = new PixelPainter(entries.length * (w + gap) + gap, h + 7 + gap * 2);
  p.rect(0, 0, p.w, p.h, background);
  const cells = entries.map(({ label, frame, identity = {} }, i) => {
    const x = gap + i * (w + gap), y = gap + 7;
    for (const [j, char] of [...label].entries()) for (let k = 0; k < 15; k++) if (GLYPHS[char][k] === '1') p.set(x + j * 4 + k % 3, gap + Math.floor(k / 3), '#ffffff');
    p.blit(PixelPainter.fromRGBA(frame.width, frame.height, frame.rgba), x, y);
    return { label, identity, labelRect: { x, y: gap, w: label.length * 4, h: 5 }, assetRect: { x, y, w: frame.width, h: frame.height } };
  });
  const display = scaleNearest(p, scale);
  return { native: { width: p.w, height: p.h, rgba: p.toRGBA() }, display: { width: display.w, height: display.h, rgba: display.toRGBA() }, meta: { kind: 'symbolic_contact_sheet', scale, cells } };
}
