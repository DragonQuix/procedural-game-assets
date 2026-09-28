/**
 * tests/integration/studio-review.test.js — 审查修复轮（R1–R8）集成回归
 * 依据 docs/PGA_STUDIO_REVIEW.md §4/§8：复现场景转为正式测试，断言正确行为。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StudioStore } from '../../src/adapters/studio-store.js';
import { exportWorkspace } from '../../src/adapters/studio-files.js';
import { validateManifest } from '../../src/export/manifest.js';

const here = dirname(fileURLToPath(import.meta.url));
const TERMINAL = resolve(here, '../../examples/studio/terminal.studio.json');
const WRENCH = resolve(here, '../../examples/studio/wrench.studio.json');
const RUSTCLAW = resolve(here, '../../examples/studio/rustclaw.studio.json');
const OPTS = { generator: 'test', toolVersion: 'test' };
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));

async function makeWorkspace(docPath, tag) {
  const dir = join(mkdtempSync(join(tmpdir(), `pga-review-${tag}-`)), 'ws');
  const { store } = await StudioStore.create(dir, load(docPath), OPTS);
  return { dir, store };
}

/** edit → commit → 重开 → 导出，全链路断言（R3/R8 验收口径）。 */
async function assertEditChain(dir, store, { baseRevision, operation, preserve = [] }, expectStatus = 'OK') {
  const edit = await store.edit({ baseRevision, operation, preserve });
  assert.equal(edit.status, expectStatus, `${operation.id} edit 状态：${JSON.stringify(edit.conflicts)}`);
  const committed = await store.commit({ action: 'accept', candidateId: edit.candidateId, expectedHead: baseRevision });
  const reopened = await StudioStore.open(dir, OPTS);
  assert.equal((await reopened.state()).head, committed.revision, '重开后 head 必须是新修订');
  const out = join(dir, 'export', committed.revision);
  const exported = await exportWorkspace(dir, out, OPTS);
  assert.equal(exported.revision, committed.revision);
  const manifest = JSON.parse(readFileSync(join(out, exported.files.manifest), 'utf8'));
  assert.deepEqual(validateManifest(manifest), [], '导出 manifest 必须过既有校验');
  return { edit, committed, exported };
}

/** explore → 选定候选 commit → 重开 → 导出（R3 核心回归：候选记录存的是标准 operation）。 */
async function assertExploreChain(dir, store, { baseRevision, spec, pick }, preserve = []) {
  const explored = await store.explore({ baseRevision, spec, preserve });
  const winner = explored.candidates.find(pick);
  assert.ok(winner, `探索取值 ${JSON.stringify(spec.values)} 中应找到目标候选`);
  assert.equal(winner.status, 'OK', `候选状态：${JSON.stringify(winner.conflicts)}`);
  const committed = await store.commit({ action: 'accept', candidateId: winner.candidateId, expectedHead: baseRevision });
  const reopened = await StudioStore.open(dir, OPTS);
  assert.equal((await reopened.state()).head, committed.revision);
  const out = join(dir, 'export', committed.revision);
  const exported = await exportWorkspace(dir, out, OPTS);
  const manifest = JSON.parse(readFileSync(join(out, exported.files.manifest), 'utf8'));
  assert.deepEqual(validateManifest(manifest), []);
  return { explored, winner, committed, exported };
}

