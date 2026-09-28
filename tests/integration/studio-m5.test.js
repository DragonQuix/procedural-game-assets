/**
 * tests/integration/studio-m5.test.js — M5 集成：角色编辑事务全流程 + CLI 角色合同。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StudioStore } from '../../src/adapters/studio-store.js';
import { exportWorkspace } from '../../src/adapters/studio-files.js';
import { validateManifest } from '../../src/export/manifest.js';

const here = dirname(fileURLToPath(import.meta.url));
const bin = resolve(here, '../../bin/pga-studio.mjs');
const DOC = resolve(here, '../../examples/studio/rustclaw.studio.json');
const OPTS = { generator: 'test', toolVersion: 'test' };

test('M5 全流程：改色提交 → 腿长探索 → 恢复哈希一致 → 多帧导出与播放材料', async () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'pga-m5-')), 'ws');
  const doc = JSON.parse(readFileSync(DOC, 'utf8'));
  const { store } = await StudioStore.create(dir, doc, OPTS);
  const r1 = await store._getCompiled('r1');
  assert.equal(r1.asset.frames.length, 13);

  const edit = await store.edit({ baseRevision: 'r1', operation: { id: 'palette.set', target: 'V', value: '#ffd23d' } });
  assert.equal(edit.status, 'OK', JSON.stringify(edit.conflicts));
  assert.equal(edit.checks.affectedFrames.length, 12);
  assert.equal(edit.checks.notCoveredChanges[0].id, 'dead_ground');
  const acc = await store.commit({ action: 'accept', candidateId: edit.candidateId, expectedHead: 'r1' });
  assert.equal(acc.revision, 'r2');

  const explored = await store.explore({ baseRevision: 'r2', spec: { id: 'rig.set', target: 'thigh', values: [3, 4, 5] } });
  assert.equal(explored.candidates[1].status, 'UNCHANGED');
  assert.equal(explored.candidates[2].status, 'OK');
  const acc2 = await store.commit({ action: 'accept', candidateId: explored.candidates[2].candidateId, expectedHead: 'r2' });
  assert.equal(acc2.revision, 'r3');

  const restored = await store.commit({ action: 'restore', targetRevision: 'r1', expectedHead: 'r3' });
  assert.equal(restored.hashes.renderHash, r1.hashes.renderHash);
  assert.equal(restored.hashes.documentHash, r1.hashes.documentHash);

  const out = join(dir, 'export');
  const exported = await exportWorkspace(dir, out, OPTS);
  const manifest = JSON.parse(readFileSync(join(out, exported.files.manifest), 'utf8'));
  assert.deepEqual(validateManifest(manifest), []);
  assert.equal(manifest.frames.length, 13);
  assert.equal(Object.keys(manifest.clips).length, 4);
  assert.equal(manifest.recipe.kind, 'humanoid');
  // 播放材料存在于候选/基准预览
  const previewLabels = readdirSync(join(dir, 'previews'));
  assert.ok(previewLabels.some((label) => existsSync(join(dir, 'previews', label, `${label}.player.html`))), '应有 player.html 播放材料');
});

test('CLI 角色合同：create → state → edit（--op palette.set --value）→ commit → export', () => {
  const ws = join(mkdtempSync(join(tmpdir(), 'pga-m5cli-')), 'ws');
  const run = (args) => JSON.parse(execFileSync(process.execPath, [bin, ...args], { encoding: 'utf8' }));
  const created = run(['create', '--doc', DOC, '--out', ws]);
  assert.equal(created.ok, true);
  assert.equal(created.result.kind, 'humanoid');
  assert.equal(created.result.frames.length, 13);
  const edit = run(['edit', '--ws', ws, '--base', 'r1', '--op', 'palette.set', '--target', 'V', '--value', '#ffd23d']);
  assert.equal(edit.ok, true);
  assert.equal(edit.result.status, 'OK');
  assert.equal(edit.result.checks.affectedFrames.length, 12);
  const committed = run(['commit', '--ws', ws, '--accept', edit.result.candidateId, '--expected-head', 'r1']);
  assert.equal(committed.result.revision, 'r2');
  // rig.set 经 CLI（JSON 值解析）
  const rig = run(['edit', '--ws', ws, '--base', 'r2', '--op', 'rig.set', '--target', 'guns.fwd.len', '--value', '9']);
  assert.equal(rig.result.status, 'OK');
  const exported = run(['export', '--ws', ws, '--out', join(ws, 'ex')]);
  assert.equal(exported.ok, true);
});
