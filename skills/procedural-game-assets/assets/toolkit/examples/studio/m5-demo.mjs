#!/usr/bin/env node
/**
 * examples/studio/m5-demo.mjs — PGA Studio M5 演示（角色跨帧一致修改）
 *
 *   node examples/studio/m5-demo.mjs --out work/studio-m5
 *
 * 流程：创建锈爪角色（13 帧 / 4 剪辑，与既有 bakeHumanoid 逐帧等价）
 * → 目镜改色（palette.set：全部所需帧一致传播，报告受影响帧/剪辑/附件点）
 * → 探索腿长（rig.set thigh：solvePose 重解，接地不变量保持）
 * → 枪管加长（rig.set guns.fwd.len：仅 fwd 瞄准帧受影响，枪口附件点一致联动 +2）
 * → 恢复初始版本（哈希精确一致）→ 导出（多帧 manifest + 播放材料）。
 */
import { readFile, rm, writeFile, readdir, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StudioStore } from '../../src/adapters/studio-store.js';
import { exportWorkspace } from '../../src/adapters/studio-files.js';
import { validateManifest } from '../../src/export/manifest.js';

const here = dirname(fileURLToPath(import.meta.url));
const DOC = join(here, 'rustclaw.studio.json');
const PKG = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const OPTS = { generator: `procedural-game-assets@${PKG.version}`, toolVersion: `${PKG.version}/pga-studio-1`, displayScale: 4, background: '#202028' };

const args = process.argv.slice(2);
let out = 'work/studio-m5';
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

step('1. 创建锈爪角色工作区（13 帧 / 4 剪辑 / dead 姿态 notCovered）');
const doc = JSON.parse(await readFile(DOC, 'utf8'));
const { store } = await StudioStore.create(outDir, doc, OPTS);
const r1 = await store._getCompiled('r1');
if (r1.kind !== 'character' || r1.asset.frames.length !== 13) die('角色编译帧数不符');
if (!r1.diagnostics.notCoveredFrames.includes('dead_ground')) die('dead_ground 应标记为 notCovered');
summary.steps.create = { frames: r1.frames.map((f) => f.id), clips: Object.keys(r1.asset.clips), notCovered: r1.diagnostics.notCoveredFrames, renderHash: r1.hashes.renderHash };
console.error(`  renderHash=${r1.hashes.renderHash}；notCovered=${r1.diagnostics.notCoveredFrames}`);

step('2. 目镜改色（palette.set V）：全部所需帧一致传播');
const colorEdit = await store.edit({ baseRevision: 'r1', operation: { id: 'palette.set', target: 'V', value: '#ffd23d' }, requestId: 'm5-visor-color' });
if (colorEdit.status !== 'OK') die(`改色候选应 OK：${JSON.stringify(colorEdit.conflicts)}`);
const visorChecks = colorEdit.checks;
const rigAffected = visorChecks.affectedFrames.filter((f) => f.id !== 'dead_ground');
if (rigAffected.length !== 12) die(`目镜改色应影响全部 12 个 rig 帧，实际 ${rigAffected.length}`);
if (!visorChecks.notCoveredChanges.some((f) => f.id === 'dead_ground')) die('dead 姿态应列为 notCovered 变化');
if (visorChecks.affectedClips.length !== 4) die(`应影响全部 4 个剪辑，实际 ${visorChecks.affectedClips.length}`);
for (const f of visorChecks.affectedFrames) {
  if (f.anchorDelta.dx !== 0 || f.anchorDelta.dy !== 0) die(`帧 '${f.id}' 锚点移动（身份/接地破坏）`);
  if (f.groundingChanged) die(`帧 '${f.id}' 接地破坏`);
}
const acc2 = await store.commit({ action: 'accept', candidateId: colorEdit.candidateId, expectedHead: 'r1', requestId: 'm5-accept-color' });
summary.steps.paletteSet = {
  revision: acc2.revision,
  affectedFrames: rigAffected.length,
  affectedClips: visorChecks.affectedClips.map((c) => c.name),
  notCoveredChanges: visorChecks.notCoveredChanges.map((f) => f.id),
  groundingKept: true,
};
console.error(`  ${rigAffected.length} rig 帧 + ${visorChecks.notCoveredChanges.length} notCovered 帧变化；剪辑 ${summary.steps.paletteSet.affectedClips.join('/')}`);

