import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile, cp, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { materials, directSource } from './materials.mjs';
import { json, tree, readJSON } from '../shared/files.mjs';
import { sha256, canonical } from '../shared/accounting.mjs';
import { compose } from '../shared/state.mjs';
import { assertIdentityMaterials } from '../../../tools/benchmark/identity-lint.mjs';
import { reviewSchema } from './review-schema.mjs';

export const benchmark = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const repo = resolve(benchmark, '../..');
export const TAG_COMMIT = '91aaa757bd910255f293c57f594cac06f9f169af';
const git = (...args) => execFileSync('git', args, { cwd: repo, maxBuffer: 20 * 1024 * 1024 });
const list = paths => git('ls-tree', '-r', '--name-only', TAG_COMMIT, '--', ...paths).toString().trim().split(/\r?\n/).filter(Boolean);
const DEP_PREFIX = 'skills/procedural-game-assets/assets/toolkit/';

export function compiledState(api, doc) {
  const full = api.compileStudioDocument(doc), f = full.asset.frames[0];
  const layers = full.document.nodes.toSorted((a, b) => a.layer - b.layer).map(n => {
    const single = { ...full.document, schemaVersion: 'pga-studio/2', constraints: [], nodes: [n] };
    delete single.protection; delete single.relations;
    const part = api.compileStudioDocument(single).asset.frames[0];
    return { id: n.id, width: part.width, height: part.height, rgba: Array.from(part.rgba) };
  });
  return compose({ width: f.width, height: f.height, anchor: f.anchor, attachments: f.attachments, layers });
}

export function plannedMatrix() {
  const pairs = [], runs = [], reviewers = [];
  for (const [ti, task] of ['H', 'K', 'M', 'S'].entries()) for (let repeat = 1; repeat <= 3; repeat++) {
    const pair = `${task}-r${repeat}`, order = (ti + repeat) % 2 ? ['A', 'D14'] : ['D14', 'A'];
    pairs.push({ pair, task, repeat, runs: order.map(arm => `${task}-${arm}-r${repeat}`) });
    for (const arm of order) runs.push({ runId: `${task}-${arm}-r${repeat}`, pair, task, repeat, arm, status: 'PLANNED_NOT_CREATED', context: null });
    for (const slot of [1, 2]) reviewers.push({ reviewerId: `${pair}-reviewer-${slot}`, pair, slot, status: 'PLANNED_NOT_CREATED', context: null });
  }
  return { pairs, runs, reviewers };
}

