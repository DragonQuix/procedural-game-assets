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

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const kit = dirname(fileURLToPath(import.meta.url));
const frozen = join(kit, 'frozen');
const oldCommit = '4fd4330';
const json = async (file, value) => { await mkdir(dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2) + '\n'); };
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
  const path = 'D13-0.7.0';
  await mkdir(join(frozen, path));
  for (const name of ['src', 'bin', 'package.json', 'package-lock.json']) await cp(join(root, name), join(frozen, path, name), { recursive: true });
  await cp(join(root, 'node_modules/pngjs'), join(frozen, path, 'node_modules/pngjs'), { recursive: true });
  manifest.archivedToolkits = { 'D13-initial-draft': { ...manifest.toolkits.D13, path: 'D13' } };
  manifest.toolkits.D13 = { path, source: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), files: await hashTree(join(frozen, path)) };
  await json(join(kit, 'preparation-manifest.json'), manifest);
  console.log('D13 0.7.0 草案快照已追加；旧快照保留，未执行实验');
} else if (process.argv.includes('--check')) {
  const manifest = JSON.parse(await readFile(join(kit, 'preparation-manifest.json')));
  for (const arm of ['D12', 'D13']) assert.deepEqual(await hashTree(join(frozen, manifest.toolkits[arm].path ?? arm)), manifest.toolkits[arm].files);
  for (const archived of Object.values(manifest.archivedToolkits ?? {})) assert.deepEqual(await hashTree(join(frozen, archived.path)), archived.files);
  assert.deepEqual(await hashTree(join(kit, 'materials')), manifest.materials);
  const armModules = {};
  for (const arm of ['D12', 'D13']) armModules[arm] = await import(pathToFileURL(join(frozen, manifest.toolkits[arm].path ?? arm, 'src/studio/dispatch.js')));
  for (const [task, spec] of Object.entries(materials())) {
    const pixels = [];
    for (const arm of ['D12', 'D13']) {
      const api = armModules[arm], doc = JSON.parse(await readFile(join(kit, 'materials', task, `${arm}.studio.json`)));
      const before = api.compileAny(doc), next = api.applyAnyOperation(doc, spec.control), after = api.compileAny(next.doc);
      assert.equal(api.checkAnyCandidate({ baseCompiled: before, candidateCompiled: after, plan: next.plan, preserve: api.preserveFromAnyDocument(doc) }).status, 'OK');
      if (arm === 'D13') assert.equal(after.protection.status, 'PASS');
      pixels.push(after.asset.frames[0].rgba);
    }
    assert.deepEqual(pixels[0], pixels[1]);
  }
  for (const name of ['runs', 'reviews', 'results', 'execution-freeze-manifest.json']) assert.ok(!(await readdir(kit)).includes(name), `意外实验产物 ${name}`);
  console.log(JSON.stringify({ status: 'PASS', experiment: 'NOT_RUN', toolkitFiles: Object.fromEntries(Object.entries(manifest.toolkits).map(([a, v]) => [a, Object.keys(v.files).length])) }));
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
