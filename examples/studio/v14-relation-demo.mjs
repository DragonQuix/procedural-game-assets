#!/usr/bin/env node
/** 工程示例，不是 benchmark；正式执行和审图交给独立验证者。 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileStudioDocument, createProtectedDocument } from '../../src/studio/compiler.js';
import { applyOperation } from '../../src/studio/operators.js';
import { StudioStore } from '../../src/adapters/studio-store.js';
import { inspectFromFile, inspectWorkspace, submitWorkspace } from '../../src/adapters/studio-files.js';
import { symbolicContactSheet } from '../../src/observe/symbolic-sheet.js';
import { diffOverlay } from '../../src/observe/frame-views.js';
import { encodePNG } from '../../src/export/png.js';

export function relationDemoDocument() {
  return createProtectedDocument({
    schemaVersion: 'pga-studio/4', id: 'relation-demo', seed: 14042,
    renderProfile: { name: 'pixel-flat', version: 1 },
    style: { id: 'copper-stone', version: 1, ramps: { stone: ['#282d35', '#5d6974', '#a7b0b1', '#e7dfcd'], copper: ['#442d29', '#a9623d', '#dd9b56', '#ffe0a3'] } },
    canvas: { w: 40, h: 36, outline: null }, anchor: { x: 20, y: 30 }, attachments: {}, constraints: [],
    nodes: [
      { id: 'node.a', kind: 'panel', x: 9, y: 13, w: 22, h: 14, material: 'bevel-metal', ramp: 'stone', layer: 0 },
      { id: 'node.b', kind: 'panel', x: 17, y: 4, w: 6, h: 9, material: 'shade-diag', ramp: 'copper', layer: 1 },
      { id: 'node.c', kind: 'panel', x: 5, y: 27, w: 30, h: 3, material: 'bevel-metal', ramp: 'stone', layer: 2 },
    ],
    relations: [{ id: 'R1', type: 'contact', endpointA: { nodeId: 'node.a', feature: 'top-edge' }, endpointB: { nodeId: 'node.b', feature: 'bottom-edge' },
      tolerance: 0, required: true, resolution: { mode: 'resize-follower-edge', follower: 'B', axis: 'y', invariant: 'opposite-edge-and-orthogonal-geometry' } }],
  }, { protectedRegions: [{ x: 0, y: 27, w: 40, h: 9 }], metadataPaths: ['anchor'], nodeIds: ['node.c'] });
}

export async function runRelationDemo(out) {
  await mkdir(out); // 不覆盖既有证据。
  const doc = relationDemoDocument(), baseline = compileStudioDocument(doc);
  const operation = { id: 'squash_keep_base', target: 'node.a', params: { deltaHeight: -1 } };
  const gapDoc = applyOperation(doc, operation).doc, gap = compileStudioDocument(gapDoc);
  const json = (name, value) => writeFile(join(out, name), JSON.stringify(value, null, 2) + '\n');
  await json('gap-diagnostic.studio.json', gapDoc);
  const gapInspection = await inspectFromFile(join(out, 'gap-diagnostic.studio.json'));
  const { store } = await StudioStore.create(join(out, 'ws'), doc);
  const rejected = await store.edit({ baseRevision: 'r1', operation });
  const candidate = await store.edit({ baseRevision: 'r1', operation: { ...operation, preserveRelations: true } });
  if (!candidate.candidateId) throw new Error('Relation-aware demo did not produce a legal candidate');
  await store.commit({ action: 'accept', candidateId: candidate.candidateId, expectedHead: 'r1' });
  const final = await store._getCompiled('r2'), inspection = await inspectWorkspace(store.dir);
  const submit = await submitWorkspace(store.dir, join(out, 'submit'));
  const entries = [{ label: 'A', frame: baseline.asset.frames[0] }, { label: 'B', frame: gap.asset.frames[0] }, { label: 'C', frame: final.asset.frames[0] }];
  for (const { label, frame } of entries) await writeFile(join(out, `${label}.png`), encodePNG(frame.width, frame.height, frame.rgba));
  const sheet = symbolicContactSheet(entries), diff = diffOverlay(entries[0].frame, entries[2].frame);
  for (const [name, view] of [['contact-sheet', sheet], ['diff', diff]]) await writeFile(join(out, `${name}.png`), encodePNG(view.display.width, view.display.height, view.display.rgba));
  await json('relation-inspection.json', { baseline: baseline.relations, gap: gapInspection.relations, final: inspection.relations });
  const evidence = { schema: 'pga-relation-demo/1', formalBenchmark: false, identities: { A: 'baseline', B: 'rejected-diagnostic-only', C: candidate.candidateId },
    baselineStatus: baseline.relations.entries[0].status, ordinaryEdit: rejected.status,
    gapPx: gapInspection.relations.entries[0].signedGapPx, candidateChecks: candidate.checks,
    submit: { relation: submit.relations.status, protection: submit.protection.status }, sheet: sheet.meta };
  await json('evidence.json', evidence);
  if (evidence.baselineStatus !== 'SATISFIED' || evidence.gapPx !== 1 || evidence.ordinaryEdit !== 'REJECTED_UNSAFE' || evidence.submit.relation !== 'PASS' || evidence.submit.protection !== 'PASS') throw new Error('Demo evidence contract failed');
  return evidence;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const i = process.argv.indexOf('--out');
  if (i < 0) throw new Error('需要 --out <全新输出目录>');
  console.log(JSON.stringify(await runRelationDemo(resolve(process.argv[i + 1])), null, 2));
}
