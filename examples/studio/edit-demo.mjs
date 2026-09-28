#!/usr/bin/env node
/**
 * examples/studio/edit-demo.mjs — PGA Studio M2 演示（必做流程，留可复查证据）
 *
 *   node examples/studio/edit-demo.mjs --out work/studio-m2
 *
 * 流程：创建终端 → 查看节点和原图 → 只探索机箱宽度的三个版本（24/26/28）
 * → 检查屏幕像素与锚点保护 → 接受 w=28 → 尝试修改受保护的屏幕（明确拒绝）
 * → 恢复初始版本 → 确认恢复后像素与元数据哈希一致 → 导出 → 幂等重放验证。
 * 每一步的预览 PNG 由 store 写入 <ws>/previews/，摘要写入 demo-summary.json。
 */
import { readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StudioStore, StudioStoreError } from '../../src/adapters/studio-store.js';
import { inspectWorkspace, exportWorkspace } from '../../src/adapters/studio-files.js';
import { validateManifest } from '../../src/export/manifest.js';

const here = dirname(fileURLToPath(import.meta.url));
const DOC = join(here, 'terminal.studio.json');
const PKG = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const OPTS = { generator: `procedural-game-assets@${PKG.version}`, toolVersion: `${PKG.version}/pga-studio-1`, displayScale: 8, background: '#202028' };

const args = process.argv.slice(2);
let out = 'work/studio-m2';
for (let i = 0; i < args.length; i++) if (args[i] === '--out' && args[i + 1]) out = args[++i];
const outDir = resolve(out);
const step = (msg) => console.error(`▸ ${msg}`);
const die = (msg) => {
  console.error(`✗ demo 失败：${msg}`);
  process.exit(1);
};
const summary = { ok: false, workspace: outDir, steps: {} };

// 输出目录若为本工具生成（含 .pga.json 标记）则先清理，保证可重复运行；否则拒绝覆盖
try {
  const entries = await readdir(outDir);
  if (entries.includes('.pga.json')) await rm(outDir, { recursive: true });
  else if (entries.length > 0) die(`${outDir} 非空且不是本工具生成的目录`);
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}

step('1. 创建终端工作区（r1）');
const doc = JSON.parse(await readFile(DOC, 'utf8'));
const { store } = await StudioStore.create(outDir, doc, OPTS);
const r1 = await store._getCompiled('r1');
summary.steps.create = { head: 'r1', documentHash: r1.hashes.documentHash, renderHash: r1.hashes.renderHash, nodes: r1.sceneMap.nodes.map((n) => n.id) };
console.error(`  节点：${summary.steps.create.nodes.join(', ')}；预览 previews/r1-base/`);

step('2. inspect head（节点定位与能力）');
const inspected = await inspectWorkspace(outDir, OPTS);
if (inspected.nodes.length !== 4) die('inspect 节点数 ≠ 4');
if (!inspected.capabilities.nodes['terminal.shell']) die('inspect 缺少 terminal.shell 能力声明');
summary.steps.inspect = { head: inspected.head, shellWidthRange: inspected.capabilities.nodes['terminal.shell'].operations['geometry.set'].fields.w };

step('3. 同基准探索机箱宽度 w ∈ {24, 26, 28}');
const explored = await store.explore({ baseRevision: 'r1', spec: { id: 'geometry.set', target: 'terminal.shell', field: 'w', values: [24, 26, 28] }, requestId: 'demo-explore-shell-w' });
const byValue = new Map(explored.candidates.map((c) => [c.value, c]));
if (byValue.get(24).status !== 'OK' || byValue.get(28).status !== 'OK') die('w=24/28 候选应为 OK');
if (byValue.get(26).status !== 'UNCHANGED' || byValue.get(26).duplicateOf !== 'base') die('w=26 应标注 UNCHANGED 且去重到 base');
for (const c of explored.candidates) {
  if (c.status === 'OK' && c.diff.outside !== 0) die(`候选 w=${c.value} 存在允许区域外变化`);
}
summary.steps.explore = explored.candidates.map((c) => ({ value: c.value, candidateId: c.candidateId, status: c.status, duplicateOf: c.duplicateOf, diffPixels: c.diff.pixels, outside: c.diff.outside, previews: c.previews }));
console.error(`  ${summary.steps.explore.map((c) => `w=${c.value}:${c.status}${c.duplicateOf ? `(${c.duplicateOf})` : ''}`).join(' ')}`);

