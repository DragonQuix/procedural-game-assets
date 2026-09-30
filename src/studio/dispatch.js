/**
 * studio/dispatch.js — 按文档 schemaVersion 分派编译/操作/检查（ADR-0008–0011）
 *
 * store 与 CLI 是文档类型无关的：修订/候选只存文档 JSON。
 * 这里集中决定一个文档是静态道具（pga-studio/1|2）还是角色（pga-studio/character/1），
 * 避免 store/CLI 各自判断一遍。新增文档类型时只改本文件。
 */
import { compileStudioDocument, describeCapabilities } from './compiler.js';
import { applyOperation, exploreOperation, operationFromExplore as propOperationFromExplore } from './operators.js';
import { checkCandidate, preserveFromDocument, validatePreserve as validateLegacyPreserve } from './protect.js';
import { StudioDocumentError } from './document.js';
import { StudioOperationError } from './operators.js';
import { RASTER_SCHEMA_VERSION, compileRasterDocument, applyRasterOperation, checkRasterCandidate, describeRasterCapabilities, validateRasterPreserve } from './raster-doc.js';
import { compileCharacterDocument, checkCharacterCandidate } from './character-compiler.js';
import { describeCharacterCapabilities, CHARACTER_SCHEMA_VERSION } from './character-doc.js';
import { applyCharacterOperation, exploreCharacterOperation, operationFromExplore as characterOperationFromExplore } from './character-ops.js';

export function docKindOf(doc) {
  const v = doc?.schemaVersion;
  if (v === RASTER_SCHEMA_VERSION) return 'raster';
  if (v === CHARACTER_SCHEMA_VERSION) return 'character';
  if (['pga-studio/1', 'pga-studio/2', 'pga-studio/3', 'pga-studio/4'].includes(v)) return 'prop';
  throw new StudioDocumentError([{ code: 'INVALID_DOCUMENT', target: 'schemaVersion', message: `未知文档版本 ${JSON.stringify(v)}` }]);
}

export function compileAny(doc, opts = {}) {
  if (docKindOf(doc) === 'raster') return compileRasterDocument(doc, opts);
  return docKindOf(doc) === 'character' ? compileCharacterDocument(doc, opts) : compileStudioDocument(doc, opts);
}

export function applyAnyOperation(doc, operation) {
  if (docKindOf(doc) === 'raster') return applyRasterOperation(doc, operation);
  return docKindOf(doc) === 'character' ? applyCharacterOperation(doc, operation) : applyOperation(doc, operation);
}

export function exploreAnyOperation(doc, spec) {
  if (docKindOf(doc) === 'raster') throw new StudioOperationError('UNSUPPORTED_SCOPE', '位图首版不支持 explore；用多个 edit 候选和 observe 比较');
  return docKindOf(doc) === 'character' ? exploreCharacterOperation(doc, spec) : exploreOperation(doc, spec);
}

/** 探索项 → 标准 operation（按文档类型分派；探索记录/候选身份/commit 重执行共用）。 */
export function operationFromAnyExplore(doc, spec, value) {
  if (docKindOf(doc) === 'raster') throw new StudioOperationError('UNSUPPORTED_SCOPE', '位图首版不支持 explore');
  return docKindOf(doc) === 'character' ? characterOperationFromExplore(spec, value) : propOperationFromExplore(spec, value);
}

export function checkAnyCandidate(args) {
  if (docKindOf(args.baseCompiled.document) === 'raster') return checkRasterCandidate(args);
  return docKindOf(args.baseCompiled.document) === 'character' ? checkCharacterCandidate(args) : checkCandidate(args);
}

export function describeAnyCapabilities(doc) {
  if (docKindOf(doc) === 'raster') return describeRasterCapabilities(doc);
  return docKindOf(doc) === 'character' ? describeCharacterCapabilities(doc) : describeCapabilities(doc);
}

export function preserveFromAnyDocument(doc) {
  // 角色与道具的 constraints 形状一致（{kind, target}），直接复用映射
  return preserveFromDocument(doc);
}

export function validatePreserve(preserve, doc, kind = docKindOf(doc)) {
  return kind === 'raster' ? validateRasterPreserve(preserve, doc) : validateLegacyPreserve(preserve, doc, kind);
}

export { CHARACTER_SCHEMA_VERSION };
