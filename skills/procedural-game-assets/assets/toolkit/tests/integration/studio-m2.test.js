/**
 * tests/integration/studio-m2.test.js — M2 闭环：创建 → 探索 → 拒绝 → 接受 → 恢复 → 导出，
 * 以及失败注入（篡改/过期/占用/冲突请求）与重启恢复。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StudioStore } from '../../src/adapters/studio-store.js';
import { validateManifest } from '../../src/export/manifest.js';
import { exportWorkspace } from '../../src/adapters/studio-files.js';

const here = dirname(fileURLToPath(import.meta.url));
const bin = resolve(here, '../../bin/pga-studio.mjs');
const DOC = resolve(here, '../../examples/studio/terminal.studio.json');
const OPTS = { generator: 'test', toolVersion: 'test' };

async function makeWorkspace() {
  const dir = join(mkdtempSync(join(tmpdir(), 'pga-m2-')), 'ws');
  const doc = JSON.parse(readFileSync(DOC, 'utf8'));
  const { store, revision } = await StudioStore.create(dir, doc, OPTS);
  return { dir, store, revision };
}

test('M2 主流程：探索三候选（含 UNCHANGED 去重）→ 接受 → 恢复 → 哈希一致', async () => {
  const { dir, store } = await makeWorkspace();
  const r1Hashes = (await store._getCompiled('r1')).hashes;

  const explored = await store.explore({ baseRevision: 'r1', spec: { id: 'geometry.set', target: 'terminal.shell', field: 'w', values: [24, 26, 28] } });
  assert.equal(explored.candidates.length, 3);
  const [c24, c26, c28] = explored.candidates;
  assert.equal(c24.status, 'OK', JSON.stringify(c24.conflicts));
  assert.equal(c26.status, 'UNCHANGED');
  assert.equal(c26.duplicateOf, 'base', '与基准渲染相同必须标注去重');
  assert.equal(c28.status, 'OK');
  assert.equal(explored.uniqueCount, 2, '重复渲染不计入多样性');
  assert.equal(c28.diff.outside, 0, '允许区域外不得有变化');

  const accepted = await store.commit({ action: 'accept', candidateId: c28.candidateId, expectedHead: 'r1' });
  assert.equal(accepted.revision, 'r2');
  assert.equal(accepted.head, 'r2');
  assert.equal((await store.state()).head, 'r2');
  const r2Hashes = (await store._getCompiled('r2')).hashes;
  assert.notEqual(r2Hashes.renderHash, r1Hashes.renderHash);
  assert.equal(r2Hashes.renderHash, c28.hashes.renderHash, '提交后渲染应与候选一致');

  const restored = await store.commit({ action: 'restore', targetRevision: 'r1', expectedHead: 'r2' });
  assert.equal(restored.revision, 'r3', '恢复是引用旧内容的新历史节点，不是抹除历史');
  const r3 = await store._getCompiled('r3');
  assert.equal(r3.hashes.renderHash, r1Hashes.renderHash, '恢复后像素哈希必须与 r1 精确一致');
  assert.equal(r3.hashes.documentHash, r1Hashes.documentHash, '恢复后文档哈希必须与 r1 精确一致');
  assert.deepEqual((await store.state()).revisions, ['r1', 'r2', 'r3'], '历史不被抹除');

  const out = join(dir, 'export');
  const exported = await exportWorkspace(dir, out, OPTS);
  const manifest = JSON.parse(readFileSync(join(out, exported.files.manifest), 'utf8'));
  assert.deepEqual(validateManifest(manifest), []);
  assert.equal(exported.revision, 'r3');
});

test('保护拒绝：修改受像素保护的屏幕 → REJECTED，且不能提交，head 不受污染', async () => {
  const { store } = await makeWorkspace();
  const edit = await store.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'terminal.screen', params: { w: 10 } } });
  assert.equal(edit.status, 'REJECTED');
  assert.equal(edit.code, 'CONSTRAINT_CONFLICT');
  assert.ok(edit.conflicts.some((c) => c.target === 'terminal.screen'));
  await assert.rejects(() => store.commit({ action: 'accept', candidateId: edit.candidateId, expectedHead: 'r1' }), (e) => e.code === 'CANDIDATE_INVALID');
  assert.equal((await store.state()).head, 'r1', '错误候选不得移动 head');
});

test('过期拒绝：错误 expectedHead 与过期基准候选都返回 STALE_REVISION', async () => {
  const { store } = await makeWorkspace();
  const edit = await store.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'terminal.shell', params: { w: 28 } } });
  await assert.rejects(() => store.commit({ action: 'accept', candidateId: edit.candidateId, expectedHead: 'r99' }), (e) => e.code === 'STALE_REVISION');
  await store.commit({ action: 'accept', candidateId: edit.candidateId, expectedHead: 'r1' });
  // head 已移动到 r2：基于 r1 的候选过期
  const stale = await store.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'terminal.shell', params: { w: 24 } } });
  await assert.rejects(() => store.commit({ action: 'accept', candidateId: stale.candidateId, expectedHead: 'r2' }), (e) => e.code === 'STALE_REVISION');
  assert.equal((await store.state()).head, 'r2');
});

test('篡改注入：改动候选文件的检查结果或文档，提交一律拒绝且不污染 head', async () => {
  const { dir, store } = await makeWorkspace();
  const bad = await store.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'terminal.screen', params: { w: 10 } } });
  assert.equal(bad.status, 'REJECTED');
  // 注入 1：把 REJECTED 伪造成 OK
  const path = join(dir, 'candidates', `${bad.candidateId}.json`);
  const forged = JSON.parse(readFileSync(path, 'utf8'));
  forged.checks.status = 'OK';
  forged.checks.code = null;
  forged.checks.conflicts = [];
  writeFileSync(path, JSON.stringify(forged, null, 2));
  await assert.rejects(() => store.commit({ action: 'accept', candidateId: bad.candidateId, expectedHead: 'r1' }), (e) => e.code === 'CANDIDATE_INVALID');
  assert.equal((await store.state()).head, 'r1');
  // 注入 2：正常候选的文档被改动（哈希对不上）
  const good = await store.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'terminal.shell', params: { w: 28 } } });
  const goodPath = join(dir, 'candidates', `${good.candidateId}.json`);
  const forged2 = JSON.parse(readFileSync(goodPath, 'utf8'));
  forged2.doc.nodes.find((n) => n.id === 'terminal.shell').w = 27;
  writeFileSync(goodPath, JSON.stringify(forged2, null, 2));
  await assert.rejects(() => store.commit({ action: 'accept', candidateId: good.candidateId, expectedHead: 'r1' }), (e) => e.code === 'CANDIDATE_INVALID');
  assert.equal((await store.state()).head, 'r1');
});

test('幂等与重启恢复：同 requestId 重试返回同一结果不重复接受；重开后台账仍在', async () => {
  const { dir, store } = await makeWorkspace();
  const edit = await store.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'terminal.shell', params: { w: 28 } }, requestId: 'demo-req-1' });
  const first = await store.commit({ action: 'accept', candidateId: edit.candidateId, expectedHead: 'r1', requestId: 'demo-req-2' });
  assert.equal(first.revision, 'r2');
  // 重启（新实例，无内存状态）
  const reopened = await StudioStore.open(dir, OPTS);
  const replay = await reopened.commit({ action: 'accept', candidateId: edit.candidateId, expectedHead: 'r1', requestId: 'demo-req-2' });
  assert.equal(replay.idempotentReplay, true, '同 requestId 同内容应命中台账');
  assert.equal(replay.revision, 'r2');
  assert.equal((await reopened.state()).head, 'r2', '重试不得重复接受产生 r3');
  await assert.rejects(
    () => reopened.commit({ action: 'accept', candidateId: 'c-ffffffff', expectedHead: 'r2', requestId: 'demo-req-2' }),
    (e) => e.code === 'REQUEST_ID_CONFLICT',
  );
});

test('失败注入：活锁拒绝、死锁接管、临时残留可识别', async () => {
  const { dir, store } = await makeWorkspace();
  writeFileSync(join(dir, 'lock'), JSON.stringify({ pid: process.pid }));
  await assert.rejects(() => store.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'terminal.shell', params: { w: 28 } } }), (e) => e.code === 'WORKSPACE_BUSY');
  writeFileSync(join(dir, 'lock'), JSON.stringify({ pid: 99999999 })); // 死 pid → 接管
  const edit = await store.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'terminal.shell', params: { w: 28 } } });
  assert.equal(edit.status, 'OK');
  // 临时残留：可识别、不自动删除、不影响 head
  writeFileSync(join(dir, 'head.json.tmp-123-1'), '{}');
  const state = await store.state();
  assert.ok(state.staleTempFiles.includes('head.json.tmp-123-1'));
  assert.equal(state.head, 'r1');
});

test('CLI 端到端：create → explore → commit → state 全 JSON 合同', () => {
  const ws = join(mkdtempSync(join(tmpdir(), 'pga-m2cli-')), 'ws');
  const run = (args) => JSON.parse(execFileSync(process.execPath, [bin, ...args], { encoding: 'utf8' }));
  const created = run(['create', '--doc', DOC, '--out', ws]);
  assert.equal(created.ok, true);
  assert.equal(created.result.head, 'r1');
  const explored = run(['explore', '--ws', ws, '--base', 'r1', '--op', 'geometry.set', '--target', 'terminal.shell', '--field', 'w', '--values', '24,26,28']);
  assert.equal(explored.ok, true);
  const winner = explored.result.candidates.find((c) => c.value === 28);
  assert.equal(winner.status, 'OK');
  const committed = run(['commit', '--ws', ws, '--accept', winner.candidateId, '--expected-head', 'r1']);
  assert.equal(committed.ok, true);
  assert.equal(committed.result.revision, 'r2');
  const state = run(['state', '--ws', ws]);
  assert.equal(state.result.head, 'r2');
  // 过期基准候选（派生自 r1，head 已是 r2）→ 退出码 6；注意与原请求逐字相同会是幂等重放而非过期
  try {
    execFileSync(process.execPath, [bin, 'commit', '--ws', ws, '--accept', winner.candidateId, '--expected-head', 'r2'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.fail('应因过期基准候选拒绝');
  } catch (e) {
    assert.equal(e.status, 6);
    assert.equal(JSON.parse(e.stdout).error.code, 'STALE_REVISION');
  }
});