step('3. 探索腿长（rig.set thigh ∈ {3,4,5}；solvePose 重解且接地保持）');
const explored = await store.explore({ baseRevision: 'r2', spec: { id: 'rig.set', target: 'thigh', values: [3, 4, 5] }, requestId: 'm5-explore-thigh' });
const [t3, t4, t5] = explored.candidates;
if (t4.status !== 'UNCHANGED' || t4.duplicateOf !== 'base') die('thigh=4 应为 UNCHANGED');
if (t3.status !== 'OK' || t5.status !== 'OK') die(`thigh 候选应 OK：${t3.status}/${t5.status}`);
const t5Checks = t5.checks;
if (t5Checks.affectedFrames.length !== 12) die(`腿长应影响全部 12 个 rig 帧，实际 ${t5Checks.affectedFrames.length}`);
for (const f of t5Checks.affectedFrames) if (f.groundingChanged) die(`thigh 改变后帧 '${f.id}' 接地破坏（solvePose 应自动保持贴地）`);
const acc3 = await store.commit({ action: 'accept', candidateId: t5.candidateId, expectedHead: 'r2', requestId: 'm5-accept-thigh' });
summary.steps.rigSetThigh = { revision: acc3.revision, candidates: explored.candidates.map((c) => ({ value: c.value, status: c.status })), affectedFrames: t5Checks.affectedFrames.length, groundingKept: true };
console.error(`  thigh=3/4/5 → ${explored.candidates.map((c) => c.status).join('/')}`);

step('4. 枪管加长（rig.set guns.fwd.len 7→9）：仅 fwd 瞄准帧受影响，枪口一致联动');
const gunEdit = await store.edit({ baseRevision: 'r3', operation: { id: 'rig.set', target: 'guns.fwd.len', value: 9 }, requestId: 'm5-gun-len' });
if (gunEdit.status !== 'OK') die(`枪管候选应 OK：${JSON.stringify(gunEdit.conflicts)}`);
const gunChecks = gunEdit.checks;
const fwdIds = gunChecks.affectedFrames.map((f) => f.id).sort();
const expectedFwd = ['fall_fwd', 'run0_fwd', 'run1_fwd', 'run2_fwd', 'run3_fwd', 'run4_fwd', 'run5_fwd', 'stand_fwd'].sort();
if (JSON.stringify(fwdIds) !== JSON.stringify(expectedFwd)) die(`fwd 帧集合不符：${fwdIds.join(',')}`);
for (const f of gunChecks.affectedFrames) {
  const d = f.attachmentDeltas.muzzle;
  if (!d || Math.abs(d.dx - 2) > 1 || Math.abs(d.dy) > 1) die(`帧 '${f.id}' 枪口附件点联动异常：${JSON.stringify(d)}（应 ≈ +2,0）`);
}
summary.steps.gunLen = { candidateId: gunEdit.candidateId, status: gunEdit.status, affectedFrames: fwdIds, muzzleDelta: gunChecks.affectedFrames[0].attachmentDeltas.muzzle, committed: false };
console.error(`  ${fwdIds.length} 帧受影响；muzzle Δ=${JSON.stringify(summary.steps.gunLen.muzzleDelta)}（未提交，保留为候选证据）`);

step('5. 恢复初始版本 r1 → 新修订，哈希精确一致');
const r3State = (await store.state()).head;
const restored = await store.commit({ action: 'restore', targetRevision: 'r1', expectedHead: r3State, requestId: 'm5-restore' });
if (restored.hashes.renderHash !== r1.hashes.renderHash) die('恢复后 renderHash 与 r1 不一致');
if (restored.hashes.documentHash !== r1.hashes.documentHash) die('恢复后 documentHash 与 r1 不一致');
summary.steps.restore = { revision: restored.revision, matchesR1: true };

step('6. 导出（多帧 manifest）与播放材料检查');
const exported = await exportWorkspace(outDir, join(outDir, 'export'), OPTS);
const manifest = JSON.parse(await readFile(join(outDir, 'export', exported.files.manifest), 'utf8'));
const manifestErrors = validateManifest(manifest);
if (manifestErrors.length > 0) die(`manifest 校验失败：${manifestErrors.join('；')}`);
if (manifest.frames.length !== 13 || Object.keys(manifest.clips).length !== 4) die('导出应含 13 帧 4 剪辑');
let playerOk = false;
for (const label of await readdir(join(outDir, 'previews'))) {
  try {
    await access(join(outDir, 'previews', label, `${label}.player.html`));
    playerOk = true;
    break;
  } catch {
    /* 无 player */
  }
}
if (!playerOk) die('previews 中应存在 player.html 播放材料');
summary.steps.export = { frames: manifest.frames.length, clips: Object.keys(manifest.clips).length, playerHtml: true, files: exported.files };

summary.ok = true;
summary.finalState = await store.state();
await writeFile(join(outDir, 'demo-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
console.error('✓ M5 demo 通过');
