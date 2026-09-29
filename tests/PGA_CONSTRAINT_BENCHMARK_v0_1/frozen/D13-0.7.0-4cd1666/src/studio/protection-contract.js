/** 资产级合同：最终帧坐标；无 IO、无可执行文档字段。 */
import { stableStringify, documentHash } from './document.js';

const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const equal = (a, b) => stableStringify(a) === stableStringify(b);
const META = /^(anchor(\.[xy])?|attachments(\.[a-zA-Z][a-zA-Z0-9_]{0,31}(\.[xy])?)?|bounds(\.(x0|y0|x1|y1))?|width|height)$/;
const unsafe = new Set(['__proto__', 'constructor', 'prototype']);

export function metadataAt(frame, path) {
  return path.split('.').reduce((v, key) => v != null && Object.hasOwn(v, key) ? v[key] : undefined, frame);
}

/** baseline 必须为旧版、无合同文档，阻止递归基线与动态代码。 */
export function validateProtectionContract(contract, validateBaseline) {
  const issues = [];
  const bad = (target, message) => issues.push({ code: 'INVALID_DOCUMENT', target: `protection.${target}`, message });
  const keys = (v, allowed, target) => {
    if (!plain(v)) { bad(target, '需要普通 JSON 对象'); return false; }
    for (const k of Object.keys(v)) if (!allowed.includes(k)) bad(target, `未知字段 '${k}'`);
    return true;
  };
  if (!keys(contract, ['schemaVersion', 'coordinateSpace', 'baseline', 'protectedRegions', 'allowedMutationRegions', 'metadataPaths', 'nodeIds'], '(root)')) return issues;
  if (contract.schemaVersion !== 'pga-protection/1') bad('schemaVersion', '需要 pga-protection/1');
  if (contract.coordinateSpace !== 'final-frame') bad('coordinateSpace', '需要 final-frame');
  const base = contract.baseline;
  if (!plain(base) || !['pga-studio/1', 'pga-studio/2'].includes(base.schemaVersion) || Object.hasOwn(base, 'protection')) {
    bad('baseline', '需要不含 protection 的 pga-studio/1 或 /2 冻结文档');
    return issues;
  }
  const baselineIssues = validateBaseline(base);
  if (baselineIssues.length) return issues.concat(baselineIssues.map((i) => ({ ...i, target: `protection.baseline.${i.target}` })));
  const pad = base.canvas.outline === null ? 0 : 1;
  const W = base.canvas.w + pad * 2, H = base.canvas.h + pad * 2;
  for (const field of ['protectedRegions', 'allowedMutationRegions']) {
    if (field === 'allowedMutationRegions' && contract[field] === undefined) continue;
    const list = contract[field];
    if (!Array.isArray(list) || list.length > 64) { bad(field, '需要最多 64 项的区域数组'); continue; }
    for (const [i, r] of list.entries()) {
      const at = `${field}[${i}]`;
      if (!keys(r, ['x', 'y', 'w', 'h', 'mask'], at)) continue;
      if (![r.x, r.y, r.w, r.h].every(Number.isInteger) || r.x < 0 || r.y < 0 || r.w < 1 || r.h < 1 || r.x + r.w > W || r.y + r.h > H) bad(at, `区域必须位于最终帧 ${W}x${H} 内（整数、右下排他）`);
      if (r.mask !== undefined && (!Array.isArray(r.mask) || r.mask.length !== r.w * r.h || r.mask.length > W * H || !r.mask.every((v) => v === 0 || v === 1))) bad(`${at}.mask`, 'mask 需为 w*h 个 0/1，按行排列');
    }
  }
  for (const field of ['metadataPaths', 'nodeIds']) {
    const list = contract[field];
    if (!Array.isArray(list) || list.length > 64 || new Set(list).size !== list.length) { bad(field, '需要最多 64 个不重复字符串'); continue; }
    for (const value of list) {
      if (typeof value !== 'string' || (field === 'nodeIds' ? !base.nodes.some((n) => n.id === value) : !META.test(value) || value.split('.').some((k) => unsafe.has(k)))) bad(field, `未知保护目标 ${JSON.stringify(value)}`);
      if (field === 'metadataPaths' && typeof value === 'string' && value.startsWith('attachments.') && !Object.hasOwn(base.attachments ?? {}, value.split('.')[1])) bad(field, `基线缺少附件点 ${value}`);
    }
  }
  return issues;
}

