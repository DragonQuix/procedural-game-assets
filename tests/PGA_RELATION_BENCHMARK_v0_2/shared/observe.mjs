#!/usr/bin/env node
/** Shared observation only: render through installed arm, never an atlas page. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { targetCrop, diffOverlay } from './src/observe/frame-views.js';
import { symbolicContactSheet } from './src/observe/symbolic-sheet.js';
import { encodePNG } from './src/export/png.js';
import { PixelPainter } from './src/core/raster.js';
import { scaleNearest } from './src/core/transform.js';

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? undefined : process.argv[i + 1]; };
if (!arg('trial') || !arg('out')) throw new Error('需要 --trial <试次目录> --out <新观察目录>');
const trial = resolve(arg('trial')), out = resolve(arg('out'));
const { StudioStore } = await import(pathToFileURL(join(trial, 'kit/src/adapters/studio-store.js')));
const store = await StudioStore.open(join(trial, 'ws')); await store._refreshHead();
const baseline = await store._getCompiled('r1'), revision = arg('revision') ?? store.head;
let current = await store._getCompiled(revision), candidateId = arg('candidate');
if (candidateId) {
  const record = await store._readCandidate(candidateId);
  if (record.baseRevision !== store.head) throw new Error('STALE_REVISION');
  const checked = store._verifyCandidate(candidateId, record, await store._getCompiled(record.baseRevision));
  if (!['OK', 'UNCHANGED'].includes(checked.checks.status)) throw new Error('REJECTED_CANDIDATE');
  current = checked.compiled;
}
const contract = JSON.parse(await readFile(join(trial, 'task/task-contract.json'), 'utf8'));
const a = baseline.asset.frames[0], b = current.asset.frames[0], scale = 4;
const node = baseline.sceneMap.nodes.find(n => n.id === contract.objectives.target);
const crop = targetCrop(b, { rect: node.frameRect, contextPx: 2, scale });
const diff = diffOverlay(a, b, { scale });
const sheet = symbolicContactSheet([{ label: 'A', frame: a }, { label: 'B', frame: b }], { scale });
const up = f => { const p = scaleNearest(PixelPainter.fromRGBA(f.width, f.height, f.rgba), scale); return { width: p.w, height: p.h, rgba: p.toRGBA() }; };
await mkdir(out);
for (const [name, f] of Object.entries({ 'baseline.native': a, 'baseline.display': up(a), 'current.native': b, 'current.display': up(b), 'target-crop.native': crop.native, 'target-crop.display': crop.display, diff: diff.display, 'contact-sheet': sheet.display })) {
  await writeFile(join(out, `${name}.png`), encodePNG(f.width, f.height, f.rgba));
}
const meta = { schema: 'pga-common-observation/2', revision, candidateId: candidateId ?? null, labels: { A: 'r1-baseline', B: candidateId ?? revision }, crop: crop.meta, sheet: sheet.meta, diff: diff.meta };
await writeFile(join(out, 'observation.json'), JSON.stringify(meta, null, 2));
console.log(JSON.stringify({ status: 'PASS', out, revision, candidateId: candidateId ?? null }));