export async function prepareMaterials(out) {
  assert.equal(git('rev-parse', 'v0.8.0^{commit}').toString().trim(), TAG_COMMIT, 'v0.8.0 tag moved');
  await mkdir(out); // 只写新目录，不能覆盖候选或正式资料。
  const provenance = {}, toolkits = {};
  for (const arm of ['A', 'D14']) {
    const paths = arm === 'D14' ? ['src', 'bin', 'package.json', 'package-lock.json', 'docs/studio-cli.md'] :
      ['src/core', 'src/geometry', 'src/bake', 'src/recipes', 'src/export', 'src/adapters/asset-file.js', 'package.json', 'package-lock.json', 'docs/recipe-guide.md'];
    const mapping = Object.fromEntries(list(paths).map(p => [p, p]));
    for (const p of list([`${DEP_PREFIX}node_modules/pngjs`])) mapping[p.slice(DEP_PREFIX.length)] = p;
    const dir = join(out, 'frozen', arm);
    for (const [target, source] of Object.entries(mapping)) {
      await mkdir(dirname(join(dir, target)), { recursive: true }); await writeFile(join(dir, target), git('show', `${TAG_COMMIT}:${source}`));
    }
    provenance[arm] = mapping;
    toolkits[arm] = { path: `frozen/${arm}`, arm, version: '0.8.0', tag: 'v0.8.0', sourceCommit: TAG_COMMIT, ...await tree(dir) };
  }
  const shared = join(out, 'shared'); await cp(join(benchmark, 'shared'), shared, { recursive: true });
  for (const dir of ['core', 'observe', 'export']) await cp(join(out, 'frozen/D14/src', dir), join(shared, 'src', dir), { recursive: true });
  await cp(join(out, 'frozen/D14/node_modules'), join(shared, 'node_modules'), { recursive: true });
  await json(join(shared, 'package.json'), { type: 'module', private: true });
  const api = await import(pathToFileURL(join(out, 'frozen/D14/src/studio/compiler.js')));
  const { encodePNG } = await import(pathToFileURL(join(out, 'frozen/D14/src/export/png.js')));
  const { observe } = await import(pathToFileURL(join(shared, 'observe.mjs')));
  const tasks = {}, lintInputs = [];
  for (const [task, spec] of Object.entries(materials(api))) {
    const common = join(out, `materials/${task}/common`), baseline = compiledState(api, spec.D14);
    await mkdir(common, { recursive: true });
    await writeFile(join(common, 'baseline.state.json'), JSON.stringify(baseline) + '\n');
    await json(join(common, 'task-contract.json'), spec.contract);
    await cp(join(benchmark, `tasks/${task}.md`), join(common, 'TASK.md'));
    await cp(join(benchmark, 'prompts/participant.md'), join(common, 'participant.md'));
    await observe(join(common, 'observation'), baseline.frame, baseline.frame, spec.contract.crop);
    await writeFile(join(common, 'baseline.png'), encodePNG(baseline.frame.width, baseline.frame.height, Uint8ClampedArray.from(baseline.frame.rgba)));
    await json(join(out, `materials/${task}/D14.json`), spec.D14);
    await writeFile(join(out, `materials/${task}/A.mjs`), directSource(spec.baseline));
    tasks[task] = { common: { path: `materials/${task}/common`, ...await tree(common) }, starts: {} };
    for (const [arm, name] of [['A', 'A.mjs'], ['D14', 'D14.json']]) {
      const path = `materials/${task}/${name}`; tasks[task].starts[arm] = { path, sha256: sha256(await readFile(join(out, path))) };
    }
    for (const file of ['TASK.md', 'participant.md', 'task-contract.json']) lintInputs.push({ file: `${task}/${file}`, kind: 'participant', text: await readFile(join(common, file), 'utf8') });
  }
  await json(join(out, 'review-schema.json'), reviewSchema);
  await json(join(out, 'planned-matrix.json'), plannedMatrix());
  const { PixelPainter } = await import(pathToFileURL(join(out, 'frozen/D14/src/core/raster.js')));
  const visionDir = join(out, 'vision'); await mkdir(visionDir);
  const a = new PixelPainter(32, 32), b = new PixelPainter(32, 32);
  a.rect(0, 0, 32, 32, '#283844'); a.poly([[5, 22], [27, 22], [23, 27], [9, 27]], '#cf8454'); a.rect(15, 5, 2, 17, '#e2d5aa'); a.poly([[18, 7], [18, 20], [27, 20]], '#e2d5aa');
  b.rect(0, 0, 32, 32, '#e5d9b8'); b.ellipse(16, 14, 9, 9, '#66895e'); b.rect(14, 22, 4, 6, '#635047'); b.ellipse(16, 14, 4, 4, '#e5d9b8');
  for (const [id, p] of [['A', a], ['B', b]]) await writeFile(join(visionDir, `vision_${id}.png`), encodePNG(p.w, p.h, p.toRGBA()));
  await cp(join(benchmark, 'prompts/vision.md'), join(visionDir, 'PROMPT.md'));
  for (const file of ['reviewer.md', 'vision.md']) lintInputs.push({ file, kind: file === 'vision.md' ? 'vision' : 'reviewer', text: await readFile(join(benchmark, 'prompts', file), 'utf8') });
  const manifest = { schema: 'pga-e2e-materials/0.3', status: 'CANDIDATE_NOT_RUN', approvedToExecute: false, toolkits,
    shared: { path: 'shared', ...await tree(shared) }, tasks, vision: { path: 'vision', ...await tree(visionDir), status: 'NOT_RUN' },
    provenance, identityLint: assertIdentityMaterials(lintInputs), matrixSha256: sha256(await readFile(join(out, 'planned-matrix.json'))),
    protocolSha256: sha256(await readFile(join(benchmark, 'protocol-draft.json'))),
    sourceTrees: { organizer: await tree(join(benchmark, 'organizer')), shared: await tree(join(benchmark, 'shared')), prompts: await tree(join(benchmark, 'prompts')), tasks: await tree(join(benchmark, 'tasks')) },
    coordinatorDependencies: { src: await tree(join(repo, 'src')), 'tools/benchmark': await tree(join(repo, 'tools/benchmark')) },
    protocolFiles: Object.fromEntries(await Promise.all(['protocol-draft.json', 'PROTOCOL.md', 'README.md', 'HOLDOUT.md'].map(async name => [name, sha256(await readFile(join(benchmark, name)))]))),
    selfTestSha256: sha256(await readFile(join(repo, 'tests/integration/benchmark-e2e-v03.test.js'))),
    participantRuns: 0, reviews: 0, scoredModelCalls: 0, modelIdentity: null, host: null, freezeOwner: 'ZCode' };
  await json(join(out, 'manifest.json'), manifest); return manifest;
}

