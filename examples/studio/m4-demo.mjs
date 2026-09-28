#!/usr/bin/env node
/**
 * examples/studio/m4-demo.mjs — PGA Studio M4 演示（风格与构造）
 *
 *   node examples/studio/m4-demo.mjs --out work/studio-m4
 *
 * 流程：创建 pga-studio/2 非箱体式资产（扳手：poly 手柄/钳口 + disc 螺栓，shade-diag 体积概括）
 * → 验证非矩形剪影 → 对螺栓做节点级色阶局部覆盖（共享色阶与其他节点不受影响）
 * → 探索手柄顶点平移（poly geometry.set，螺栓像素保护生效）→ 接受 → 导出。
 */
import { readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StudioStore } from '../../src/adapters/studio-store.js';
import { exportWorkspace } from '../../src/adapters/studio-files.js';
import { validateManifest } from '../../src/export/manifest.js';
import { stableStringify } from '../../src/studio/document.js';

const here = dirname(fileURLToPath(import.meta.url));
const DOC = join(here, 'wrench.studio.json');
const PKG = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const OPTS = { generator: `procedural-game-assets@${PKG.version}`, toolVersion: `${PKG.version}/pga-studio-1`, displayScale: 8, background: '#202028' };

const args = process.argv.slice(2);
let out = 'work/studio-m4';
for (let i = 0; i < args.length; i++) if (args[i] === '--out' && args[i + 1]) out = args[++i];
const outDir = resolve(out);
const step = (msg) => console.error(`▸ ${msg}`);
const die = (msg) => {
  console.error(`✗ demo 失败：${msg}`);
  process.exit(1);
};
const summary = { ok: false, workspace: outDir, steps: {} };

try {
  const entries = await readdir(outDir);
  if (entries.includes('.pga.json')) await rm(outDir, { recursive: true });
  else if (entries.length > 0) die(`${outDir} 非空且不是本工具生成的目录`);
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}

step('1. 创建 pga-studio/2 扳手工作区（poly/disc/shade-diag）');
const doc = JSON.parse(await readFile(DOC, 'utf8'));
const { store } = await StudioStore.create(outDir, doc, OPTS);
const r1 = await store._getCompiled('r1');
if (r1.document.schemaVersion !== 'pga-studio/2') die('样例应为 pga-studio/2');
for (const n of r1.sceneMap.nodes) {
  const bboxArea = n.frameRect.w * n.frameRect.h;
  if (n.kind !== 'panel' && n.kind !== 'screen' && n.opaquePixels >= bboxArea) die(`${n.id} 应是非矩形剪影（opaque ${n.opaquePixels} < bbox ${bboxArea}）`);
}
summary.steps.create = {
  schemaVersion: r1.document.schemaVersion,
  styleMeta: r1.document.style.meta,
  nodes: r1.sceneMap.nodes.map((n) => ({ id: n.id, kind: n.kind, opaquePixels: n.opaquePixels, bbox: n.frameRect })),
  hashes: r1.hashes,
};
console.error(`  非矩形剪影成立：${summary.steps.create.nodes.map((n) => `${n.id}=${n.opaquePixels}px`).join(' ')}`);