test('R3：geometry.set / material.set / ramp.set 六链路——edit 与 explore 均可提交、重开、导出', async () => {
  const { dir, store } = await makeWorkspace(TERMINAL, 'r3-prop');
  // edit 链路
  const g = await assertEditChain(dir, store, { baseRevision: 'r1', operation: { id: 'geometry.set', target: 'terminal.shell', params: { w: 28 } } });
  assert.equal(g.committed.revision, 'r2');
  const m = await assertEditChain(dir, store, { baseRevision: 'r2', operation: { id: 'material.set', target: 'terminal.shell', material: 'flat' } });
  assert.equal(m.committed.revision, 'r3');
  const r = await assertEditChain(dir, store, { baseRevision: 'r3', operation: { id: 'ramp.set', target: 'terminal.shell', ramp: 'amber' } });
  assert.equal(r.committed.revision, 'r4');
  // explore 链路（审查复现：material.set / ramp.set 探索候选曾不能提交）
  const em = await assertExploreChain(dir, store, { baseRevision: 'r4', spec: { id: 'material.set', target: 'terminal.shell', field: 'material', values: ['bevel-metal', 'flat'] }, pick: (c) => c.value === 'bevel-metal' });
  assert.equal(em.committed.revision, 'r5');
  const er = await assertExploreChain(dir, store, { baseRevision: 'r5', spec: { id: 'ramp.set', target: 'terminal.shell', field: 'ramp', values: ['steel', 'amber'] }, pick: (c) => c.value === 'steel' });
  assert.equal(er.committed.revision, 'r6');
  const eg = await assertExploreChain(dir, store, { baseRevision: 'r6', spec: { id: 'geometry.set', target: 'terminal.shell', field: 'w', values: [24, 26] }, pick: (c) => c.value === 24 });
  assert.equal(eg.committed.revision, 'r7');
  // 落盘内容核对：最终修订的几何/材质/色阶确为所选项
  const finalDoc = (await store._getCompiled('r7')).document;
  const shell = finalDoc.nodes.find((n) => n.id === 'terminal.shell');
  assert.equal(shell.w, 24);
  assert.equal(shell.material, 'bevel-metal');
  assert.equal(shell.ramp, 'steel');
});

test('R3：v2 局部色阶覆盖对象——edit 与 explore 全链路', async () => {
  const { dir, store } = await makeWorkspace(WRENCH, 'r3-v2');
  const overrideA = { shades: ['#101018', '#303048', '#586078', '#98a2c0'] };
  const overrideB = { shades: ['#180808', '#481818', '#783030', '#c05858'] };
  const e = await assertEditChain(dir, store, { baseRevision: 'r1', operation: { id: 'ramp.set', target: 'wrench.jaw', ramp: overrideA } });
  assert.equal(e.committed.revision, 'r2');
  const x = await assertExploreChain(dir, store, { baseRevision: 'r2', spec: { id: 'ramp.set', target: 'wrench.jaw', field: 'ramp', values: [overrideA, overrideB] }, pick: (c) => typeof c.value === 'object' && c.value.shades?.[0] === '#180808' });
  assert.equal(x.committed.revision, 'r3');
  const jaw = (await store._getCompiled('r3')).document.nodes.find((n) => n.id === 'wrench.jaw');
  assert.deepEqual(jaw.ramp, overrideB, '局部覆盖对象必须随提交落盘');
  const style = (await store._getCompiled('r3')).document.style;
  assert.deepEqual(Object.keys(style.ramps), ['steel', 'amber'], '局部覆盖不得污染共享风格');
});

test('R3：palette.set / rig.set / art.set 角色链路——edit 与 explore 均可提交、重开、导出', async () => {
  const { dir, store } = await makeWorkspace(RUSTCLAW, 'r3-char');
  const p = await assertEditChain(dir, store, { baseRevision: 'r1', operation: { id: 'palette.set', target: 'V', value: '#ffd23d' } });
  assert.equal(p.committed.revision, 'r2');
  assert.equal(p.exported.manifest.frames, 13, '角色导出 13 帧');
  const g = await assertEditChain(dir, store, { baseRevision: 'r2', operation: { id: 'rig.set', target: 'thigh', value: 6 } });
  assert.equal(g.committed.revision, 'r3');
  const newHead = rustclawHeadSwap(load(RUSTCLAW));
  const a = await assertEditChain(dir, store, { baseRevision: 'r3', operation: { id: 'art.set', target: 'head', value: newHead } });
  assert.equal(a.committed.revision, 'r4');
  // 角色 explore（无 field）：候选记录为标准 { id, target, value }，可提交
  const er = await assertExploreChain(dir, store, { baseRevision: 'r4', spec: { id: 'rig.set', target: 'thigh', values: [4, 5] }, pick: (c) => c.value === 5 });
  assert.equal(er.committed.revision, 'r5');
  const ep = await assertExploreChain(dir, store, { baseRevision: 'r5', spec: { id: 'palette.set', target: 'V', values: ['#39d0c4', '#ffd23d'] }, pick: (c) => c.value === '#39d0c4' });
  assert.equal(ep.committed.revision, 'r6');
  const doc = (await store._getCompiled('r6')).document;
  assert.equal(doc.rig.thigh, 5);
  assert.equal(doc.palette.V, '#39d0c4');
  assert.deepEqual(doc.art.head, newHead);
});

