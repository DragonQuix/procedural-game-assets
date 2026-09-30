#!/usr/bin/env node
/** 只准备工具候选快照、全新任务和基线；没有 participant/reviewer/model 接口。 */
import { mkdir, readFile, writeFile, readdir, cp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { materials } from './organizer/materials.mjs';
import { hashTree, treeHash, sha256 } from '../../tools/benchmark/payload-gate.mjs';
import { assertIdentityMaterials } from '../../tools/benchmark/identity-lint.mjs';
import { compileStudioDocument } from '../../src/studio/compiler.js';
import { encodePNG } from '../../src/export/png.js';
import { PixelPainter } from '../../src/core/raster.js';
import { scaleNearest } from '../../src/core/transform.js';

const kit = dirname(fileURLToPath(import.meta.url)), root = resolve(kit, '../..');
const json = async (file, value) => { await mkdir(dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2) + '\n'); };
const git = (...args) => execFileSync('git', args, { cwd: root });
const source = git('rev-parse', 'HEAD').toString().trim(), tag = git('rev-parse', 'v0.7.0^{commit}').toString().trim();
const descriptor = async path => { const files = await hashTree(join(kit, path)); return { path, files, sha256: treeHash(files) }; };
const manifestPath = join(kit, 'preparation-manifest.json');
const agentMaterials = [
  { file: 'participant.md', kind: 'participant' }, { file: 'reviewer.md', kind: 'reviewer' },
  { file: 'vision-gate.md', kind: 'vision' }, { file: 'blind-instructions.md', kind: 'blind' },
  { file: 'TASK.md', kind: 'task' }, { file: 'task-contract.json', kind: 'task' },
];

async function snapshot(ref, dir) {
  await mkdir(join(kit, dir), { recursive: true });
  const names = git('ls-tree', '-r', '--name-only', ref, '--', 'src', 'bin', 'package.json', 'package-lock.json', 'docs/studio-cli.md').toString().trim().split(/\r?\n/);
  for (const name of names) {
    const dst = join(kit, dir, name); await mkdir(dirname(dst), { recursive: true });
    await writeFile(dst, git('show', `${ref}:${name}`));
  }
  // Both snapshots carry the exact dependency bytes already shipped in v0.7.0; no install or network.
  const prefix = 'skills/procedural-game-assets/assets/toolkit/';
  const deps = git('ls-tree', '-r', '--name-only', tag, '--', `${prefix}node_modules/pngjs`).toString().trim().split(/\r?\n/);
  for (const name of deps) {
    const dst = join(kit, dir, name.slice(prefix.length)); await mkdir(dirname(dst), { recursive: true });
    await writeFile(dst, git('show', `${tag}:${name}`));
  }
}

async function lintTasks(manifest) {
  const inputs = [];
  for (const task of Object.values(manifest.tasks)) for (const m of manifest.agentMaterials) inputs.push({ ...m, file: `${task.common.path}/${m.file}`, text: await readFile(join(kit, task.common.path, m.file), 'utf8') });
  return assertIdentityMaterials(inputs);
}

