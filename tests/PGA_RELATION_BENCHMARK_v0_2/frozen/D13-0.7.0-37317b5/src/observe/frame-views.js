/** 普通 BakedFrame 的共享观察层；不依赖 Studio，可供任意实验 arm 使用。 */
import { PixelPainter } from '../core/raster.js';
import { scaleNearest } from '../core/transform.js';

function validateScale(scale) {
  if (!Number.isInteger(scale) || scale < 1 || scale > 32) throw new RangeError('scale 需要 1..32 整数');
}
function display(frame, scale) {
  validateScale(scale);
  const p = scaleNearest(PixelPainter.fromRGBA(frame.width, frame.height, frame.rgba), scale);
  return { width: p.w, height: p.h, rgba: p.toRGBA() };
}

export function targetCrop(frame, { rect, contextPx = 0, scale = 4, identity = {} }) {
  validateScale(scale);
  if (!rect || ![rect.x, rect.y, rect.w, rect.h, contextPx].every(Number.isInteger) || rect.w < 1 || rect.h < 1 || contextPx < 0) throw new RangeError('crop 需要整数矩形与非负 contextPx');
  const x = Math.max(0, rect.x - contextPx), y = Math.max(0, rect.y - contextPx);
  const x1 = Math.min(frame.width, rect.x + rect.w + contextPx), y1 = Math.min(frame.height, rect.y + rect.h + contextPx);
  if (x >= x1 || y >= y1) throw new RangeError('crop 与最终帧无交集');
  const width = x1 - x, height = y1 - y, rgba = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) rgba.set(frame.rgba.subarray(((y + row) * frame.width + x) * 4, ((y + row) * frame.width + x1) * 4), row * width * 4);
  const native = { width, height, rgba, origin: { x, y } };
  return { native, display: display(native, scale), meta: { kind: 'target_crop', frameId: frame.id, ...identity, scale, sampling: 'nearest', requestedRect: { ...rect }, contextPx, crop: { x, y, w: width, h: height } } };
}

const DIGITS = ['111101101101111','010110010010111','111001111100111','111001111001111','101101111001001','111100111001111','111100111101111','111001001001001','111101111101111','111101111001111'];
function numberLabel(p, value, x, y) {
  for (const [j, digit] of String(value).split('').entries()) {
    for (let i = 0; i < 15; i++) if (DIGITS[Number(digit)][i] === '1') p.set(x + j * 4 + i % 3, y + Math.floor(i / 3), '#ffffff');
  }
}

export function candidateContactSheet(entries, { scale = 4, gap = 2, background = '#202028' } = {}) {
  validateScale(scale);
  if (!Array.isArray(entries) || !entries.length || entries.length > 17 || !Number.isInteger(gap) || gap < 0 || gap > 32) throw new RangeError('contact sheet 需要 1..17 项，gap 需要 0..32 整数');
  const w = Math.max(...entries.map((e) => e.frame.width)), h = Math.max(...entries.map((e) => e.frame.height));
  const p = new PixelPainter(entries.length * (w + gap) + gap, h + gap * 2 + 7);
  p.rect(0, 0, p.w, p.h, background);
  const cells = entries.map(({ frame, identity }, i) => {
    const x = gap + i * (w + gap), y = gap + 7;
    numberLabel(p, i, x, gap);
    p.blit(PixelPainter.fromRGBA(frame.width, frame.height, frame.rgba), x, y);
    return { index: i, label: identity?.candidateId ?? identity?.revision ?? frame.id, ...identity, frameId: frame.id, nativeRect: { x, y, w: frame.width, h: frame.height }, displayRect: { x: x * scale, y: y * scale, w: frame.width * scale, h: frame.height * scale } };
  });
  const native = { width: p.w, height: p.h, rgba: p.toRGBA() };
  return { native, display: display(native, scale), meta: { kind: 'candidate_contact_sheet', scale, sampling: 'nearest', background, cells } };
}

export function diffOverlay(base, candidate, { scale = 4, baseIdentity = {}, candidateIdentity = {} } = {}) {
  if (base.width !== candidate.width || base.height !== candidate.height) throw new RangeError('diff overlay 需要相同尺寸');
  const rgba = new Uint8ClampedArray(candidate.rgba);
  let changedPixelCount = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let i = 0; i < rgba.length; i += 4) {
    if (![0, 1, 2, 3].some((c) => base.rgba[i + c] !== candidate.rgba[i + c])) continue;
    rgba.set([255, 64, 160, 255], i);
    const x = i / 4 % base.width, y = Math.floor(i / 4 / base.width);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); changedPixelCount++;
  }
  const native = { width: base.width, height: base.height, rgba };
  return { native, display: display(native, scale), meta: { kind: 'diff_overlay', scale, sampling: 'nearest', base: baseIdentity, candidate: candidateIdentity, changedPixelCount, changedBounds: changedPixelCount ? { x0, y0, x1, y1 } : null, color: '#ff40a0', observationOnly: true } };
}
