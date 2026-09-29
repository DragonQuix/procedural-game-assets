/** 修订绑定的单变量条件域；有限枚举 + 真编译，无 IO 或全局缓存。 */
import { compileAny, applyAnyOperation, checkAnyCandidate, preserveFromAnyDocument, validatePreserve } from './dispatch.js';
import { documentHash } from './document.js';
import { StudioOperationError, GEOMETRY_TRANSFORMS } from './operators.js';

export const SAFE_LIMITS = Object.freeze({ maxSearch: 1024, maxPixelWork: 32_000_000 });
export const isGeometryOperation = (id) => id === 'geometry.set' || GEOMETRY_TRANSFORMS.includes(id);
const fail = (code, message, details) => { throw new StudioOperationError(code, message, { details }); };

export function compressValues(values) {
  const sorted = [...new Set(values)].sort((a, b) => a - b), intervals = [];
  for (const value of sorted) {
    const last = intervals.at(-1);
    if (last && value === last[1] + 1) last[1] = value;
    else intervals.push([value, value]);
  }
  return { intervals, values: sorted };
}

export function theoreticalRange(doc, target, operator, field) {
  const n = doc.nodes?.find((n) => n.id === target);
  if (!n) fail('UNSUPPORTED', 'safe domain 需要道具节点', { target });
  const W = doc.canvas.w, H = doc.canvas.h;
  if (operator === 'geometry.set') {
    const fields = ['panel', 'screen'].includes(n.kind) ? { x: [0, W - 1], y: [0, H - 1], w: [1, W], h: [1, H] } : n.kind === 'disc' ? { cx: [0, W], cy: [0, H], rx: [1, W], ry: [1, H] } : {};
    if (!fields[field]) fail('UNSUPPORTED', '只枚举整数标量几何，不枚举顶点数组');
    return fields[field];
  }
  if (!GEOMETRY_TRANSFORMS.includes(operator) || !['panel', 'screen'].includes(n.kind)) fail('UNSUPPORTED', '该节点或操作没有语义变换安全域');
  const fields = operator === 'widen_about_center' ? { deltaWidth: [1 - n.w, W - n.w] } : operator === 'squash_keep_base' ? { deltaHeight: [1 - n.h, 0] } : { deltaWidth: [1 - n.w, W - n.w], deltaHeight: [1 - n.h, H - n.h], targetWidth: [1, W], targetHeight: [1, H] };
  if (!fields[field]) fail('UNSUPPORTED', '该变换不支持此枚举字段');
  return fields[field];
}

export function evaluateSafeOperation(compiled, operation, { revision = null, preserve = preserveFromAnyDocument(compiled.document) } = {}) {
  let trialCompiles = 0;
  try {
    const { doc, plan } = applyAnyOperation(compiled.document, operation);
    trialCompiles++;
    const candidate = compileAny(doc);
    const checks = checkAnyCandidate({ baseCompiled: compiled, candidateCompiled: candidate, plan, preserve, revision });
    return { legal: ['OK', 'UNCHANGED'].includes(checks.status), reason: checks.code, conflicts: checks.conflicts, checks, trialCompiles };
  } catch (e) {
    return { legal: false, reason: e.code ?? 'COMPILE_ERROR', error: { code: e.code ?? 'COMPILE_ERROR', name: e.name, message: e.message }, trialCompiles };
  }
}

export function enumerateSafeDomain({ compiled, revision = null, operator, target, field, params = {}, preserve = preserveFromAnyDocument(compiled.document), maxSearch = 512 }) {
  preserve = validatePreserve(preserve, compiled.document);
  const range = theoreticalRange(compiled.document, target, operator, field);
  const count = range[1] - range[0] + 1;
  const pixelWork = count * compiled.asset.frames[0].width * compiled.asset.frames[0].height * compiled.document.nodes.length;
  if (!Number.isInteger(maxSearch) || maxSearch < 1 || maxSearch > SAFE_LIMITS.maxSearch || count > maxSearch || pixelWork > SAFE_LIMITS.maxPixelWork) fail('SEARCH_LIMIT', '安全域搜索超过显式上限；没有返回部分域冒充完整域', { count, maxSearch, pixelWork, limits: SAFE_LIMITS });
  const values = [], rejected = [];
  let trialCompiles = 0;
  for (let value = range[0]; value <= range[1]; value++) {
    const result = evaluateSafeOperation(compiled, { id: operator, target, params: { ...params, [field]: value } }, { revision, preserve });
    trialCompiles += result.trialCompiles;
    if (result.legal) values.push(value);
    else rejected.push({ value, reason: result.reason, ...(result.error ? { error: result.error } : { conflicts: result.conflicts }) });
  }
  return {
    status: 'COMPLETE', revision, documentHash: compiled.hashes.documentHash, contractHash: compiled.protection?.contractHash ?? null,
    operator, target, field, fixedParams: params, theoreticalRange: range, safeRange: compressValues(values),
    constraints: { document: compiled.document.constraints, contract: compiled.protection?.status ?? 'NOT_CONFIGURED', preserve },
    condition: '仅此字段变化，其余参数固定；不同域的笛卡尔积不保证安全',
    cacheKey: documentHash([revision, compiled.document, operator, target, field, params, preserve]),
    cache: 'disabled', search: { tested: count, maxSearch, trialCompiles, pixelWork }, rejected,
  };
}