function rustclawHeadSwap(doc) {
  return doc.art.head.map((row, i) => (i === 3 ? 'AAEEVVVk' : row)); // 同尺寸目镜带调整（合法、有像素变化）
}

/* ---------- R1：历史与并发 ---------- */

test('R1：两个预先打开的实例先后提交——旧实例 STALE_REVISION，不得覆盖已提交历史', async () => {
  const { dir } = await makeWorkspace(TERMINAL, 'r1');
  const A = await StudioStore.open(dir, OPTS);
  const B = await StudioStore.open(dir, OPTS);
  const ea = await A.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'terminal.shell', params: { w: 28 } } });
  const eb = await B.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'terminal.shell', params: { w: 24 } } });
  const ca = await A.commit({ action: 'accept', candidateId: ea.candidateId, expectedHead: 'r1' });
  assert.equal(ca.revision, 'r2');
  await assert.rejects(() => B.commit({ action: 'accept', candidateId: eb.candidateId, expectedHead: 'r1' }), (e) => e.code === 'STALE_REVISION');
  const r2 = JSON.parse(readFileSync(join(dir, 'revisions', 'r2.json'), 'utf8'));
  assert.equal(r2.doc.nodes.find((n) => n.id === 'terminal.shell').w, 28, '已提交的 r2 不得被旧实例改写');
  assert.equal((await B.state()).head, 'r2', 'state() 每次重读磁盘，长生命周期实例也看到新 head');
  // B 看到新 head 后可正常工作：基于 r2 重新编辑提交
  const eb2 = await B.edit({ baseRevision: 'r2', operation: { id: 'geometry.set', target: 'terminal.shell', params: { w: 24 } } });
  const cb2 = await B.commit({ action: 'accept', candidateId: eb2.candidateId, expectedHead: 'r2' });
  assert.equal(cb2.revision, 'r3');
  assert.equal((await A.state()).head, 'r3');
});

test('R1：同名修订文件内容不同——REVISION_CONFLICT 拒绝，head 不动、原文件不覆盖', async () => {
  const { dir, store } = await makeWorkspace(TERMINAL, 'r1-conflict');
  const edit = await store.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'terminal.shell', params: { w: 28 } } });
  const foreign = JSON.stringify({ revision: 'r2', parent: 'r1', doc: { note: '外来内容' }, hashes: {}, source: { kind: 'other' }, toolVersion: 'x' }, null, 2) + '\n';
  writeFileSync(join(dir, 'revisions', 'r2.json'), foreign);
  await assert.rejects(() => store.commit({ action: 'accept', candidateId: edit.candidateId, expectedHead: 'r1' }), (e) => e.code === 'REVISION_CONFLICT');
  assert.equal(JSON.parse(readFileSync(join(dir, 'head.json'), 'utf8')).head, 'r1', '冲突不得移动 head');
  assert.equal(readFileSync(join(dir, 'revisions', 'r2.json'), 'utf8'), foreign, '外来文件内容不得被改写');
});

/* ---------- R6：提交中途失败的可恢复事务 ---------- */