export async function checkMaterials(out) {
  const m = await readJSON(join(out, 'manifest.json'));
  assert.equal(m.status, 'CANDIDATE_NOT_RUN'); assert.equal(m.approvedToExecute, false);
  for (const d of [...Object.values(m.toolkits), m.shared, m.vision, ...Object.values(m.tasks).map(t => t.common)]) assert.deepEqual(await tree(join(out, d.path)), { files: d.files, sha256: d.sha256 });
  for (const task of Object.values(m.tasks)) for (const start of Object.values(task.starts)) assert.equal(sha256(await readFile(join(out, start.path))), start.sha256);
  for (const [arm, mapping] of Object.entries(m.provenance)) for (const [target, source] of Object.entries(mapping)) assert.equal(sha256(await readFile(join(out, `frozen/${arm}`, target))), sha256(git('show', `${TAG_COMMIT}:${source}`)));
  for (const [name, descriptor] of Object.entries(m.sourceTrees)) assert.deepEqual(await tree(join(benchmark, name)), descriptor);
  for (const [name, descriptor] of Object.entries(m.coordinatorDependencies)) assert.deepEqual(await tree(join(repo, name)), descriptor);
  for (const [name, hash] of Object.entries(m.protocolFiles)) assert.equal(sha256(await readFile(join(benchmark, name))), hash);
  assert.equal(sha256(await readFile(join(repo, 'tests/integration/benchmark-e2e-v03.test.js'))), m.selfTestSha256);
  assert.equal(m.protocolSha256, sha256(await readFile(join(benchmark, 'protocol-draft.json'))));
  assert.equal(m.matrixSha256, sha256(await readFile(join(out, 'planned-matrix.json'))));
  assert.deepEqual(await readJSON(join(out, 'planned-matrix.json')), plannedMatrix());
  assert.deepEqual(await readJSON(join(out, 'review-schema.json')), reviewSchema);
  for (const dir of [out, benchmark]) for (const name of await readdir(dir)) assert.ok(!['runs', 'reviews', 'results', 'protocol-frozen.json', 'execution-freeze.json'].includes(name), `正式资料不应存在: ${name}`);
  return { status: 'PASS', tag: 'v0.8.0', participantRuns: 0, reviews: 0, scoredModelCalls: 0 };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--out'), out = at >= 0 ? resolve(process.argv[at + 1]) : join(benchmark, 'candidate-materials');
  const result = process.argv.includes('--check') ? await checkMaterials(out) : await prepareMaterials(out);
  console.log(JSON.stringify({ status: result.status, out, participantRuns: 0, reviews: 0, scoredModelCalls: 0 }));
}