export function inspectSafeDomains(compiled, { revision = null, target, maxSearch = 512 } = {}) {
  const n = compiled.document.nodes?.find((node) => node.id === target);
  if (!n) fail('UNSUPPORTED', 'safe inspect 需要有效目标节点');
  const build = (operator, field, params = {}) => {
    try { return enumerateSafeDomain({ compiled, revision, operator, target, field, params, maxSearch }); }
    catch (e) { return { status: e.code ?? 'ERROR', error: e.message, details: e.details }; }
  };
  const fields = ['panel', 'screen'].includes(n.kind) ? ['x', 'y', 'w', 'h'] : n.kind === 'disc' ? ['cx', 'cy', 'rx', 'ry'] : [];
  return { revision, documentHash: compiled.hashes.documentHash, fields: Object.fromEntries(fields.map((field) => [field, build('geometry.set', field)])),
    recommendedTransforms: ['panel', 'screen'].includes(n.kind) ? {
      widen_about_center: build('widen_about_center', 'deltaWidth'),
      squash_keep_base: build('squash_keep_base', 'deltaHeight'),
      resize_about_anchor: build('resize_about_anchor', 'targetWidth', { anchor: 'bottom-center' }),
    } : { status: 'UNSUPPORTED' },
  };
}

/** 不信任请求附带的合法值表；只消费身份绑定，并在当前文档上重算。 */
export function validateSafeBinding(binding, compiled, revision, operation) {
  if (binding === undefined) return;
  if (!binding || binding.revision !== revision || binding.documentHash !== compiled.hashes.documentHash || binding.operator !== operation.id || binding.target !== operation.target) fail('STALE_SAFE_DOMAIN', 'safe domain 的修订/文档/操作/目标不匹配；请重新 inspect');
}

export function preflightGeometry(compiled, operation, options = {}) {
  if (compiled.document.schemaVersion !== 'pga-studio/3' || !isGeometryOperation(operation.id)) return null;
  const fields = Object.keys(operation.params ?? {}).filter((k) => k !== 'anchor');
  // 不支持的类型/参数由原 operator 返回明确错误，不降级处理。
  if (GEOMETRY_TRANSFORMS.includes(operation.id) && !['panel', 'screen'].includes(compiled.document.nodes.find((n) => n.id === operation.target)?.kind)) fail('UNSUPPORTED', '语义变换只支持 panel/screen');
  let domain;
  if (fields.length === 1 && fields[0] !== 'vertices') {
    const field = fields[0], params = { ...operation.params }; delete params[field];
    domain = enumerateSafeDomain({ compiled, operator: operation.id, target: operation.target, field, params, ...options });
    const requestedValue = operation.params[field];
    if (domain.safeRange.values.includes(requestedValue)) return { status: 'SAFE', validation: domain.search };
    const diagnosis = domain.rejected.find((r) => r.value === requestedValue) ?? { reason: 'OUTSIDE_THEORETICAL_RANGE' };
    return { status: 'REJECTED_UNSAFE', requestedValue, safeDomain: domain, validation: domain.search, reason: diagnosis.reason, conflicts: diagnosis.conflicts ?? [],
      nearestLegalValues: [...domain.safeRange.values].sort((a, b) => Math.abs(a - requestedValue) - Math.abs(b - requestedValue) || a - b).slice(0, 3),
      recommendedTransform: field === 'h' || field === 'y' ? 'squash_keep_base' : 'widen_about_center' };
  }
  const result = evaluateSafeOperation(compiled, operation, options);
  const validation = { tested: 1, trialCompiles: result.trialCompiles };
  return result.legal ? { status: 'SAFE', validation } : { status: 'REJECTED_UNSAFE', requestedValue: operation.params, validation,
    safeDomain: { status: 'POINT_CHECK', revision: options.revision ?? null, documentHash: compiled.hashes.documentHash, legal: false },
    reason: result.reason, conflicts: result.conflicts ?? [], checks: result.checks, error: result.error,
    nearestLegalValues: [], recommendedTransform: 'resize_about_anchor' };
}