if (process.argv.includes('--prepare')) {
  assert.equal(git('diff', 'HEAD', '--', 'src', 'bin', 'package.json', 'package-lock.json', 'docs/studio-cli.md').toString(), '', '先提交产品源再建立可追溯 D14 候选快照');
  await mkdir(join(kit, 'frozen')); // Append-only preparation; do not overwrite snapshots.
  const toolkits = {};
  for (const [arm, ref, version] of [['D13', tag, '0.7.0'], ['D14', source, '0.8.0']]) {
    const path = `frozen/${arm}-${version}-${ref.slice(0, 7)}`;
    await snapshot(ref, path);
    const pkg = JSON.parse(await readFile(join(kit, path, 'package.json'))); assert.equal(pkg.version, version);
    toolkits[arm] = { ...await descriptor(path), arm, version, sourceCommit: ref, status: arm === 'D13' ? 'FROZEN_RELEASE' : 'CANDIDATE_NOT_FINAL_FREEZE' };
  }
  const shared = join(kit, 'shared'); await mkdir(shared);
  for (const dir of ['core', 'observe', 'export']) await cp(join(root, 'src', dir), join(shared, 'src', dir), { recursive: true });
  await cp(join(kit, toolkits.D13.path, 'node_modules'), join(shared, 'node_modules'), { recursive: true });
  await json(join(shared, 'package.json'), { private: true, type: 'module' });
  await cp(join(kit, 'organizer/runtime/observe.mjs'), join(shared, 'observe.mjs'));
  const tasks = {};
  for (const [task, spec] of Object.entries(materials())) {
    const path = `materials/${task}/common`, common = join(kit, path); await mkdir(common, { recursive: true });
    for (const name of ['participant', 'reviewer', 'vision-gate', 'blind-instructions']) await cp(join(kit, `prompts/${name}.md`), join(common, `${name}.md`));
    await cp(join(kit, `tasks/${task}.md`), join(common, 'TASK.md'));
    await json(join(common, 'task-contract.json'), spec.taskContract);
    const f = compileStudioDocument(spec.D14).asset.frames[0];
    await writeFile(join(common, 'baseline.native.png'), encodePNG(f.width, f.height, f.rgba));
    const p = scaleNearest(PixelPainter.fromRGBA(f.width, f.height, f.rgba), 4);
    await writeFile(join(common, 'baseline.display.png'), encodePNG(p.w, p.h, p.toRGBA()));
    const documents = {};
    for (const arm of ['D13', 'D14']) {
      const docPath = `materials/${task}/${arm}.studio.json`; await json(join(kit, docPath), spec[arm]);
      documents[arm] = { path: docPath, sha256: sha256(await readFile(join(kit, docPath))) };
    }
    tasks[task] = { common: await descriptor(path), documents };
  }
  const vision = join(kit, 'vision'); await mkdir(vision);
  const imageA = new PixelPainter(24, 24), imageB = new PixelPainter(24, 24);
  imageA.rect(0, 0, 24, 24, '#233344');
  imageA.ellipse(8, 8, 5, 5, '#edb557'); imageA.ellipse(8, 8, 2, 2, '#233344');
  imageA.rect(10, 11, 3, 10, '#edb557'); imageA.rect(13, 17, 3, 2, '#edb557'); imageA.rect(13, 20, 3, 2, '#edb557');
  imageB.rect(0, 0, 24, 24, '#e7e2cc'); imageB.rect(10, 13, 4, 8, '#80573d');
  imageB.poly([[12, 2], [3, 15], [21, 15]], '#427851'); imageB.poly([[12, 5], [6, 13], [12, 13]], '#74a565');
  for (const [label, painter] of [['A', imageA], ['B', imageB]]) {
    const p = scaleNearest(painter, 4); await writeFile(join(vision, `vision_${label}.png`), encodePNG(p.w, p.h, p.toRGBA()));
  }
  await cp(join(kit, 'prompts/vision-gate.md'), join(vision, 'PROMPT.md'));
  await json(join(kit, 'organizer/vision-control.json'), { schema: 'pga-vision-control/2', coordinatorOnly: true,
    objects: { A: '金色钥匙，深色背景，环形孔与齿', B: '绿色树冠与棕色树干，浅色背景' },
    note: '预备图不是已通过的 gate；需 ZCode 真实宿主 image-input 证据。' });
  const manifest = { schema: 'pga-relation-preparation/1', status: 'DRAFT_NOT_RUN', approvedToExecute: false,
    toolkits, sharedObservation: await descriptor('shared'), tasks, agentMaterials,
    visionGate: { ...await descriptor('vision'), status: 'NOT_RUN' },
    protocolSha256: sha256(await readFile(join(kit, 'protocol-draft.json'))), experimentRunsCreated: 0, modelCalls: 0,
    independentValidation: 'NOT_RUN', finalFreeze: 'ZCODE_REQUIRED' };
  manifest.identityLint = await lintTasks(manifest);
  await json(manifestPath, manifest);
  console.log(JSON.stringify({ status: 'PREPARED_NOT_RUN', snapshots: Object.fromEntries(Object.entries(toolkits).map(([k, v]) => [k, v.path])), modelCalls: 0 }));
} else if (process.argv.includes('--check')) {
  const manifest = JSON.parse(await readFile(manifestPath));
  assert.equal(manifest.status, 'DRAFT_NOT_RUN'); assert.equal(manifest.approvedToExecute, false);
  for (const d of [...Object.values(manifest.toolkits), manifest.sharedObservation, manifest.visionGate, ...Object.values(manifest.tasks).map(t => t.common)]) assert.deepEqual(await descriptor(d.path), { path: d.path, files: d.files, sha256: d.sha256 });
  for (const task of Object.values(manifest.tasks)) for (const d of Object.values(task.documents)) assert.equal(sha256(await readFile(join(kit, d.path))), d.sha256);
  assert.equal(sha256(await readFile(join(kit, 'protocol-draft.json'))), manifest.protocolSha256);
  for (const name of ['runs', 'reviews', 'results', 'execution-freeze-manifest.json']) assert.ok(!(await readdir(kit)).includes(name));
  console.log(JSON.stringify({ status: 'HASH_CHECK_PASS', identityLint: await lintTasks(manifest), independentValidation: 'NOT_RUN', modelCalls: 0 }));
} else throw new Error('仅支持 --prepare / --check；没有模型执行或正式冻结入口');