step('2. 钳口色阶局部覆盖（写时复制：共享色阶与其他节点不受影响）');
const localShades = ['#1a1d24', '#333945', '#4d5566', '#7c8698'];
const overrideEdit = await store.edit({ baseRevision: 'r1', operation: { id: 'ramp.set', target: 'wrench.jaw', ramp: { shades: localShades } }, requestId: 'm4-jaw-override' });
if (overrideEdit.status !== 'OK') die(`局部覆盖候选应 OK：${JSON.stringify(overrideEdit.conflicts)}`);
const accepted2 = await store.commit({ action: 'accept', candidateId: overrideEdit.candidateId, expectedHead: 'r1', requestId: 'm4-accept-override' });
const r2 = await store._getCompiled(accepted2.revision);
if (stableStringify(r2.document.style) !== stableStringify(r1.document.style)) die('局部覆盖污染了共享风格');
const r2Handle = r2.document.nodes.find((n) => n.id === 'wrench.handle');
if (r2Handle.ramp !== 'steel') die('局部覆盖影响了其他节点的共享引用');
const r2Jaw = r2.document.nodes.find((n) => n.id === 'wrench.jaw');
if (typeof r2Jaw.ramp !== 'object' || r2Jaw.ramp.shades[2] !== '#4d5566') die('钳口应持有局部覆盖色阶');
if (r2.document.nodes.find((n) => n.id === 'wrench.bolt').ramp !== 'amber') die('螺栓共享引用不应变化');
summary.steps.localOverride = {
  revision: accepted2.revision,
  jawRamp: r2Jaw.ramp,
  sharedStyleUntouched: true,
  renderHash: r2.hashes.renderHash,
};

step('3. 探索钳口顶点平移（poly geometry.set；螺栓保护不命中）');
const jawVertices = r2.document.nodes.find((n) => n.id === 'wrench.jaw').vertices;
const shifted = jawVertices.map(([x, y]) => [x, y + 1]);
const explored = await store.explore({ baseRevision: accepted2.revision, spec: { id: 'geometry.set', target: 'wrench.jaw', field: 'vertices', values: [jawVertices, shifted] }, requestId: 'm4-explore-jaw' });
const [cBase, cShift] = explored.candidates;
if (cBase.status !== 'UNCHANGED') die(`原顶点候选应 UNCHANGED，实际 ${cBase.status}`);
if (cShift.status !== 'OK' || cShift.diff.outside !== 0) die(`平移候选应 OK 且区域外为零：${cShift.status} outside=${cShift.diff.outside}`);
summary.steps.explore = explored.candidates.map((c) => ({ candidateId: c.candidateId, status: c.status, diffPixels: c.diff.pixels, outside: c.diff.outside, previews: c.previews }));
console.error(`  ${summary.steps.explore.map((c) => c.status).join(' / ')}`);

step('3b. 保护捕获证据：手柄平移会透过螺栓 bbox 透明角改变其区域像素 → 拒绝');
const handleVertices = r2.document.nodes.find((n) => n.id === 'wrench.handle').vertices;
const caught = await store.edit({ baseRevision: accepted2.revision, operation: { id: 'geometry.set', target: 'wrench.handle', params: { vertices: handleVertices.map(([x, y]) => [x + 1, y]) } }, requestId: 'm4-caught-handle' });
if (caught.status !== 'REJECTED' || !caught.conflicts.some((c) => c.target === 'wrench.bolt')) die(`手柄平移应被螺栓保护捕获：${caught.status} ${JSON.stringify(caught.conflicts)}`);
summary.steps.protectionCatch = { status: caught.status, code: caught.code, conflicts: caught.conflicts.map((c) => c.message), previews: caught.previews };
console.error(`  ${summary.steps.protectionCatch.conflicts[0]}`);

step('4. 接受平移后的钳口 → r3，导出并校验 manifest');
const accepted3 = await store.commit({ action: 'accept', candidateId: cShift.candidateId, expectedHead: accepted2.revision, requestId: 'm4-accept-jaw' });
const exported = await exportWorkspace(outDir, join(outDir, 'export'), OPTS);
const manifest = JSON.parse(await readFile(join(outDir, 'export', exported.files.manifest), 'utf8'));
const manifestErrors = validateManifest(manifest);
if (manifestErrors.length > 0) die(`manifest 校验失败：${manifestErrors.join('；')}`);
summary.steps.acceptAndExport = { revision: accepted3.revision, exportRevision: exported.revision, files: exported.files };

summary.ok = true;
summary.finalState = await store.state();
await writeFile(join(outDir, 'demo-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
console.error('✓ M4 demo 通过');
