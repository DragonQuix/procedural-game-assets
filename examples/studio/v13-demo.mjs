#!/usr/bin/env node
// 工程演示，不启动 participant/reviewer，不使用正式实验资产。
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { StudioStore, ensureOutDir, writeMarker } from '../../src/adapters/studio-store.js';
import { inspectWorkspace, observeWorkspace, submitWorkspace } from '../../src/adapters/studio-files.js';
import { writeObservationBundle } from '../../src/adapters/observation-files.js';
import { buildViews } from '../../src/studio/observe.js';
import { encodePNG } from '../../src/export/png.js';
import { geometryDemoDocument, protectionDemoDocument } from './v13-assets.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const out = resolve(option('--out', 'work/studio-v13-demo'));
const evidence = resolve(option('--evidence', join(out, 'evidence')));
await mkdir(out, { recursive: true }); await ensureOutDir(evidence); await writeMarker(evidence, 'pga-studio-v1.3-demo');
const json = async (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');

async function images(name, before, after) {
  for (const [label, compiled] of [['before', before], ['after', after]]) {
    const views = buildViews(compiled, { displayScale: 4 });
    for (const kind of ['native', 'display']) await writeFile(join(evidence, `${name}-${label}.${kind}.png`), encodePNG(views[kind].width, views[kind].height, views[kind].rgba));
  }
  return writeObservationBundle(join(evidence, name), { base: { frame: before.asset.frames[0], identity: { revision: 'r1' } }, candidates: [{ frame: after.asset.frames[0], identity: { revision: 'final', candidateId: `${name}-final` } }] });
}
async function accept(store, c) {
  assert.ok(['OK', 'UNCHANGED'].includes(c.status), JSON.stringify(c));
  return store.commit({ action: 'accept', candidateId: c.candidateId, expectedHead: store.head });
}

const A = (await StudioStore.create(join(out, 'A'), geometryDemoDocument())).store;
const beforeA = await A._getCompiled('r1');
const inspectA = await inspectWorkspace(A.dir, { node: 'compressor.body', outDir: join(out, 'inspect-A') });
const badA = await A.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'compressor.body', params: { h: 28 } } });
assert.equal(badA.status, 'REJECTED_UNSAFE'); assert.equal(badA.candidateId, null);
const wide = await A.edit({ baseRevision: 'r1', operation: { id: 'widen_about_center', target: 'compressor.body', params: { deltaWidth: 8 } } });
await accept(A, wide);
const short = await A.edit({ baseRevision: 'r2', operation: { id: 'squash_keep_base', target: 'compressor.body', params: { deltaHeight: -8 } } });
await accept(A, short);
const explore = await A.explore({ baseRevision: 'r3', spec: { id: 'widen_about_center', target: 'compressor.body', field: 'deltaWidth', values: [-2, 0, 2] } });
assert.equal(explore.candidates.length, 3);
const contact = await observeWorkspace(A.dir, join(evidence, 'A-candidates'), { revision: 'r3', candidateIds: explore.candidates.map((c) => c.candidateId), node: 'compressor.body' });
await accept(A, explore.candidates[2]);
const finalA = await submitWorkspace(A.dir, join(out, 'A-final'));
assert.equal(finalA.protection.status, 'PASS');
const afterA = await A._getCompiled('r4');
await images('A', beforeA, afterA);
await json(join(evidence, 'A-evidence.json'), { schema: 'pga-v13-demo/1', status: 'PASS', asset: 'harbor-compressor', benchmarkRun: false,
  inspect: inspectA.safeDomain, rejectedLowLevel: badA, widen: wide.geometry, squash: short.geometry,
  explore: explore.candidates.map((c) => ({ value: c.value, candidateId: c.candidateId, status: c.status, geometry: c.geometry })),
  contactSheet: contact.observations[0], final: { revision: 'r4', hashes: afterA.hashes, protection: finalA.protection, geometry: afterA.document.nodes[1] } });

const B = (await StudioStore.create(join(out, 'B'), protectionDemoDocument())).store;
const beforeB = await B._getCompiled('r1');
const badB = await B.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'vault.base', params: { y: 25 } } });
assert.equal(badB.status, 'REJECTED_UNSAFE');
assert.ok(badB.conflicts.some((c) => c.protectionType === 'pixels' && c.changedPixelCount > 0));
const validB = await B.edit({ baseRevision: 'r1', operation: { id: 'resize_about_anchor', target: 'vault.body', params: { targetWidth: 14, targetHeight: 18, anchor: 'bottom-center' } } });
await accept(B, validB);
const finalB = await submitWorkspace(B.dir, join(out, 'B-final'));
assert.equal(finalB.protection.status, 'PASS');
const afterB = await B._getCompiled('r2'); await images('B', beforeB, afterB);
await json(join(evidence, 'B-evidence.json'), { schema: 'pga-v13-demo/1', status: 'PASS', asset: 'tidal-vault', benchmarkRun: false, rejected: badB,
  legal: validB.geometry, final: { revision: 'r2', hashes: afterB.hashes, protection: finalB.protection } });
console.log(JSON.stringify({ status: 'PASS', demoA: finalA.protection.status, demoB: finalB.protection.status, out, evidence }, null, 2));