test('R6：效果已持久化、done 台账写入失败——重开后同 requestId 恢复原提交结果', async () => {
  const { dir, store } = await makeWorkspace(TERMINAL, 'r6-done');
  const edit = await store.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'terminal.shell', params: { w: 28 } } });
  const original = store._writeLedger.bind(store);
  store._writeLedger = async (requestId, record) => {
    if (record.status === 'done') throw new Error('injected-crash-after-effects');
    return original(requestId, record);
  };
  await assert.rejects(() => store.commit({ action: 'accept', candidateId: edit.candidateId, expectedHead: 'r1', requestId: 'r6-req-a' }), (e) => e.message === 'injected-crash-after-effects');
  assert.equal(JSON.parse(readFileSync(join(dir, 'head.json'), 'utf8')).head, 'r2', '崩溃窗口：效果已落盘');
  const reopened = await StudioStore.open(dir, OPTS);
  const recovered = await reopened.commit({ action: 'accept', candidateId: edit.candidateId, expectedHead: 'r1', requestId: 'r6-req-a' });
  assert.equal(recovered.revision, 'r2', '必须恢复原提交结果而不是报 STALE_REVISION');
  assert.equal(recovered.head, 'r2');
  assert.equal(recovered.parent, 'r1');
  assert.equal(recovered.hashes.renderHash, edit.hashes.renderHash);
  assert.equal(recovered.unchanged, false);
  assert.equal(recovered.idempotentReplay, true);
  const state = await reopened.state();
  assert.equal(state.head, 'r2', '恢复不得产生 r3');
  assert.deepEqual(state.revisions, ['r1', 'r2']);
  assert.ok(!state.pendingRequests.includes('r6-req-a'), '恢复后台账补写为 done');
  const again = await reopened.commit({ action: 'accept', candidateId: edit.candidateId, expectedHead: 'r1', requestId: 'r6-req-a' });
  assert.equal(again.idempotentReplay, true, '补写 done 后的重试直接命中台账');
  assert.equal(again.revision, 'r2');
});

test('R6：修订写入后、head 写入前失败——重试幂等前滚，孤儿修订逐字节接管', async () => {
  const { dir, store } = await makeWorkspace(TERMINAL, 'r6-head');
  const edit = await store.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'terminal.shell', params: { w: 28 } } });
  store._writeHead = async () => {
    throw new Error('injected-crash-before-head');
  };
  await assert.rejects(() => store.commit({ action: 'accept', candidateId: edit.candidateId, expectedHead: 'r1', requestId: 'r6-req-b' }), (e) => e.message === 'injected-crash-before-head');
  assert.equal(JSON.parse(readFileSync(join(dir, 'head.json'), 'utf8')).head, 'r1', 'head 未移动');
  assert.ok(existsSync(join(dir, 'revisions', 'r2.json')), '崩溃留下孤儿修订文件');
  assert.ok(!(await store.state()).pendingRequests.includes('r6-req-b'), 'fn 失败的 pending 被清理，不按成功处理');
  const reopened = await StudioStore.open(dir, OPTS);
  const retried = await reopened.commit({ action: 'accept', candidateId: edit.candidateId, expectedHead: 'r1', requestId: 'r6-req-b' });
  assert.equal(retried.revision, 'r2');
  assert.equal((await reopened.state()).head, 'r2');
  const r2 = JSON.parse(readFileSync(join(dir, 'revisions', 'r2.json'), 'utf8'));
  assert.equal(r2.doc.nodes.find((n) => n.id === 'terminal.shell').w, 28);
  assert.deepEqual((await reopened.state()).revisions, ['r1', 'r2'], '前滚不产生重复修订');
});

test('R6：pending 台账写入即失败——无任何效果，重试按新请求正常执行', async () => {
  const { dir, store } = await makeWorkspace(TERMINAL, 'r6-pending');
  const edit = await store.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'terminal.shell', params: { w: 28 } } });
  store._writeLedger = async () => {
    throw new Error('injected-crash-at-pending');
  };
  await assert.rejects(() => store.commit({ action: 'accept', candidateId: edit.candidateId, expectedHead: 'r1', requestId: 'r6-req-c' }), (e) => e.message === 'injected-crash-at-pending');
  assert.equal(JSON.parse(readFileSync(join(dir, 'head.json'), 'utf8')).head, 'r1');
  assert.deepEqual((await store.state()).revisions, ['r1'], 'pending 都未写入时不得有任何效果');
  const reopened = await StudioStore.open(dir, OPTS);
  const retried = await reopened.commit({ action: 'accept', candidateId: edit.candidateId, expectedHead: 'r1', requestId: 'r6-req-c' });
  assert.equal(retried.revision, 'r2');
  assert.equal((await reopened.state()).head, 'r2');
});

