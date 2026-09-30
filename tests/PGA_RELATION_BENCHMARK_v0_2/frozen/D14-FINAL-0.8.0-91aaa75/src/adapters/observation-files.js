/** 共享观察 IO：只消费标准帧和显式身份，不渲染新候选。 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { candidateContactSheet, diffOverlay, targetCrop } from '../observe/frame-views.js';
import { encodePNG } from '../export/png.js';
import { ensureOutDir, writeMarker } from './studio-store.js';

export async function writeObservationBundle(outDir, { base, candidates = [], crop, scale = 4, validation }) {
  await ensureOutDir(outDir);
  await writeMarker(outDir, 'pga-observation/1');
  const entries = [base, ...candidates], observations = [];
  const write = async (name, view) => {
    const files = { native: `${name}.native.png`, display: `${name}.display.png` };
    for (const kind of ['native', 'display']) await writeFile(join(outDir, files[kind]), encodePNG(view[kind].width, view[kind].height, view[kind].rgba));
    observations.push({ ...view.meta, files });
  };
  await write('contact-sheet', candidateContactSheet(entries, { scale }));
  for (const [i, candidate] of candidates.entries()) await write(`diff-${i + 1}`, diffOverlay(base.frame, candidate.frame, { scale, baseIdentity: base.identity, candidateIdentity: candidate.identity }));
  if (crop) for (const [i, entry] of entries.entries()) await write(`crop-${i}`, targetCrop(entry.frame, { rect: crop, scale, identity: entry.identity }));
  const result = { schemaVersion: 'pga-observation/1', observations, outDir, ...(validation ? { validation } : {}) };
  await writeFile(join(outDir, 'observation.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}
