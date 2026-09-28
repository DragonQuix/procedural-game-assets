/**
 * adapters/studio-files.js — Studio 文档/预览/导出的文件 IO（ADR-0001：IO 全在适配层）
 *
 * 这里只做：读 JSON 文档、写规范化文档/预览 PNG/sceneMap/既有资产导出、输出目录覆盖保护。
 * 编辑逻辑（校验、编译、视图）全部在 src/studio/ 纯核心；CLI 与本文件共享同一实现，
 * 不在 bin/ 里另写一套。
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compileStudioDocument, describeCapabilities } from '../studio/compiler.js';
import { buildViews } from '../studio/observe.js';
import { stableStringify } from '../studio/document.js';
import { assetToJSON } from './asset-file.js';
import { encodePNG } from '../export/png.js';
import { packAtlas, renderAtlasPages } from '../export/atlas.js';
import { buildManifest } from '../export/manifest.js';

const MARKER = '.pga.json';

export class StudioOverwriteError extends Error {
  constructor(dir) {
    super(`输出目录 ${dir} 非空且不是本工具生成的目录；为避免覆盖你的文件已拒绝。请换空目录或先确认删除。`);
    this.name = 'StudioOverwriteError';
    this.code = 'UNSAFE_PATH';
  }
}

/** 覆盖保护：目录非空且没有本工具标记时拒绝写入（与 bin/pga.mjs 同一语义）。 */
async function ensureOutDir(dir) {
  await mkdir(dir, { recursive: true });
  const entries = await readdir(dir);
  if (entries.length === 0 || entries.includes(MARKER)) return;
  throw new StudioOverwriteError(dir);
}

async function writeMarker(dir, generator) {
  await writeFile(join(dir, MARKER), JSON.stringify({ tool: 'procedural-game-assets', generator }) + '\n');
}

/** 从磁盘读取并解析 Studio 文档（解析失败抛出带 INVALID_DOCUMENT 语义的错误）。 */
export async function readStudioDocument(docPath) {
  let text;
  try {
    text = await readFile(docPath, 'utf8');
  } catch (e) {
    const err = new Error(`无法读取文档 ${docPath}：${e.message}`);
    err.code = 'INVALID_DOCUMENT';
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    const err = new Error(`文档 ${docPath} 不是合法 JSON：${e.message}`);
    err.code = 'INVALID_DOCUMENT';
    throw err;
  }
}

function previewFileName(kind, compiled, nodeId) {
  const base = compiled.asset.id;
  return nodeId ? `${base}.${kind}.${nodeId}.png` : `${base}.${kind}.png`;
}

async function writePreviews(outDir, compiled, views, nodeId) {
  const files = {};
  files.native = previewFileName('native', compiled);
  await writeFile(join(outDir, files.native), encodePNG(views.native.width, views.native.height, views.native.rgba));
  files.display = previewFileName('display', compiled);
  await writeFile(join(outDir, files.display), encodePNG(views.display.width, views.display.height, views.display.rgba));
  if (views.crop) {
    files.crop = previewFileName('crop', compiled, nodeId);
    await writeFile(join(outDir, files.crop), encodePNG(views.crop.width, views.crop.height, views.crop.rgba));
  }
  return files;
}

function summarize(compiled, docPath, outDir, files) {
  return {
    assetId: compiled.asset.id,
    kind: compiled.asset.kind,
    seed: compiled.asset.seed,
    source: docPath,
    inner: compiled.sceneMap.inner,
    final: compiled.sceneMap.final,
    anchor: compiled.asset.frames[0].anchor,
    attachments: compiled.asset.frames[0].attachments,
    nodes: compiled.sceneMap.nodes.map((n) => ({ id: n.id, kind: n.kind, layer: n.layer, ramp: n.ramp, material: n.material, frameRect: n.frameRect, frameBounds: n.frameBounds, opaquePixels: n.opaquePixels })),
    hashes: compiled.hashes,
    diagnostics: compiled.diagnostics,
    outDir,
    files,
  };
}

