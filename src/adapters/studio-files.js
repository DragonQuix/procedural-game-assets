/**
 * adapters/studio-files.js — Studio 文档/预览/导出的文件 IO（ADR-0001：IO 全在适配层）
 *
 * 两类入口：
 * - 文档模式（M1）：直接对单个 .studio.json 做 create/inspect/export；
 * - 工作区模式（M2）：对 StudioStore 的修订做 create/inspect/export，
 *   编辑候选、探索与提交在 adapters/studio-store.js。
 * 编辑逻辑（校验、编译、视图、保护）全部在 src/studio/ 纯核心；CLI 与本文件共享同一实现。
 */
import { readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { compileAny, describeAnyCapabilities } from '../studio/dispatch.js';
import { buildViews, buildCharacterViews } from '../studio/observe.js';
import { stableStringify } from '../studio/document.js';
import { assertProtection } from '../studio/protection-contract.js';
import { assertRelations, evaluateRelations } from '../studio/relations.js';
import { inspectSafeDomains } from '../studio/safe-domain.js';
import { writeObservationBundle } from './observation-files.js';
import { assetToJSON } from './asset-file.js';
import { encodePNG, decodePNG } from '../export/png.js';
import { createRasterDocument, RASTER_LIMITS, rgbaToHex, validateRasterRegion } from '../studio/raster-doc.js';
import { StudioOperationError } from '../studio/operators.js';
import { packAtlas, renderAtlasPages } from '../export/atlas.js';
import { buildManifest } from '../export/manifest.js';
import { StudioStore, ensureOutDir, writeMarker, StudioOverwriteError } from './studio-store.js';

export { StudioOverwriteError };

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
  if (compiled.kind === 'character') {
    files.frames = {};
    for (const fv of views.frames) {
      files.frames[fv.id] = { native: `${compiled.asset.id}.${fv.id}.native.png`, display: `${compiled.asset.id}.${fv.id}.display.png` };
      await writeFile(join(outDir, files.frames[fv.id].native), encodePNG(fv.native.width, fv.native.height, fv.native.rgba));
      await writeFile(join(outDir, files.frames[fv.id].display), encodePNG(fv.display.width, fv.display.height, fv.display.rgba));
    }
    if (views.playerHtml) {
      files.player = `${compiled.asset.id}.player.html`;
      await writeFile(join(outDir, files.player), views.playerHtml);
    }
    return files;
  }
  files.native = previewFileName('native', compiled);
  await writeFile(join(outDir, files.native), encodePNG(views.native.width, views.native.height, views.native.rgba));
  files.display = previewFileName('display', compiled);
  await writeFile(join(outDir, files.display), encodePNG(views.display.width, views.display.height, views.display.rgba));
  for (const kind of ['light', 'silhouette', 'selection']) {
    if (!views[kind]) continue;
    files[kind] = previewFileName(kind, compiled);
    const view = views[kind];
    await writeFile(join(outDir, files[kind]), encodePNG(view.width, view.height, view.rgba));
  }
  if (views.crop) {
    files.crop = previewFileName('crop', compiled, nodeId);
    await writeFile(join(outDir, files.crop), encodePNG(views.crop.width, views.crop.height, views.crop.rgba));
    const cropDisplay = views.target_crop.display;
    files.cropDisplay = previewFileName('crop-display', compiled, nodeId);
    await writeFile(join(outDir, files.cropDisplay), encodePNG(cropDisplay.width, cropDisplay.height, cropDisplay.rgba));
  }
  files.observation = `${compiled.asset.id}.observation.json`;
  await writeFile(join(outDir, files.observation), JSON.stringify(views.meta, null, 2) + '\n');
  return files;
}