test('R6：恢复冲突——既定槽位被不同内容占据时 STALE_REVISION，不覆盖、不伪造恢复', async () => {
  const { dir, store } = await makeWorkspace(TERMINAL, 'r6-conflict');
  const edit = await store.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'terminal.shell', params: { w: 28 } } });
  const original = store._writeLedger.bind(store);
  store._writeLedger = async (requestId, record) => {
    if (record.status === 'done') throw new Error('injected-crash-after-effects');
    return original(requestId, record);
  };
  await assert.rejects(() => store.commit({ action: 'accept', candidateId: edit.candidateId, expectedHead: 'r1', requestId: 'r6-req-d' }), (e) => e.message === 'injected-crash-after-effects');
  // 篡改 r2 为其他内容（模拟槽位被他人提交占据）
  const r2path = join(dir, 'revisions', 'r2.json');
  const r2 = JSON.parse(readFileSync(r2path, 'utf8'));
  r2.doc.nodes.find((n) => n.id === 'terminal.shell').w = 24;
  writeFileSync(r2path, JSON.stringify(r2, null, 2) + '\n');
  const reopened = await StudioStore.open(dir, OPTS);
  await assert.rejects(() => reopened.commit({ action: 'accept', candidateId: edit.candidateId, expectedHead: 'r1', requestId: 'r6-req-d' }), (e) => e.code === 'STALE_REVISION');
  assert.equal(JSON.parse(readFileSync(r2path, 'utf8')).doc.nodes.find((n) => n.id === 'terminal.shell').w, 24, '被占据的槽位内容不得被恢复流程改写');
});

test('R6：edit 的 done 台账失败——重试幂等前滚返回同一候选；restore 崩溃恢复同合同', async () => {
  const { dir, store } = await makeWorkspace(TERMINAL, 'r6-edit');
  const original = store._writeLedger.bind(store);
  store._writeLedger = async (requestId, record) => {
    if (record.status === 'done') throw new Error('injected-crash-edit-ledger');
    return original(requestId, record);
  };
  await assert.rejects(() => store.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'terminal.shell', params: { w: 28 } }, requestId: 'r6-req-e' }), (e) => e.message === 'injected-crash-edit-ledger');
  const reopened = await StudioStore.open(dir, OPTS);
  const retried = await reopened.edit({ baseRevision: 'r1', operation: { id: 'geometry.set', target: 'terminal.shell', params: { w: 28 } }, requestId: 'r6-req-e' });
  assert.equal(retried.status, 'OK');
  assert.ok(retried.candidateId.startsWith('c-'), '前滚返回真实候选');
  assert.equal((await reopened.state()).head, 'r1', 'edit 恢复不得移动 head');
  // restore 的崩溃恢复：先提交 r2，再在 restore 的 done 写入处注入失败
  const committed = await reopened.commit({ action: 'accept', candidateId: retried.candidateId, expectedHead: 'r1' });
  assert.equal(committed.revision, 'r2');
  const original2 = reopened._writeLedger.bind(reopened);
  reopened._writeLedger = async (requestId, record) => {
    if (record.status === 'done') throw new Error('injected-crash-restore-ledger');
    return original2(requestId, record);
  };
  await assert.rejects(() => reopened.commit({ action: 'restore', targetRevision: 'r1', expectedHead: 'r2', requestId: 'r6-req-f' }), (e) => e.message === 'injected-crash-restore-ledger');
  const reopened2 = await StudioStore.open(dir, OPTS);
  const recovered = await reopened2.commit({ action: 'restore', targetRevision: 'r1', expectedHead: 'r2', requestId: 'r6-req-f' });
  assert.equal(recovered.revision, 'r3', 'restore 崩溃后恢复原结果');
  assert.equal(recovered.restoredFrom, 'r1');
  assert.equal(recovered.idempotentReplay, true);
  assert.equal((await reopened2.state()).head, 'r3');
});