function contains(region, x, y) {
  return x >= region.x && y >= region.y && x < region.x + region.w && y < region.y + region.h && (region.mask === undefined || region.mask[(y - region.y) * region.w + x - region.x] === 1);
}

/** 每类保护独立计算、AND 聚合；不相信 operator footprint 或候选自报状态。 */
export function checkAssetProtection(contract, baselineCompiled, candidateCompiled, context = {}) {
  if (!contract) return { status: 'NOT_CONFIGURED', conflicts: [] };
  const conflicts = [];
  const base = baselineCompiled.asset.frames[0], next = candidateCompiled.asset.frames[0];
  const detail = (protectionType, fields) => ({
    kind: protectionType, protectionType, affectedNode: context.target ?? null,
    operator: context.operator ?? null, revision: context.revision ?? null,
    documentHash: candidateCompiled.hashes.documentHash,
    suggestedInspectAction: 'inspect --ws <workspace> --revision <base> --node <affectedNode>',
    ...fields,
  });
  if (!equal(contract, candidateCompiled.document.protection)) conflicts.push(detail('contract', { message: '保护合同被修改或移除' }));
  const sizeChanged = base.width !== next.width || base.height !== next.height || base.id !== next.id;
  if (sizeChanged) conflicts.push(detail('frameSize', { message: '最终帧身份或尺寸与保护基线不符' }));
  let changedPixelCount = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  if (!sizeChanged) {
    for (let y = 0; y < base.height; y++) for (let x = 0; x < base.width; x++) {
      const i = (y * base.width + x) * 4;
      const changed = [0, 1, 2, 3].some((c) => base.rgba[i + c] !== next.rgba[i + c]);
      const protectedPixel = contract.protectedRegions.some((r) => contains(r, x, y)) ||
        (contract.allowedMutationRegions !== undefined && !contract.allowedMutationRegions.some((r) => contains(r, x, y)));
      if (changed && protectedPixel) {
        changedPixelCount++;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
      }
    }
  }
  if (changedPixelCount) conflicts.push(detail('pixels', { changedPixelCount, changedBounds: { x0, y0, x1, y1 }, message: `${changedPixelCount} 个最终 RGBA 像素违反资产级合同` }));
  for (const path of contract.metadataPaths) {
    if (!equal(metadataAt(base, path), metadataAt(next, path))) conflicts.push(detail('metadata', { path, before: metadataAt(base, path), after: metadataAt(next, path), message: `最终帧元数据 ${path} 改变` }));
  }
  for (const id of contract.nodeIds) {
    if (!equal(baselineCompiled.document.nodes.find((n) => n.id === id), candidateCompiled.document.nodes.find((n) => n.id === id))) conflicts.push(detail('node', { affectedNode: id, message: `受保护节点 ${id} 的语义数据改变` }));
  }
  return { status: conflicts.length ? 'REJECTED' : 'PASS', contractHash: documentHash(contract), baselineDocumentHash: baselineCompiled.hashes.documentHash, baselineRenderHash: baselineCompiled.hashes.renderHash, changedPixelCount, conflicts };
}

export function assertProtection(compiled) {
  if (compiled.protection?.status !== 'REJECTED') return;
  const error = new Error('最终编译未通过资产级保护合同');
  error.code = 'PROTECTION_VIOLATION';
  error.details = compiled.protection;
  throw error;
}