step('4. 屏幕像素与锚点保护在全部候选中生效');
const sampleConstraints = r1.document.constraints;
for (const c of explored.candidates) {
  if (c.status === 'ERROR') continue;
  const record = JSON.parse(await readFile(join(outDir, 'candidates', `${c.candidateId}.json`), 'utf8'));
  if (!record.checks.protections.pixels.includes('terminal.screen')) die('候选缺少屏幕像素保护检查');
  if (!record.checks.protections.metadata.includes('anchor')) die('候选缺少锚点元数据保护检查');
}
summary.steps.protections = { declared: sampleConstraints, verifiedOnCandidates: explored.candidates.filter((c) => c.candidateId).length };

step('5. 接受 w=28 → head r2');
const accepted = await store.commit({ action: 'accept', candidateId: byValue.get(28).candidateId, expectedHead: 'r1', requestId: 'demo-accept-w28' });
if (accepted.revision !== 'r2') die(`接受后修订应为 r2，实际 ${accepted.revision}`);
summary.steps.accept = { revision: accepted.revision, renderHash: accepted.hashes.renderHash };

step('6. 拒绝证据：修改受像素保护的屏幕 → CONSTRAINT_CONFLICT，提交再被拒，head 不受污染');
const rejected = await store.edit({ baseRevision: 'r2', operation: { id: 'geometry.set', target: 'terminal.screen', params: { w: 10 } }, requestId: 'demo-bad-screen' });
if (rejected.status !== 'REJECTED' || rejected.code !== 'CONSTRAINT_CONFLICT') die(`受保护修改应 CONSTRAINT_CONFLICT，实际 ${rejected.status}/${rejected.code}`);
let rejectedCommit = null;
try {
  await store.commit({ action: 'accept', candidateId: rejected.candidateId, expectedHead: 'r2' });
  die('被拒绝的候选不应可提交');
} catch (e) {
  if (!(e instanceof StudioStoreError) || e.code !== 'CANDIDATE_INVALID') throw e;
  rejectedCommit = { code: e.code, message: e.message };
}
const headAfterBad = (await store.state()).head;
if (headAfterBad !== 'r2') die(`错误候选污染了 head：${headAfterBad}`);
summary.steps.reject = { status: rejected.status, code: rejected.code, conflicts: rejected.conflicts.map((c) => c.message), commitAttempt: rejectedCommit, head: headAfterBad };

step('7. 恢复 r1 → 新修订 r3，像素与元数据哈希精确一致');
const restored = await store.commit({ action: 'restore', targetRevision: 'r1', expectedHead: 'r2', requestId: 'demo-restore-r1' });
if (restored.revision !== 'r3') die(`恢复应产生 r3，实际 ${restored.revision}`);
if (restored.hashes.renderHash !== r1.hashes.renderHash) die('恢复后 renderHash 与 r1 不一致');
if (restored.hashes.documentHash !== r1.hashes.documentHash) die('恢复后 documentHash 与 r1 不一致');
summary.steps.restore = { revision: restored.revision, renderHash: restored.hashes.renderHash, matchesR1: true };

step('8. 导出 head（r3）并校验 manifest');
const exported = await exportWorkspace(outDir, join(outDir, 'export'), OPTS);
const manifest = JSON.parse(await readFile(join(outDir, 'export', exported.files.manifest), 'utf8'));
const manifestErrors = validateManifest(manifest);
if (manifestErrors.length > 0) die(`manifest 校验失败：${manifestErrors.join('；')}`);
summary.steps.export = { revision: exported.revision, files: exported.files };

step('9. 幂等重放：同一 accept 请求重试 → 同一结果，head 不变');
const replay = await store.commit({ action: 'accept', candidateId: byValue.get(28).candidateId, expectedHead: 'r1', requestId: 'demo-accept-w28' });
if (!replay.idempotentReplay || replay.revision !== 'r2') die('幂等重放未命中台账');
if ((await store.state()).head !== 'r3') die('幂等重放不应移动 head');
summary.steps.idempotency = { replayed: true, head: 'r3' };

summary.ok = true;
summary.finalState = await store.state();
await writeFile(join(outDir, 'demo-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
console.error('✓ M2 demo 通过');