function summarize(compiled, source, outDir, files) {
  if (compiled.kind === 'character') {
    return {
      assetId: compiled.asset.id,
      kind: compiled.asset.kind,
      seed: compiled.asset.seed,
      source,
      frames: compiled.frames,
      clips: compiled.asset.clips,
      hashes: compiled.hashes,
      diagnostics: compiled.diagnostics,
      outDir,
      files,
    };
  }
  return {
    assetId: compiled.asset.id,
    kind: compiled.asset.kind,
    seed: compiled.asset.seed,
    source,
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

/** 写可编辑源文档与帧信息（M1 起的路径与命名保持不变）。 */
async function writeSourceBundle(outDir, compiled) {
  const files = {};
  files.document = `${compiled.asset.id}.studio.json`;
  await writeFile(join(outDir, files.document), JSON.stringify(compiled.document, null, 2) + '\n');
  files.scene = `${compiled.asset.id}.scene.json`;
  const scene = compiled.kind === 'character' ? { frames: compiled.frames, clips: compiled.asset.clips } : { sceneMap: compiled.sceneMap };
  await writeFile(join(outDir, files.scene), JSON.stringify({ ...scene, hashes: compiled.hashes, diagnostics: compiled.diagnostics }, null, 2) + '\n');
  return files;
}

/** 按文档类型构建视图（角色多帧 / 道具单帧）。 */
function buildAnyViews(compiled, opts = {}) {
  return compiled.kind === 'character' ? buildCharacterViews(compiled, { ...opts, encode: encodePNG }) : buildViews(compiled, opts);
}

/**
 * create：校验 + 编译 + 初始化 Studio 工作区（r1 与 head）+ 落盘可编辑源文档、
 * sceneMap、native/display 预览。M1 的输出文件与字段保持不变，新增 head/workspace 字段。
 */
export async function createFromFile(docPath, outDir, opts = {}) {
  const doc = await readStudioDocument(docPath);
  return createFromDocument(doc, outDir, { ...opts, source: docPath });
}

export async function createFromDocument(doc, outDir, opts = {}) {
  const { store, revision, compiled } = await StudioStore.create(outDir, doc, {
    generator: opts.generator,
    toolVersion: opts.toolVersion,
    displayScale: opts.displayScale,
    background: opts.background,
  });
  const views = buildAnyViews(compiled, { displayScale: opts.displayScale, background: opts.background });
  const files = await writePreviews(outDir, compiled, views);
  Object.assign(files, await writeSourceBundle(outDir, compiled));
  const summary = summarize(compiled, opts.source ?? 'inline-document', outDir, files);
  summary.head = revision.revision;
  summary.workspace = outDir;
  return summary;
}

/** 在解码前限制 PNG 文件大小与 IHDR 尺寸，避免先分配任意大像素缓冲。 */
export async function readRasterPNG(path) {
  const size = (await stat(path)).size;
  if (size > 4 * 1024 * 1024) throw new StudioOperationError('RESOURCE_LIMIT', 'PNG 文件不能超过 4 MiB');
  const bytes = await readFile(path);
  if (bytes.length > 4 * 1024 * 1024 || bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new StudioOperationError('INVALID_DOCUMENT', '需要合法 PNG/IHDR');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (width < 1 || height < 1 || width > RASTER_LIMITS.dimension || height > RASTER_LIMITS.dimension) throw new StudioOperationError('RESOURCE_LIMIT', '位图首版只导入边长不超过 256 的 PNG；请先制作目标尺寸候选');
  // 不默默丢弃动画、颜色管理或方向信息。
  for (let offset = 8; offset < bytes.length;) {
    if (offset + 12 > bytes.length) throw new StudioOperationError('INVALID_DOCUMENT', 'PNG chunk 不完整');
    const length = bytes.readUInt32BE(offset), name = bytes.toString('ascii', offset + 4, offset + 8);
    if (offset + length + 12 > bytes.length) throw new StudioOperationError('INVALID_DOCUMENT', 'PNG chunk 越界');
    if (['acTL', 'iCCP', 'eXIf', 'cHRM'].includes(name) || name === 'gAMA' && (length !== 4 || bytes.readUInt32BE(offset + 8) !== 45455)) throw new StudioOperationError('UNSUPPORTED_SCOPE', `首版不解释 PNG ${name}，请显式转换为 sRGB 静态 PNG`);
    offset += length + 12;
  }
  return decodePNG(bytes);
}

export async function createRasterWorkspace(outDir, { id, width, height, image, anchor, attachments, ...opts }) {
  const bitmap = image ? await readRasterPNG(image) : null;
  if (bitmap && ((width !== undefined && bitmap.width !== width) || (height !== undefined && bitmap.height !== height))) throw new StudioOperationError('INVALID_DOCUMENT', '导入 PNG 与指定尺寸不符；create 不隐式缩放');
  const doc = createRasterDocument({ id, width: bitmap?.width ?? width, height: bitmap?.height ?? height, rgba: bitmap?.rgba, anchor, attachments });
  return createFromDocument(doc, outDir, { ...opts, source: image ?? 'blank-canvas' });
}

export async function rasterOperationWithImage(operation, image) {
  if (operation?.id !== 'raster.replace' || operation.params?.rgba !== undefined) throw new StudioOperationError('INVALID_DOCUMENT', '--image 只支持不含 rgba 的 raster.replace');
  const bitmap = await readRasterPNG(image), region = operation.params?.region;
  if (!region || bitmap.width !== region.w || bitmap.height !== region.h) throw new StudioOperationError('INVALID_DOCUMENT', '替换 PNG 尺寸必须与 region.w/h 相同');
  return { ...operation, params: { ...operation.params, rgba: rgbaToHex(bitmap.rgba) } };
}

/**
 * inspect（文档模式）：编译 + 返回节点定位、能力声明、诊断与哈希；可选写预览与目标节点裁切图。
 */
export async function inspectFromFile(docPath, opts = {}) {
  const doc = await readStudioDocument(docPath);
  const compiled = compileAny(doc, { toolVersion: opts.toolVersion });
  return inspectCompiled(compiled, docPath, opts);
}

/**
 * inspect（工作区模式）：编译指定修订（默认 head），其余同文档模式。
 */
export async function inspectWorkspace(wsDir, opts = {}) {
  const store = await StudioStore.open(wsDir, opts);
  await store._refreshHead(); // 新鲜度合同：默认修订取磁盘最新 head（R1）
  const revision = opts.revision ?? store.head;
  const compiled = await store._getCompiled(revision);
  const summary = await inspectCompiled(compiled, `workspace:${wsDir}#${revision}`, { ...opts, revision });
  summary.head = store.head;
  summary.revision = revision;
  summary.workspaceState = await store.state();
  return summary;
}

async function inspectCompiled(compiled, source, opts = {}) {
  if (opts.region !== undefined && compiled.kind !== 'raster') throw new StudioOperationError('UNSUPPORTED_SCOPE', 'region 只用于位图');
  const capabilities = describeAnyCapabilities(compiled.document);
  let files = null;
  if (opts.outDir) {
    await ensureOutDir(opts.outDir);
    await writeMarker(opts.outDir, opts.generator ?? 'unknown');
    const views = buildAnyViews(compiled, { displayScale: opts.displayScale, background: opts.background, node: opts.node, region: opts.region, revision: opts.revision });
    files = await writePreviews(opts.outDir, compiled, views, opts.node);
  } else if (opts.node !== undefined || opts.region !== undefined) {
    // 不写盘时也校验节点存在，保持行为一致（角色文档无节点裁切，--node 仅道具模式）
    if (compiled.kind !== 'character') buildViews(compiled, { node: opts.node, region: opts.region });
  }
  const summary = summarize(compiled, source, opts.outDir ?? null, files);
  summary.constraints = compiled.document.constraints;
  summary.protection = compiled.protection;
  summary.relations = evaluateRelations(compiled, { revision: opts.revision ?? null });
  summary.capabilities = capabilities;
  if (opts.node && ['pga-studio/3', 'pga-studio/4'].includes(compiled.document.schemaVersion)) summary.safeDomain = inspectSafeDomains(compiled, { revision: opts.revision ?? null, target: opts.node, maxSearch: opts.maxSearch, preserveRelations: opts.preserveRelations ?? false });
  return summary;
}

/** 导出核心：既有资产格式（.asset.json + 图集 PNG + 版本化 manifest）与可编辑源文档。 */
async function exportCompiled(compiled, source, outDir, opts = {}) {
  assertProtection(compiled);
  assertRelations(compiled);
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
  Object.assign(files, await writeSourceBundle(outDir, compiled));
  const summary = summarize(compiled, source, outDir, files);
  summary.manifest = { schemaVersion: manifest.schemaVersion, frames: manifest.frames.length, pages: manifest.pages.length };
  summary.protection = compiled.protection;
  summary.relations = evaluateRelations(compiled, { revision: opts.revision ?? null });
  return summary;
}

/** export（文档模式）。 */
export async function exportFromFile(docPath, outDir, opts = {}) {
  const doc = await readStudioDocument(docPath);
  const compiled = compileAny(doc, { toolVersion: opts.toolVersion });
  return exportCompiled(compiled, docPath, outDir, opts);
}

/** export（工作区模式）：导出指定修订（默认 head）。 */
export async function exportWorkspace(wsDir, outDir, opts = {}) {
  const store = await StudioStore.open(wsDir, opts);
  await store._refreshHead(); // 新鲜度合同：默认修订取磁盘最新 head（R1）
  const revision = opts.revision ?? store.head;
  const compiled = await store._getCompiled(revision);
  const summary = await exportCompiled(compiled, `workspace:${wsDir}#${revision}`, outDir, opts);
  summary.head = store.head;
  summary.revision = revision;
  return summary;
}

export { stableStringify };
// Studio 的 submit 是最终导出的同义入口，不再引入另一条编译链。
export const submitWorkspace = exportWorkspace;

export async function observeWorkspace(wsDir, outDir, { revision, candidateIds = [], node, region, displayScale = 4, ...opts } = {}) {
  const store = await StudioStore.open(wsDir, opts);
  await store._refreshHead();
  revision ??= store.head;
  if (!Array.isArray(candidateIds) || candidateIds.length > 16) throw new RangeError('观察最多 16 个已有候选');
  const base = await store._getCompiled(revision);
  if (base.kind === 'character') throw new RangeError('当前候选拼图入口只支持单帧；角色继续使用播放材料');
  if (region !== undefined && (base.kind !== 'raster' || node !== undefined)) throw new RangeError('region 只用于位图且不能与 node 同时使用');
  const cropRegion = region === undefined ? null : validateRasterRegion(region, base.asset.frames[0].width, base.asset.frames[0].height);
  const candidates = [], validation = { revision, head: store.head, candidates: [] };
  for (const candidateId of candidateIds) {
    try {
      const record = await store._readCandidate(candidateId);
      const candidateBase = record.baseRevision === revision ? base : await store._getCompiled(record.baseRevision);
      const { compiled, checks } = store._verifyCandidate(candidateId, record, candidateBase);
      const stale = record.baseRevision !== revision || record.baseRevision !== store.head;
      const status = stale ? 'STALE' : ['OK', 'UNCHANGED'].includes(checks.status) ? 'VALID' : 'REJECTED';
      const identity = { candidateId, revision: record.baseRevision, documentHash: compiled.hashes.documentHash, status };
      validation.candidates.push({ ...identity, displayed: status === 'VALID', protection: compiled.protection,
        checkStatus: checks.status, conflicts: checks.conflicts,
        ...(stale ? { reason: record.baseRevision !== revision ? 'BASE_REVISION_MISMATCH' : 'STALE_REVISION' } : {}) });
      if (status === 'VALID') candidates.push({ frame: compiled.asset.frames[0], identity });
    } catch (e) {
      validation.candidates.push({ candidateId, status: 'TAMPERED', displayed: false,
        error: { code: e.code ?? 'INVALID_CANDIDATE_RECORD', message: e.message }, conflicts: e.details?.conflicts ?? [] });
    }
  }
  const target = node ? base.sceneMap.nodes.find((n) => n.id === node) : null;
  if (node && !target) throw new RangeError('观察目标节点不存在');
  if (cropRegion) validation.region = cropRegion;
  return writeObservationBundle(outDir, { base: { frame: base.asset.frames[0], identity: { revision, documentHash: base.hashes.documentHash } }, candidates, crop: cropRegion ?? target?.frameRect, scale: displayScale, validation });
}
