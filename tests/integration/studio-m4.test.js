/**
 * tests/integration/studio-m4.test.js — /2 集成：局部覆盖提交、poly 顶点探索、
 * /1+/2 共存、CLI /2 合同（create / explore vertices / export）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StudioStore } from '../../src/adapters/studio-store.js';
import { exportWorkspace } from '../../src/adapters/studio-files.js';
import { validateManifest } from '../../src/export/manifest.js';
import { stableStringify } from '../../src/studio/document.js';

const here = dirname(fileURLToPath(import.meta.url));
const bin = resolve(here, '../../bin/pga-studio.mjs');
const WRENCH = resolve(here, '../../examples/studio/wrench.studio.json');
const TERMINAL = resolve(here, '../../examples/studio/terminal.studio.json');
const OPTS = { generator: 'test', toolVersion: 'test' };

test('/2 全流程：局部覆盖提交不污染共享风格，poly 顶点探索可接受并导出', async () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'pga-m4-')), 'ws');
  const doc = JSON.parse(readFileSync(WRENCH, 'utf8'));
  const { store } = await StudioStore.create(dir, doc, OPTS);
  const r1 = await store._getCompiled('r1');

  const local = ['#1a1d24', '#333945', '#4d5566', '#7c8698'];
  const edit = await store.edit({ baseRevision: 'r1', operation: { id: 'ramp.set', target: 'wrench.jaw', ramp: { shades: local } } });
  assert.equal(edit.status, 'OK', JSON.stringify(edit.conflicts));
  const acc = await store.commit({ action: 'accept', candidateId: edit.candidateId, expectedHead: 'r1' });
  const r2 = await store._getCompiled('r2');
  assert.equal(stableStringify(r2.document.style), stableStringify(r1.document.style), '共享风格未被局部覆盖污染');
  assert.deepEqual(r2.document.nodes.find((n) => n.id === 'wrench.jaw').ramp, { shades: local });
  assert.equal(r2.document.nodes.find((n) => n.id === 'wrench.handle').ramp, 'steel');

  const jawV = r2.document.nodes.find((n) => n.id === 'wrench.jaw').vertices;
  const explored = await store.explore({ baseRevision: 'r2', spec: { id: 'geometry.set', target: 'wrench.jaw', field: 'vertices', values: [jawV, jawV.map(([x, y]) => [x, y + 1])] } });
  assert.equal(explored.candidates[0].status, 'UNCHANGED');
  assert.equal(explored.candidates[1].status, 'OK');
  const acc2 = await store.commit({ action: 'accept', candidateId: explored.candidates[1].candidateId, expectedHead: 'r2' });
  assert.equal(acc2.revision, 'r3');

  const out = join(dir, 'export');
  const exported = await exportWorkspace(dir, out, OPTS);
  const manifest = JSON.parse(readFileSync(join(out, exported.files.manifest), 'utf8'));
  assert.deepEqual(validateManifest(manifest), []);
  assert.equal(manifest.recipe.version, 'pga-studio/2');
});

test('/1 与 /2 共存：两个工作区互不影响，旧渲染不变', async () => {
  const dirA = join(mkdtempSync(join(tmpdir(), 'pga-m4a-')), 'ws');
  const dirB = join(mkdtempSync(join(tmpdir(), 'pga-m4b-')), 'ws');
  const a = await StudioStore.create(dirA, JSON.parse(readFileSync(TERMINAL, 'utf8')), OPTS);
  const b = await StudioStore.create(dirB, JSON.parse(readFileSync(WRENCH, 'utf8')), OPTS);
  assert.equal(a.compiled.document.schemaVersion, 'pga-studio/1');
  assert.equal(b.compiled.document.schemaVersion, 'pga-studio/2');
  assert.equal(a.compiled.hashes.renderHash, 'f645726c:6cebd809', '/1 渲染回归锚点');
  assert.notEqual(b.compiled.hashes.renderHash, a.compiled.hashes.renderHash);
});

test('CLI /2：create → explore vertices（JSON 数组）→ 导出全 JSON 合同', () => {
  const ws = join(mkdtempSync(join(tmpdir(), 'pga-m4cli-')), 'ws');
  const run = (args) => JSON.parse(execFileSync(process.execPath, [bin, ...args], { encoding: 'utf8' }));
  const created = run(['create', '--doc', WRENCH, '--out', ws]);
  assert.equal(created.ok, true);
  assert.equal(created.result.head, 'r1');
  assert.ok(readdirSync(ws).includes('wrench.display.png'));
  const jawV = JSON.stringify([[[11, 11], [18, 3], [22, 5], [20, 9], [17, 8], [14, 12]], [[11, 12], [18, 4], [22, 6], [20, 10], [17, 9], [14, 13]]]);
  const explored = run(['explore', '--ws', ws, '--base', 'r1', '--op', 'geometry.set', '--target', 'wrench.jaw', '--field', 'vertices', '--values', jawV]);
  assert.equal(explored.ok, true);
  assert.equal(explored.result.candidates[0].status, 'UNCHANGED');
  assert.equal(explored.result.candidates[1].status, 'OK');
  const committed = run(['commit', '--ws', ws, '--accept', explored.result.candidates[1].candidateId, '--expected-head', 'r1']);
  assert.equal(committed.result.revision, 'r2');
  const out = join(ws, 'export-cli');
  const exported = run(['export', '--ws', ws, '--out', out]);
  assert.equal(exported.ok, true);
  assert.ok(readdirSync(out).includes('wrench.manifest.json'));
});
