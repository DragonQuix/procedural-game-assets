import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { encodePNG } from './src/export/png.js';
import { PixelPainter } from './src/core/raster.js';
import { scaleNearest } from './src/core/transform.js';
import { targetCrop, diffOverlay } from './src/observe/frame-views.js';
import { symbolicContactSheet } from './src/observe/symbolic-sheet.js';

export async function observe(out, baseline, candidate, cropRect) {
  await mkdir(out, { recursive: true });
  const up = f => {
    const p = scaleNearest(PixelPainter.fromRGBA(f.width, f.height, Uint8ClampedArray.from(f.rgba)), 4);
    return { width: p.w, height: p.h, rgba: p.toRGBA() };
  };
  const crop = targetCrop(candidate, { rect: cropRect, contextPx: 0, scale: 4 });
  const sheet = symbolicContactSheet([{ label: 'A', frame: baseline }, { label: 'B', frame: candidate }], { scale: 4 });
  const views = { 'baseline.native': baseline, 'baseline.display': up(baseline),
    'candidate.native': candidate, 'candidate.display': up(candidate),
    'task-crop.native': crop.native, 'task-crop.display': crop.display,
    diff: diffOverlay(baseline, candidate, { scale: 4 }).display, 'contact-sheet': sheet.display };
  for (const [name, f] of Object.entries(views)) await writeFile(join(out, `${name}.png`), encodePNG(f.width, f.height, Uint8ClampedArray.from(f.rgba)));
  return Object.keys(views).map(name => `${name}.png`);
}
