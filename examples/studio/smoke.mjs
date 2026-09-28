#!/usr/bin/env node
/**
 * examples/studio/smoke.mjs — PGA Studio 单命令 smoke（M1）
 *
 *   node examples/studio/smoke.mjs --out work/studio-smoke
 *
 * 流程：读样例文档 → 编译两次并断言确定性（documentHash/renderHash/RGBA 全等）
 * → 断言内画布/最终尺寸与 padding 合同 → create（源文档+预览+sceneMap）
 * → inspect（能力声明）→ export（.asset.json + 图集 + manifest，并校验 manifest）
 * 全部产物写入 --out 目录（默认 work/studio-smoke）。
 */
import { readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileStudioDocument } from '../../src/studio/compiler.js';
import { createFromFile, inspectFromFile, exportFromFile } from '../../src/adapters/studio-files.js';
import { validateManifest } from '../../src/export/manifest.js';

const here = dirname(fileURLToPath(import.meta.url));
const DOC = join(here, 'terminal.studio.json');
const PKG = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const GENERATOR = `procedural-game-assets@${PKG.version}`;
const TOOL_VERSION = `${PKG.version}/pga-studio-1`;

const args = process.argv.slice(2);
let out = 'work/studio-smoke';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out' && args[i + 1]) out = args[++i];
}
const outDir = resolve(out);
const step = (msg) => console.error(`▸ ${msg}`);
const die = (msg) => {
  console.error(`✗ smoke 失败：${msg}`);
  process.exit(1);
};

// 输出目录若为本工具生成（含 .pga.json 标记）则先清理，保证可重复运行；否则拒绝覆盖
try {
  const entries = await readdir(outDir);
  if (entries.includes('.pga.json')) await rm(outDir, { recursive: true });
  else if (entries.length > 0) die(`${outDir} 非空且不是本工具生成的目录`);
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}

step(`读取样例文档 ${DOC}`);
const doc = JSON.parse(await readFile(DOC, 'utf8'));

step('编译两次并断言确定性');
const a = compileStudioDocument(doc, { toolVersion: TOOL_VERSION });
const b = compileStudioDocument(doc, { toolVersion: TOOL_VERSION });
if (a.hashes.documentHash !== b.hashes.documentHash) die('documentHash 不稳定');
if (a.hashes.renderHash !== b.hashes.renderHash) die('renderHash 不稳定');
if (Buffer.from(a.asset.frames[0].rgba).compare(Buffer.from(b.asset.frames[0].rgba)) !== 0) die('两次编译 RGBA 不一致');
console.error(`  documentHash=${a.hashes.documentHash} renderHash=${a.hashes.renderHash}`);

const inner = a.sceneMap.inner;
const final = a.sceneMap.final;
if (final.w !== inner.w + 2 || final.h !== inner.h + 2) die(`尺寸合同不符：内 ${inner.w}×${inner.h} → 最终 ${final.w}×${final.h}（应为 +2 描边边距）`);
const frame = a.asset.frames[0];
if (frame.anchor.x !== doc.anchor.x + 1 || frame.anchor.y !== doc.anchor.y + 1) die('锚点未随 padding +1 平移');
for (const n of a.sceneMap.nodes) if (n.opaquePixels <= 0) die(`节点 '${n.id}' 没有画出任何像素`);
step(`尺寸合同通过：内画布 ${inner.w}×${inner.h} → 最终 ${final.w}×${final.h}；${a.sceneMap.nodes.length} 个节点均有像素`);

step(`create → ${outDir}`);
const created = await createFromFile(DOC, outDir, { toolVersion: TOOL_VERSION, generator: GENERATOR, displayScale: 8, background: '#202028' });
console.error(`  预览：${created.files.native} / ${created.files.display}`);

step('inspect（能力声明校验）');
const inspected = await inspectFromFile(DOC, { toolVersion: TOOL_VERSION, generator: GENERATOR });
const shell = inspected.capabilities.nodes['terminal.shell'];
if (!shell || !shell.operations['geometry.set'].fields.w) die('inspect 缺少 terminal.shell 的 geometry.set 能力');
if (inspected.nodes.length !== 4) die(`inspect 节点数 ${inspected.nodes.length} ≠ 4`);

step('export（既有资产格式 + manifest 校验）');
const exported = await exportFromFile(DOC, outDir, { toolVersion: TOOL_VERSION, generator: GENERATOR });
const manifest = JSON.parse(await readFile(join(outDir, exported.files.manifest), 'utf8'));
const manifestErrors = validateManifest(manifest);
if (manifestErrors.length > 0) die(`manifest 校验失败：${manifestErrors.join('；')}`);
console.error(`  导出：${exported.files.asset} / ${exported.files.pages.join(', ')} / ${exported.files.manifest}`);

const summary = {
  ok: true,
  outDir,
  documentHash: a.hashes.documentHash,
  renderHash: a.hashes.renderHash,
  inner,
  final,
  files: { ...created.files, ...exported.files },
};
await writeFile(join(outDir, 'smoke-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
console.error('✓ smoke 通过');
