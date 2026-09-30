import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { StudioStore } from '../../src/adapters/studio-store.js';
import { createRasterDocument, compileRasterDocument } from '../../src/studio/raster-doc.js';
import { decodePNG } from '../../src/export/png.js';

const bin = fileURLToPath(new URL('../../bin/pga-studio.mjs', import.meta.url));
const operation = { id: 'raster.resample', target: 'canvas', params: { width: 4, height: 6, sampling: 'nearest' } };
async function temporary(t) {
  const dir = await mkdtemp(join(tmpdir(), 'pga-resample-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
function cli(...args) {
  const proc = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
  assert.ok(proc.stdout, proc.stderr);
  return { code: proc.status, ...JSON.parse(proc.stdout) };
}

test('尺寸候选实际可看、跨尺寸不伪报差分；接受/局部绘改/重开/导出/恢复保持坐标与像素', async (t) => {
  const root = await temporary(t), ws = join(root, 'ws'), input = join(root, 'resample.json');
  const doc = createRasterDocument({ id: 'portable', width: 8, height: 12, anchor: { x: 4, y: 11 }, attachments: { grip: { x: 7, y: 6 } } });
  const { compiled } = await StudioStore.create(ws, doc);
  await writeFile(input, JSON.stringify(operation));
  const edit = cli('edit', '--ws', ws, '--base', 'r1', '--operation', input, '--request-id', 'size');
  assert.equal(edit.ok, true, JSON.stringify(edit)); assert.equal(edit.result.head, 'r1');
  const inline = cli('edit', '--ws', ws, '--base', 'r1', '--op', 'raster.resample', '--target', 'canvas', '--params', JSON.stringify(operation.params), '--request-id', 'size-inline');
  assert.equal(inline.ok, true, JSON.stringify(inline));
  assert.equal(inline.result.candidateId, edit.result.candidateId);
  assert.equal(cli('edit', '--ws', ws, '--base', 'r1', '--op', 'raster.resample', '--target', 'canvas').ok, false);
  assert.deepEqual(edit.result.checks.resample.anchor.to, { x: 2, y: 5.5 });
  assert.deepEqual(edit.result.checks.resample.attachments.to.grip, { x: 3.5, y: 3 });
  assert.equal(edit.result.previews.candidate.crop, undefined);
  for (const [name, size] of [['base', [8, 12]], ['candidate', [4, 6]]]) {
    const png = decodePNG(await readFile(join(ws, edit.result.previews[name].native)));
    assert.deepEqual([png.width, png.height], size);
  }
  const observation = cli('observe', '--ws', ws, '--candidates', JSON.stringify([edit.result.candidateId]), '--region', JSON.stringify({ id: 'edge', x: 6, y: 10, w: 2, h: 2 }), '--out', join(root, 'comparison'));
  assert.equal(observation.ok, true, JSON.stringify(observation));
  const diff = observation.result.observations.find((v) => v.kind === 'diff_overlay');
  assert.equal(diff.status, 'NOT_COMPARABLE'); assert.equal(diff.reason, 'FRAME_SIZE_MISMATCH');
  assert.equal(diff.changedPixelCount, null); assert.equal(diff.files, null);
  const crop = observation.result.observations.find((v) => v.kind === 'target_crop' && v.candidateId === edit.result.candidateId);
  assert.equal(crop.status, 'NOT_COMPARABLE'); assert.equal(crop.files, null);
  assert.equal(cli('state', '--ws', ws).result.head, 'r1');
  assert.equal(cli('edit', '--ws', ws, '--base', 'r1', '--operation', input, '--request-id', 'size').result.idempotentReplay, true);
  await rm(input);
  assert.equal(cli('commit', '--ws', ws, '--accept', edit.result.candidateId, '--expected-head', 'r1').result.head, 'r2');
  const draw = cli('edit', '--ws', ws, '--base', 'r2', '--op', 'raster.draw', '--target', 'canvas', '--params', JSON.stringify({ region: { id: 'detail', x: 1, y: 1, w: 2, h: 2 }, commands: [{ kind: 'path', points: [[0, 0], [1, 1]], color: '#ed721f' }] }));
  assert.equal(draw.result.diff.outside, 0);
  assert.equal(cli('commit', '--ws', ws, '--accept', draw.result.candidateId, '--expected-head', 'r2').result.head, 'r3');
  const reopened = await StudioStore.open(ws), frame = (await reopened._getCompiled('r3')).asset.frames[0];
  assert.deepEqual(frame.anchor, { x: 2, y: 5.5 }); assert.deepEqual(frame.attachments.grip, { x: 3.5, y: 3 });
  const out = join(root, 'export'), exported = cli('export', '--ws', ws, '--out', out);
  const portable = JSON.parse(await readFile(join(out, exported.result.files.document), 'utf8'));
  assert.deepEqual(compileRasterDocument(portable).asset.frames[0].rgba, frame.rgba);
  const page = decodePNG(await readFile(join(out, exported.result.files.pages[0]))), manifest = JSON.parse(await readFile(join(out, exported.result.files.manifest), 'utf8'));
  const rect = manifest.frames[0].rect;
  for (let y = 0; y < 6; y++) assert.deepEqual(page.rgba.slice(((rect.y + y) * page.width + rect.x) * 4, ((rect.y + y) * page.width + rect.x + 4) * 4), frame.rgba.slice(y * 16, (y + 1) * 16));
  const restored = cli('commit', '--ws', ws, '--restore', 'r1', '--expected-head', 'r3');
  assert.equal(restored.result.head, 'r4'); assert.equal(restored.result.hashes.renderHash, compiled.hashes.renderHash);
});

test('继承和请求级保护都不能被重采样绕过；非法参数与候选篡改不移 head', async (t) => {
  const root = await temporary(t), doc = createRasterDocument({ id: 'protected', width: 8, height: 12 });
  const p = { kind: 'metadata', target: 'frameSize' };
  const { store } = await StudioStore.create(join(root, 'frozen'), { ...doc, constraints: [p] });
  const rejected = await store.edit({ baseRevision: 'r1', operation });
  assert.equal(rejected.status, 'REJECTED');
  await assert.rejects(store.commit({ action: 'accept', candidateId: rejected.candidateId, expectedHead: 'r1' }));
  const { store: editable } = await StudioStore.create(join(root, 'editable'), doc);
  assert.equal((await editable.edit({ baseRevision: 'r1', operation, preserve: [{ kind: 'pixels', target: 'canvas' }] })).status, 'REJECTED');
  await assert.rejects(editable.edit({ baseRevision: 'r1', operation: { ...operation, params: { ...operation.params, width: 3 } } }));
  const edited = await editable.edit({ baseRevision: 'r1', operation });
  const path = join(root, 'editable/candidates', `${edited.candidateId}.json`), record = JSON.parse(await readFile(path, 'utf8'));
  record.doc.anchor.x = 0; record.hashes = compileRasterDocument(record.doc).hashes;
  await writeFile(path, JSON.stringify(record));
  await assert.rejects(editable.commit({ action: 'accept', candidateId: edited.candidateId, expectedHead: 'r1' }), /重新推导/);
  assert.equal((await editable.state()).head, 'r1'); assert.equal((await store.state()).head, 'r1');
});
