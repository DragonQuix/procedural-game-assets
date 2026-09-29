#!/usr/bin/env node
// 仅冻结工具与任务、检查机械可行性，不创建 run、不调用模型、不执行实验。
import { readFile, writeFile, mkdir, cp, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { materials } from './organizer/materials.mjs';
import { createProtectedDocument, compileStudioDocument } from '../../src/studio/compiler.js';
import { applyOperation } from '../../src/studio/operators.js';
import { checkCandidate, preserveFromDocument } from '../../src/studio/protect.js';
import { encodePNG } from '../../src/export/png.js';
import { checkAssetProtection } from '../../src/studio/protection-contract.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const kit = dirname(fileURLToPath(import.meta.url));
const frozen = join(kit, 'frozen');
const oldCommit = '4fd4330';
const json = async (file, value) => { await mkdir(dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2) + '\n'); };
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sharedObservationFiles = ['src/observe/frame-views.js', 'src/core/raster.js', 'src/core/transform.js'];
async function hashTree(dir) {
  const files = {};
  async function walk(current) {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else files[relative(dir, path).replaceAll('\\', '/')] = createHash('sha256').update(await readFile(path)).digest('hex');
    }
  }
  await walk(dir); return files;
}
if (process.argv.includes('--finalize')) {
  const manifest = JSON.parse(await readFile(join(kit, 'preparation-manifest.json')));
  for (const arm of ['D12', 'D13']) assert.deepEqual(await hashTree(join(frozen, manifest.toolkits[arm].path ?? arm)), manifest.toolkits[arm].files);
  for (const archived of Object.values(manifest.archivedToolkits ?? {})) assert.deepEqual(await hashTree(join(frozen, archived.path)), archived.files);
  assert.deepEqual(await hashTree(join(kit, 'materials')), manifest.materials);
  const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(execFileSync('git', ['diff', 'HEAD', '--', 'src', 'bin', 'package.json', 'package-lock.json'], { cwd: root, encoding: 'utf8' }), '', '先提交产品源，再追加可追溯快照');
  const version = JSON.parse(await readFile(join(root, 'package.json'))).version;
  const path = `D13-${version}-${source.slice(0, 7)}`;
  await mkdir(join(frozen, path));
  for (const name of ['src', 'bin', 'package.json', 'package-lock.json']) await cp(join(root, name), join(frozen, path, name), { recursive: true });
  await cp(join(root, 'node_modules/pngjs'), join(frozen, path, 'node_modules/pngjs'), { recursive: true });
  const previous = manifest.toolkits.D13, previousPath = previous.path ?? 'D13';
  manifest.archivedToolkits = { ...manifest.archivedToolkits, [previousPath]: { ...previous, path: previousPath } };
  manifest.toolkits.D13 = { path, source, files: await hashTree(join(frozen, path)) };
  manifest.protocolSha256 = sha256(await readFile(join(kit, 'protocol-draft.json')));
  manifest.sharedObservationFiles = {};
  for (const file of sharedObservationFiles) {
    const hash = sha256(await readFile(join(root, file)));
    assert.equal(hash, previous.files[file], `共同观察实现不能随本轮修复改变：${file}`);
    manifest.sharedObservationFiles[file] = hash;
  }
  await json(join(kit, 'preparation-manifest.json'), manifest);
  console.log(`${path} 草案快照已追加；全部旧快照保留，未执行实验`);
} else if (process.argv.includes('--check')) {
  const manifest = JSON.parse(await readFile(join(kit, 'preparation-manifest.json')));
  for (const arm of ['D12', 'D13']) assert.deepEqual(await hashTree(join(frozen, manifest.toolkits[arm].path ?? arm)), manifest.toolkits[arm].files);
  for (const archived of Object.values(manifest.archivedToolkits ?? {})) assert.deepEqual(await hashTree(join(frozen, archived.path)), archived.files);
  assert.deepEqual(await hashTree(join(kit, 'materials')), manifest.materials);
  const protocol = JSON.parse(await readFile(join(kit, 'protocol-draft.json')));
  assert.equal(protocol.status, 'DRAFT_NOT_RUN');
  assert.equal(protocol.approvedToExecute, false);
  assert.deepEqual(protocol.execution, { started: false, participantRuns: 0, reviews: 0, results: null });
  assert.equal(manifest.experimentRunsCreated, 0); assert.equal(manifest.modelCalls, 0);
  if (manifest.protocolSha256) assert.equal(sha256(await readFile(join(kit, 'protocol-draft.json'))), manifest.protocolSha256);
  for (const [file, hash] of Object.entries(manifest.sharedObservationFiles ?? {})) {
    assert.equal(manifest.toolkits.D13.files[file], hash);
  }
  const armModules = {};
  for (const arm of ['D12', 'D13']) armModules[arm] = await import(pathToFileURL(join(frozen, manifest.toolkits[arm].path ?? arm, 'src/studio/dispatch.js')));
  const { candidateContactSheet, targetCrop, diffOverlay } = await import(pathToFileURL(join(frozen, manifest.toolkits.D13.path ?? 'D13', 'src/observe/frame-views.js')));
  for (const [task, spec] of Object.entries(materials())) {
    const starts = [], pixels = [], views = [];
    const contract = JSON.parse(await readFile(join(kit, 'materials', task, 'task-contract.json'))).protection;
    assert.deepEqual(contract, createProtectedDocument(spec.baseline, spec.protection).protection);
    const contractBaseline = compileStudioDocument(contract.baseline);
    for (const arm of ['D12', 'D13']) {
      const api = armModules[arm], doc = JSON.parse(await readFile(join(kit, 'materials', task, `${arm}.studio.json`)));
      const before = api.compileAny(doc), next = api.applyAnyOperation(doc, spec.control), after = api.compileAny(next.doc);
      assert.deepEqual(doc, arm === 'D12' ? spec.baseline : createProtectedDocument(spec.baseline, spec.protection));
      assert.equal(api.checkAnyCandidate({ baseCompiled: before, candidateCompiled: after, plan: next.plan, preserve: api.preserveFromAnyDocument(doc) }).status, 'OK');
      if (arm === 'D13') assert.equal(after.protection.status, 'PASS');
      // 独立最终合同作用于两组真实编译结果；不向 D12 注入编辑能力或重烘焙它的输出。
      assert.equal(checkAssetProtection(contract, contractBaseline, { ...after, document: { ...after.document, protection: contract } }).status, 'PASS');
      starts.push(before.asset.frames[0].rgba);
      pixels.push(after.asset.frames[0].rgba);
      const baseFrame = before.asset.frames[0], finalFrame = after.asset.frames[0];
      views.push({ crop: targetCrop(baseFrame, { rect: before.sceneMap.nodes.find((n) => n.id === spec.control.target).frameRect, scale: 4 }),
        sheet: candidateContactSheet([{ frame: baseFrame }, { frame: finalFrame }], { scale: 4 }),
        diff: diffOverlay(baseFrame, finalFrame, { scale: 4 }) });
    }
    assert.deepEqual(starts[0], starts[1]);
    assert.deepEqual(pixels[0], pixels[1]);
    assert.deepEqual(views[0], views[1]);
  }
  for (const name of ['runs', 'reviews', 'results', 'execution-freeze-manifest.json']) assert.ok(!(await readdir(kit)).includes(name), `意外实验产物 ${name}`);
  console.log(JSON.stringify({ status: 'PASS', experiment: 'NOT_RUN', baselinePixelsEqual: true, sharedObservationsEqual: true, independentFinalContract: 'PASS', toolkitFiles: Object.fromEntries(Object.entries(manifest.toolkits).map(([a, v]) => [a, Object.keys(v.files).length])) }));
} else if (process.argv.includes('--prepare')) {
  await mkdir(frozen); // 不覆盖冻结载荷；新冻结必须用新包目录。
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', oldCommit, '--', 'src', 'bin', 'package.json', 'package-lock.json'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/);
  for (const file of files) {
    const dst = join(frozen, 'D12', file); await mkdir(dirname(dst), { recursive: true });
    await writeFile(dst, execFileSync('git', ['show', `${oldCommit}:${file}`], { cwd: root }));
  }
  for (const name of ['src', 'bin', 'package.json', 'package-lock.json']) await cp(join(root, name), join(frozen, 'D13', name), { recursive: true });
  for (const arm of ['D12', 'D13']) await cp(join(root, 'node_modules/pngjs'), join(frozen, arm, 'node_modules/pngjs'), { recursive: true });
  const old = await import(pathToFileURL(join(frozen, 'D12/src/studio/dispatch.js')));
  const checks = [];
  for (const [task, spec] of Object.entries(materials())) {
    const current = createProtectedDocument(spec.baseline, spec.protection);
    const before12 = old.compileAny(spec.baseline), before13 = compileStudioDocument(current);
    assert.deepEqual(before12.asset.frames[0].rgba, before13.asset.frames[0].rgba);
    const after12 = old.compileAny(old.applyAnyOperation(spec.baseline, spec.control).doc);
    const transformed = applyOperation(current, spec.control), after13 = compileStudioDocument(transformed.doc);
    const valid12 = old.checkAnyCandidate({ baseCompiled: before12, candidateCompiled: after12, plan: old.applyAnyOperation(spec.baseline, spec.control).plan, preserve: preserveFromDocument(spec.baseline) });
    const valid13 = checkCandidate({ baseCompiled: before13, candidateCompiled: after13, plan: transformed.plan, preserve: preserveFromDocument(current) });
    assert.equal(valid12.status, 'OK'); assert.equal(valid13.status, 'OK');
    assert.equal(after13.protection.status, 'PASS'); assert.deepEqual(after12.asset.frames[0].rgba, after13.asset.frames[0].rgba);
    await json(join(kit, 'materials', task, 'D12.studio.json'), spec.baseline);
    await json(join(kit, 'materials', task, 'D13.studio.json'), current);
    await json(join(kit, 'materials', task, 'task-contract.json'), { task, requiredClips: [], requiredViews: ['X.native.png', 'Y.native.png'], objectives: spec.objectives, protection: current.protection });
    const f = before13.asset.frames[0]; await writeFile(join(kit, 'materials', task, 'baseline.native.png'), encodePNG(f.width, f.height, f.rgba));
    checks.push({ task, baselinePixelsEqual: true, controlPixelsEqual: true, D12: valid12.status, D13: valid13.status, finalProtection: after13.protection.status });
  }
  const toolkits = {};
  for (const arm of ['D12', 'D13']) toolkits[arm] = { source: arm === 'D12' ? execFileSync('git', ['rev-parse', oldCommit], { cwd: root, encoding: 'utf8' }).trim() : '当前开发源逐文件冻结；以 files 的 SHA-256 为准', files: await hashTree(join(frozen, arm)) };
  await json(join(kit, 'preparation-manifest.json'), { schema: 'pga-constraint-preparation/1', status: 'DRAFT_NOT_RUN', toolkits, materials: await hashTree(join(kit, 'materials')), checks, experimentRunsCreated: 0, modelCalls: 0, note: '只有两任务的确定性主持人控制解验证；不是12-run实验，也不是视觉评审。' });
  console.log(JSON.stringify({ status: 'PREPARED_NOT_RUN', checks }, null, 2));
} else throw new Error('仅支持 --prepare / --finalize / --check；没有实验执行入口');
