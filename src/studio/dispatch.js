/**
 * studio/dispatch.js — 按文档 schemaVersion 分派编译/操作/检查（ADR-0008–0011）
 *
 * store 与 CLI 是文档类型无关的：修订/候选只存文档 JSON。
 * 这里集中决定一个文档是静态道具（pga-studio/1|2）还是角色（pga-studio/character/1），
 * 避免 store/CLI 各自判断一遍。新增文档类型时只改本文件。
 */
import { compileStudioDocument, describeCapabilities } from './compiler.js';
import { applyOperation, exploreOperation, operationFromExplore as propOperationFromExplore } from './operators.js';
import { checkCandidate, preserveFromDocument } from './protect.js';
import { compileCharacterDocument, checkCharacterCandidate } from './character-compiler.js';
import { describeCharacterCapabilities, CHARACTER_SCHEMA_VERSION } from './character-doc.js';
import { applyCharacterOperation, exploreCharacterOperation, operationFromExplore as characterOperationFromExplore } from './character-ops.js';

export function docKindOf(doc) {
  const v = doc?.schemaVersion;
  if (typeof v === 'string' && v.startsWith('pga-studio/character/')) return 'character';
  return 'prop';
}

export function compileAny(doc, opts = {}) {
  return docKindOf(doc) === 'character' ? compileCharacterDocument(doc, opts) : compileStudioDocument(doc, opts);
}

export function applyAnyOperation(doc, operation) {
  return docKindOf(doc) === 'character' ? applyCharacterOperation(doc, operation) : applyOperation(doc, operation);
}

export function exploreAnyOperation(doc, spec) {
  return docKindOf(doc) === 'character' ? exploreCharacterOperation(doc, spec) : exploreOperation(doc, spec);
}

/** 探索项 → 标准 operation（按文档类型分派；探索记录/候选身份/commit 重执行共用）。 */
export function operationFromAnyExplore(doc, spec, value) {
  return docKindOf(doc) === 'character' ? characterOperationFromExplore(spec, value) : propOperationFromExplore(spec, value);
}

export function checkAnyCandidate(args) {
  return docKindOf(args.baseCompiled.document) === 'character' ? checkCharacterCandidate(args) : checkCandidate(args);
}

export function describeAnyCapabilities(doc) {
  return docKindOf(doc) === 'character' ? describeCharacterCapabilities(doc) : describeCapabilities(doc);
}

export function preserveFromAnyDocument(doc) {
  // 角色与道具的 constraints 形状一致（{kind, target}），直接复用映射
  return preserveFromDocument(doc);
}

export { CHARACTER_SCHEMA_VERSION };
