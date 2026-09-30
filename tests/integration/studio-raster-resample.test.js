import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { StudioStore } from '../../src/adapters/studio-store.js';
import { createRasterDocument, compileRasterDocument } from '../../src/studio/raster-doc.js';
import { decodePNG, encodePNG } from '../../src/export/png.js';

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

test('非空 PNG 非整数尺寸草稿后的掩码替换：透明擦除、候选身份与无外部文件重开', async (t) => {
  const root = await temporary(t), ws = join(root, 'ws'), image = join(root, 'source.png');
  const source = new Uint8ClampedArray(12 * 18 * 4);
  for (let y = 0; y < 18; y++) for (let x = 0; x < 12; x++) {
    if ((x + y) % 5) source.set([x * 13, y * 11, 73, 255], (y * 12 + x) * 4);
  }
  await writeFile(image, encodePNG(12, 18, source));
  const imported = cli('create', '--image', image, '--id', 'masked-size', '--out', ws,
    '--anchor', JSON.stringify({ x: 6.5, y: 17 }), '--attachments', JSON.stringify({ grip: { x: 7.5, y: 9 } }));
  assert.equal(imported.ok, true, JSON.stringify(imported));
  await rm(image);
  const size = cli('edit', '--ws', ws, '--base', 'r1', '--op', 'raster.resample', '--target', 'canvas',
    '--params', JSON.stringify({ width: 8, height: 12, sampling: 'nearest' }));
  assert.equal(size.ok, true, JSON.stringify(size));
  assert.deepEqual(size.result.diff, { total: null, outside: null, reason: 'FRAME_SIZE_CHANGED' });
  const xs = [0, 2, 3, 5, 6, 8, 9, 11], ys = [0, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17];
  const sampled = new Uint8ClampedArray(8 * 12 * 4);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 8; x++) {
    const i = (ys[y] * 12 + xs[x]) * 4;
    sampled.set(source.subarray(i, i + 4), (y * 8 + x) * 4);
  }
  const sizePreview = decodePNG(await readFile(join(ws, size.result.previews.candidate.native)));
  assert.deepEqual(sizePreview.rgba, sampled);
  assert.equal(cli('commit', '--ws', ws, '--accept', size.result.candidateId, '--expected-head', 'r1').ok, true);
  const before = (await (await StudioStore.open(ws))._getCompiled('r2')).asset.frames[0];
  assert.ok(Math.abs(before.anchor.x - 13 / 3) < 1e-12);
  assert.ok(Math.abs(before.anchor.y - 34 / 3) < 1e-12);
  assert.deepEqual(before.attachments.grip, { x: 5, y: 6 });

  const region = { id: 'target-detail', x: 3, y: 4, w: 3, h: 4, mask: ['010', '111', '101', '010'] };
  const patch = new Uint8ClampedArray(3 * 4 * 4);
  for (let i = 0; i < 12; i++) patch.set([197, 89, 43, 255], i * 4);
  patch.fill(0, 16, 20);
  const patchPath = join(root, 'patch.png'), opPath = join(root, 'replace.json');
  await writeFile(patchPath, encodePNG(3, 4, patch));
  await writeFile(opPath, JSON.stringify({ id: 'raster.replace', target: 'canvas', params: { region } }));
  const edited = cli('edit', '--ws', ws, '--base', 'r2', '--operation', opPath, '--image', patchPath,
    '--preserve', JSON.stringify(['anchor', 'attachments', 'frameSize'].map((target) => ({ kind: 'metadata', target }))),
    '--display-scale', '3');
  assert.equal(edited.ok, true, JSON.stringify(edited));
  assert.equal(edited.result.status, 'OK'); assert.equal(edited.result.head, 'r2');
  assert.equal(edited.result.diff.outside, 0);
  await rm(patchPath); await rm(opPath);
  const expected = new Uint8ClampedArray(sampled);
  for (let y = 0; y < region.h; y++) for (let x = 0; x < region.w; x++) {
    if (region.mask[y][x] === '1') expected.set(patch.subarray((y * 3 + x) * 4, (y * 3 + x + 1) * 4), ((region.y + y) * 8 + region.x + x) * 4);
  }
  const native = decodePNG(await readFile(join(ws, edited.result.previews.candidate.native)));
  assert.deepEqual([native.width, native.height], [8, 12]);
  assert.deepEqual(native.rgba, expected);
  assert.equal(sampled[(5 * 8 + 4) * 4 + 3], 255);
  assert.equal(native.rgba[(5 * 8 + 4) * 4 + 3], 0, 'mask=1 中透明补丁擦除基准，不保留下层');
  const observation = JSON.parse(await readFile(join(ws, edited.result.previews.candidate.observation), 'utf8'));
  assert.equal(observation.revision, 'r2'); assert.equal(observation.candidateId, edited.result.candidateId);
  assert.equal(observation.documentHash, edited.result.hashes.documentHash);
  assert.equal(observation.renderHash, edited.result.hashes.renderHash);
  assert.deepEqual(observation.region, region);
  assert.equal(observation.target_crop.candidateId, edited.result.candidateId);
  assert.deepEqual(observation.target_crop.crop, { x: 1, y: 2, w: 7, h: 8 });
  for (const key of ['cropLight', 'cropSilhouette']) {
    const crop = decodePNG(await readFile(join(ws, edited.result.previews.candidate[key])));
    assert.deepEqual([crop.width, crop.height], [21, 24]);
    assert.deepEqual([...crop.rgba.slice((9 * 21 + 9) * 4, (9 * 21 + 9) * 4 + 4)], [238, 232, 219, 255]);
  }
  const accepted = cli('commit', '--ws', ws, '--accept', edited.result.candidateId, '--expected-head', 'r2');
  assert.equal(accepted.ok, true, JSON.stringify(accepted));
  const out = join(root, 'export'), exported = cli('export', '--ws', ws, '--out', out);
  assert.equal(exported.ok, true, JSON.stringify(exported));
  const portable = JSON.parse(await readFile(join(out, exported.result.files.document), 'utf8'));
  const reopened = await StudioStore.create(join(root, 'reopened'), portable), frame = reopened.compiled.asset.frames[0];
  assert.deepEqual(frame.rgba, expected);
  assert.deepEqual(frame.anchor, before.anchor); assert.deepEqual(frame.attachments, before.attachments);
  assert.equal(reopened.compiled.hashes.renderHash, edited.result.hashes.renderHash);
  const page = decodePNG(await readFile(join(out, exported.result.files.pages[0])));
  const manifest = JSON.parse(await readFile(join(out, exported.result.files.manifest), 'utf8')), rect = manifest.frames[0].rect;
  for (let y = 0; y < 12; y++) assert.deepEqual(page.rgba.slice(((rect.y + y) * page.width + rect.x) * 4, ((rect.y + y) * page.width + rect.x + 8) * 4), expected.slice(y * 32, (y + 1) * 32));
  const restored = cli('commit', '--ws', ws, '--restore', 'r2', '--expected-head', 'r3');
  assert.equal(restored.ok, true, JSON.stringify(restored));
  assert.equal(restored.result.hashes.renderHash, size.result.hashes.renderHash);
});
