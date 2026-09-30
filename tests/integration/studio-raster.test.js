import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { StudioStore } from '../../src/adapters/studio-store.js';
import { createRasterDocument, compileRasterDocument } from '../../src/studio/raster-doc.js';
import { createRasterWorkspace, exportWorkspace, observeWorkspace, readRasterPNG, rasterOperationWithImage } from '../../src/adapters/studio-files.js';
import { decodePNG, encodePNG } from '../../src/export/png.js';
import { validateManifest } from '../../src/export/manifest.js';

const bin = fileURLToPath(new URL('../../bin/pga-studio.mjs', import.meta.url));
const operation = { id: 'raster.draw', target: 'canvas', params: { region: { id: 'mark', x: 2, y: 2, w: 2, h: 2 }, commands: [{ kind: 'rect', x: 0, y: 0, w: 2, h: 2, color: '#fd8321' }] } };
async function temporary(t) {
  const dir = await mkdtemp(join(tmpdir(), 'pga-raster-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
function cli(...args) {
  const proc = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
  assert.ok(proc.stdout, proc.stderr);
  return { code: proc.status, ...JSON.parse(proc.stdout) };
}

test('位图事务：候选不移 head、拒绝/提交/幂等/重开/恢复/过期/导出可携带', async (t) => {
  const root = await temporary(t), ws = join(root, 'ws');
  const created = await createRasterWorkspace(ws, { id: 'unit', width: 8, height: 8 });
  const store = await StudioStore.open(ws);
  const edited = await store.edit({ baseRevision: 'r1', operation, requestId: 'draw' });
  assert.equal(edited.status, 'OK'); assert.equal(edited.head, 'r1');
  assert.equal(edited.diff.outside, 0);
  const rejected = await store.edit({ baseRevision: 'r1', operation, preserve: [{ kind: 'pixels', target: 'canvas' }] });
  assert.equal(rejected.status, 'REJECTED');
  await assert.rejects(store.commit({ action: 'accept', candidateId: rejected.candidateId, expectedHead: 'r1' }));
  const accepted = await store.commit({ action: 'accept', candidateId: edited.candidateId, expectedHead: 'r1', requestId: 'accept' });
  assert.equal(accepted.head, 'r2');
  const reopened = await StudioStore.open(ws);
  assert.equal((await reopened.commit({ action: 'accept', candidateId: edited.candidateId, expectedHead: 'r1', requestId: 'accept' })).idempotentReplay, true);
  await assert.rejects(reopened.edit({ baseRevision: 'r1', operation, requestId: 'stale' }), (e) => e.code === 'STALE_REVISION');
  const out = join(root, 'out'), exported = await exportWorkspace(ws, out);
  const doc = JSON.parse(await readFile(join(out, exported.files.document), 'utf8'));
  assert.equal(compileRasterDocument(doc).hashes.renderHash, accepted.hashes.renderHash);
  const portable = await StudioStore.create(join(root, 'portable'), doc);
  assert.equal(portable.compiled.hashes.renderHash, accepted.hashes.renderHash);
  const manifest = JSON.parse(await readFile(join(out, exported.files.manifest), 'utf8'));
  assert.deepEqual(validateManifest(manifest), []); assert.equal(manifest.recipe.kind, 'raster');
  const page = decodePNG(await readFile(join(out, exported.files.pages[0]))), rect = manifest.frames[0].rect;
  const frame = portable.compiled.asset.frames[0];
  for (let y = 0; y < 8; y++) assert.deepEqual(page.rgba.slice(((rect.y + y) * page.width + rect.x) * 4, ((rect.y + y) * page.width + rect.x + 8) * 4), frame.rgba.slice(y * 32, (y + 1) * 32));
  const restored = await reopened.commit({ action: 'restore', targetRevision: 'r1', expectedHead: 'r2' });
  assert.equal(restored.head, 'r3'); assert.equal(restored.hashes.renderHash, created.hashes.renderHash);
});

test('篡改位图或掩码不能提交或作为有效观察候选', async (t) => {
  const root = await temporary(t), ws = join(root, 'ws');
  const { store } = await StudioStore.create(ws, createRasterDocument({ id: 'unit', width: 8, height: 8 }));
  const edited = await store.edit({ baseRevision: 'r1', operation });
  const path = join(ws, 'candidates', `${edited.candidateId}.json`);
  const record = JSON.parse(await readFile(path, 'utf8'));
  record.operation.params.region.x = 1;
  await writeFile(path, JSON.stringify(record));
  await assert.rejects(store.commit({ action: 'accept', candidateId: edited.candidateId, expectedHead: 'r1' }));
  const observation = await observeWorkspace(ws, join(root, 'observation'), { candidateIds: [edited.candidateId] });
  assert.ok(JSON.stringify(observation).includes('TAMPERED'));
  assert.equal((await store.state()).head, 'r1');
});

test('PNG 导入保留像素；替换操作物化像素后不依赖原 PNG', async (t) => {
  const root = await temporary(t), path = join(root, 'input.png');
  const bytes = new Uint8ClampedArray([10, 20, 30, 255, 1, 2, 3, 0, 40, 50, 60, 255, 0, 0, 0, 0]);
  await writeFile(path, encodePNG(2, 2, bytes));
  const created = await createRasterWorkspace(join(root, 'ws'), { id: 'imported', image: path });
  const store = await StudioStore.open(join(root, 'ws'));
  const canonical = new Uint8ClampedArray(bytes); canonical.set([0, 0, 0, 0], 4);
  assert.deepEqual((await store._getCompiled('r1')).asset.frames[0].rgba, canonical);
  const op = await rasterOperationWithImage({ id: 'raster.replace', target: 'canvas', params: { region: { id: 'all', x: 0, y: 0, w: 2, h: 2 } } }, path);
  await rm(path);
  assert.equal((await store.edit({ baseRevision: 'r1', operation: op })).status, 'UNCHANGED');
  assert.deepEqual(created.final, { w: 2, h: 2 });
});

test('PNG 资源上限、半透明和尺寸冲突明确拒绝', async (t) => {
  const root = await temporary(t), path = join(root, 'input.png');
  await writeFile(path, encodePNG(1, 1, new Uint8ClampedArray([10, 20, 30, 128])));
  await assert.rejects(createRasterWorkspace(join(root, 'alpha'), { id: 'alpha', image: path }), /alpha/);
  await assert.rejects(createRasterWorkspace(join(root, 'size'), { id: 'size', image: path, width: 2 }), /尺寸/);
  const bytes = Buffer.from(await readFile(path)); bytes.writeUInt32BE(100000, 16);
  await writeFile(path, bytes);
  await assert.rejects(readRasterPNG(path), (e) => e.code === 'RESOURCE_LIMIT');
});

test('真实 JSON CLI：创建/文件操作/局部观察/提交/导出及错误选项', async (t) => {
  const root = await temporary(t), ws = join(root, 'ws'), op = join(root, 'draw.json');
  assert.equal(cli('create', '--blank', '--id', 'cli', '--width', '8', '--height', '8', '--out', ws).ok, true);
  await writeFile(op, JSON.stringify(operation));
  const edit = cli('edit', '--ws', ws, '--base', 'r1', '--operation', op);
  assert.equal(edit.ok, true, JSON.stringify(edit)); assert.equal(edit.result.status, 'OK');
  const view = cli('inspect', '--ws', ws, '--region', JSON.stringify(operation.params.region), '--out', join(root, 'view'));
  assert.equal(view.ok, true, JSON.stringify(view));
  for (const key of ['crop', 'cropDisplay', 'selection', 'light', 'silhouette']) assert.ok(view.result.files[key]);
  assert.equal(cli('commit', '--ws', ws, '--accept', edit.result.candidateId, '--expected-head', 'r1').ok, true);
  assert.equal(cli('export', '--ws', ws, '--out', join(root, 'export')).ok, true);
  assert.equal(cli('edit', '--ws', ws, '--base', 'r2', '--operation', op, '--op', 'raster.draw').code, 2);
  assert.equal(cli('create', '--blank', '--doc', 'unused', '--out', join(root, 'bad')).code, 2);
  assert.equal(cli('create', '--blank', '--id', 'bad', '--width', '--height', '8', '--out', join(root, 'missing-width')).code, 2);
  const propPath = fileURLToPath(new URL('../../examples/studio/terminal.studio.json', import.meta.url));
  assert.equal(cli('inspect', '--doc', propPath, '--region', JSON.stringify(operation.params.region)).error.code, 'UNSUPPORTED_SCOPE');
  assert.equal(cli('explore', '--ws', ws, '--base', 'r2', '--op', 'raster.draw', '--target', 'canvas', '--field', 'x', '--values', '1,2').error.code, 'UNSUPPORTED_SCOPE');
});
