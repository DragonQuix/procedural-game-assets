#!/usr/bin/env node
// 共同观察 runner（trial 本地副本）：对任意 arm 的工作区产生等价观察包。
// 只读取工作区与冻结工具，不提供任何 Studio 编辑能力；观察模块与本文件同目录约定见 --shared-*。
// 用法：
//   node observe.mjs --arm-kit <kitDir> --shared-views <dir> --task G|P --ws <wsDir> --out <outDir>
//     [--revision rN] [--contract <task-contract.json>]
// 输出：<out>/ 下 current.native.png / current.display.png / baseline.display.png /
//   target_crop.{native,display}.png / contact_sheet.png / diff_overlay.png / views.json
// 观察目录不允许覆盖；每次关键决策后换新 --out。
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const self = dirname(fileURLToPath(import.meta.url));
const argOf = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const req = (name) => {
  const v = argOf(name);
  if (!v) { console.error(`缺少 --${name}`); process.exit(2); }
  return resolve(v);
};

const armKit = req('arm-kit');
const sharedViews = argOf('shared-views') ? resolve(argOf('shared-views')) : join(self, 'kit', 'observe-shared', 'src', 'observe');
// sharedViews 指向 observe-shared/src/observe（frame-views.js 的相对导入 ../core/*.js 在该树内成立）；
// pngjs 取 kit/node_modules（与 sharedViews 同级的上一级即 kit）。
const ws = req('ws');
const out = req('out');
const task = req('task');
const contractPath = argOf('contract') ? resolve(argOf('contract')) : join(self, 'task-contract.json');
const revision = argOf('revision');

if (existsSync(out)) { console.error(`观察目录已存在，拒绝覆盖：${out}`); process.exit(4); }
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// 先加载全部模块，再创建输出目录；任何加载失败都不会留下半成品目录。
const { PNG } = await import(pathToFileURL(join(armKit, 'node_modules', 'pngjs', 'lib', 'png.js')));
const frameViews = await import(pathToFileURL(join(sharedViews, 'frame-views.js')));
const coreDir = join(sharedViews, '..', 'core');
const { PixelPainter } = await import(pathToFileURL(join(coreDir, 'raster.js')));
const { scaleNearest } = await import(pathToFileURL(join(coreDir, 'transform.js')));

const cli = join(armKit, 'bin', 'pga-studio.mjs');
const runCli = (args) => JSON.parse(execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8', stderr: 'ignore' }));

const state = runCli(['state', '--ws', ws]).result;
const head = state.head;
const target = revision ?? head;

const tmpExport = join(out, '.tmp-export');
const tmpBase = join(out, '.tmp-baseline');
await mkdir(dirname(out), { recursive: true });
await mkdir(tmpExport, { recursive: true });
await mkdir(tmpBase, { recursive: true });
try {
  const exportResult = runCli(['export', '--ws', ws, '--revision', target, '--out', tmpExport]).result;
  runCli(['export', '--ws', ws, '--revision', 'r1', '--out', tmpBase]);
  const contract = JSON.parse(await readFile(contractPath, 'utf8'));
  const inspect = runCli(['inspect', '--ws', ws, '--revision', target]).result;

  const decode = async (file) => {
    const png = PNG.sync.read(await readFile(file));
    return { width: png.width, height: png.height, rgba: new Uint8ClampedArray(png.data) };
  };
  const encode = (frame) => {
    const png = new PNG({ width: frame.width, height: frame.height });
    png.data = Buffer.from(frame.rgba);
    return PNG.sync.write(png);
  };
  const displayFrame = (frame, scale = 4) => {
    const p = scaleNearest(PixelPainter.fromRGBA(frame.width, frame.height, frame.rgba), scale);
    return { width: p.w, height: p.h, rgba: p.toRGBA() };
  };

  const pngFile = (await readdir(tmpExport)).find((f) => f.endsWith('.page0.png'));
  if (!pngFile) throw new Error('导出中未找到 page0.png');
  const currentFrame = await decode(join(tmpExport, pngFile));

  const basePng = (await readdir(tmpBase)).find((f) => f.endsWith('.page0.png'));
  if (!basePng) throw new Error('r1 基线导出中未找到 page0.png');
  const baselineFrame = await decode(join(tmpBase, basePng));

  const node = inspect.nodes.find((n) => n.id === contract.objectives.target);
  if (!node) throw new Error(`合同目标节点不存在：${contract.objectives.target}`);

  const files = {};
  const put = async (name, frame) => { files[name] = join(out, name); await writeFile(files[name], encode(frame)); };
  // 现帧原样导出（copy）与 4x 显示帧
  files['current.native.png'] = join(tmpExport, pngFile);
  await writeFile(join(out, 'current.native.png'), await readFile(files['current.native.png']));
  files['current.native.png'] = join(out, 'current.native.png');
  await put('current.display.png', displayFrame(currentFrame));
  await put('baseline.display.png', displayFrame(baselineFrame));

  const crop = frameViews.targetCrop(currentFrame, { rect: node.frameRect, scale: 4 });
  await put('target_crop.native.png', crop.native);
  await put('target_crop.display.png', crop.display);

  const sheet = frameViews.candidateContactSheet([
    { frame: baselineFrame, identity: { revision: 'r1-base' } },
    { frame: currentFrame, identity: { revision: target } },
  ], { scale: 4 });
  await put('contact_sheet.png', sheet.display);

  const diff = frameViews.diffOverlay(baselineFrame, currentFrame, {
    scale: 4, baseIdentity: { revision: 'r1-base' }, candidateIdentity: { revision: target },
  });
  await put('diff_overlay.png', diff.display);

  const hashes = {};
  for (const [name, file] of Object.entries(files)) hashes[name] = sha256(await readFile(file));
  const meta = {
    schema: 'pga-trial-observation/1',
    task, workspace: ws, revision: target, head,
    toolVersion: inspect.hashes?.toolVersion ?? null,
    cropNode: { id: node.id, frameRect: node.frameRect },
    changedPixelCount: diff.meta.changedPixelCount,
    changedBounds: diff.meta.changedBounds,
    sharedViewsModule: 'observe-shared/frame-views.js',
    generatedBy: 'trial-observe/1',
    files: hashes,
  };
  await writeFile(join(out, 'views.json'), JSON.stringify(meta, null, 2) + '\n');
  console.log(JSON.stringify({ ok: true, out, revision: target, changedPixelCount: diff.meta.changedPixelCount, files: Object.keys(hashes) }));
} finally {
  await rm(tmpExport, { recursive: true, force: true });
  await rm(tmpBase, { recursive: true, force: true });
}