/**
 * create：校验 + 编译 + 落盘可编辑源文档、sceneMap、native/display 预览。
 * @returns {Promise<object>} 供 CLI 输出的 JSON 摘要
 */
export async function createFromFile(docPath, outDir, opts = {}) {
  const doc = await readStudioDocument(docPath);
  const compiled = compileStudioDocument(doc, { toolVersion: opts.toolVersion });
  await ensureOutDir(outDir);
  await writeMarker(outDir, opts.generator ?? 'unknown');
  const views = buildViews(compiled, { displayScale: opts.displayScale, background: opts.background });
  const files = await writePreviews(outDir, compiled, views);
  files.document = `${compiled.asset.id}.studio.json`;
  await writeFile(join(outDir, files.document), JSON.stringify(compiled.document, null, 2) + '\n');
  files.scene = `${compiled.asset.id}.scene.json`;
  await writeFile(join(outDir, files.scene), JSON.stringify({ sceneMap: compiled.sceneMap, hashes: compiled.hashes, diagnostics: compiled.diagnostics }, null, 2) + '\n');
  return summarize(compiled, docPath, outDir, files);
}

/**
 * inspect：编译 + 返回节点定位、能力声明、诊断与哈希；可选写预览与目标节点裁切图。
 */
export async function inspectFromFile(docPath, opts = {}) {
  const doc = await readStudioDocument(docPath);
  const compiled = compileStudioDocument(doc, { toolVersion: opts.toolVersion });
  const capabilities = describeCapabilities(compiled.document);
  let files = null;
  if (opts.outDir) {
    await ensureOutDir(opts.outDir);
    await writeMarker(opts.outDir, opts.generator ?? 'unknown');
    const views = buildViews(compiled, { displayScale: opts.displayScale, background: opts.background, node: opts.node });
    files = await writePreviews(opts.outDir, compiled, views, opts.node);
  } else if (opts.node !== undefined) {
    // 不写盘时也校验节点存在，保持行为一致
    buildViews(compiled, { node: opts.node });
  }
  const summary = summarize(compiled, docPath, opts.outDir ?? null, files);
  summary.constraints = compiled.document.constraints;
  summary.capabilities = capabilities;
  return summary;
}

/**
 * export：编译 + 落盘既有资产格式（.asset.json + 图集 PNG + 版本化 manifest）与可编辑源文档。
 */
export async function exportFromFile(docPath, outDir, opts = {}) {
  const doc = await readStudioDocument(docPath);
  const compiled = compileStudioDocument(doc, { toolVersion: opts.toolVersion });
  const { asset } = compiled;
  await ensureOutDir(outDir);
  await writeMarker(outDir, opts.generator ?? 'unknown');
  const files = {};
  files.asset = `${asset.id}.asset.json`;
  await writeFile(join(outDir, files.asset), JSON.stringify(assetToJSON(asset, { generator: opts.generator ?? 'unknown' })));
  const packed = packAtlas(asset.frames, { maxPage: opts.maxPage ?? 1024, margin: opts.margin ?? 2 });
  const frameMap = new Map(asset.frames.map((f) => [f.id, f]));
  const pagePainters = renderAtlasPages(packed, frameMap);
  files.pages = [];
  for (const [i, p] of pagePainters.entries()) {
    const name = `${asset.id}.page${i}.png`;
    await writeFile(join(outDir, name), encodePNG(p.w, p.h, p.toRGBA()));
    files.pages.push(name);
  }
  files.manifest = `${asset.id}.manifest.json`;
  const manifest = buildManifest(asset, packed, { generator: opts.generator ?? 'unknown', recipeVersion: compiled.document.schemaVersion });
  await writeFile(join(outDir, files.manifest), JSON.stringify(manifest, null, 2) + '\n');
  files.document = `${asset.id}.studio.json`;
  await writeFile(join(outDir, files.document), JSON.stringify(compiled.document, null, 2) + '\n');
  const summary = summarize(compiled, docPath, outDir, files);
  summary.manifest = { schemaVersion: manifest.schemaVersion, frames: manifest.frames.length, pages: manifest.pages.length };
  return summary;
}

export { stableStringify };
