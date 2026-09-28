/**
 * tests/integration/studio-review.test.js — 审查修复轮（R1–R8）集成回归
 * 依据 docs/PGA_STUDIO_REVIEW.md §4/§8：复现场景转为正式测试，断言正确行为。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
