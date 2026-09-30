/**
 * studio/operators.js — 有限的受约束文档变换（纯核心，ADR-0008/0009）
 *
 * 首版三个真实操作（不得冒充的能力见各注释）：
 *   geometry.set  { target, params: {x?, y?, w?, h?} }  修改节点已声明的整数几何参数（px）
 *   material.set  { target, material }                  在该节点类型已实现的材质规则间切换
 *   ramp.set      { target, ramp }                      为节点选择风格包中已定义的色阶
 *
 * 每个操作：只改目标节点的白名单字段，产出新的规范化文档（不改动输入），
 * 并返回 plan（目标、变更字段、旧/新值），供 protect.js 独立计算允许影响区域。
 * 不做：任意形状变形、任意网格/网格点编辑、多节点联动、风格内容修改。
 */
import { normalizeStudioDocument, StudioDocumentError, GEOMETRY_FIELDS, materialsFor } from './document.js';
import { resolveRelations } from './relation-resolution.js';

export const GEOMETRY_TRANSFORMS = Object.freeze(['widen_about_center', 'squash_keep_base', 'resize_about_anchor']);
export const OPERATION_IDS = Object.freeze(['geometry.set', 'material.set', 'ramp.set', ...GEOMETRY_TRANSFORMS]);
const SCALAR_GEOMETRY_FIELDS = Object.freeze(['x', 'y', 'w', 'h', 'cx', 'cy', 'rx', 'ry']);

/** 操作/候选级错误：code 区分 UNSUPPORTED_OPERATION / CANDIDATE_INVALID。 */
export class StudioOperationError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'StudioOperationError';
    this.code = code;
    this.target = extra.target ?? null;
    this.details = extra.details ?? null;
    this.retryable = extra.retryable ?? false;
    this.suggestedNextAction = extra.suggestedNextAction ?? null;
  }
}

function fail(code, message, extra) {
  throw new StudioOperationError(code, message, extra);
}

function findNode(doc, target, opId) {
  const node = doc.nodes.find((n) => n.id === target);
  if (!node) fail('CANDIDATE_INVALID', `${opId} 目标节点不存在：'${target}'`, { target, suggestedNextAction: '用 inspect 查看当前节点列表' });
  return node;
}

function checkOperationShape(operation) {
  if (operation === null || typeof operation !== 'object' || Array.isArray(operation)) {
    fail('INVALID_DOCUMENT', '操作需要对象 { id, target, ... }');
  }
  for (const key of Object.keys(operation)) {
    if (!['id', 'target', 'params', 'material', 'ramp', 'preserveRelations'].includes(key)) {
      fail('INVALID_DOCUMENT', `操作含未知字段 '${key}'`, { target: operation.target ?? null });
    }
  }
  if (!OPERATION_IDS.includes(operation.id)) {
    fail('UNSUPPORTED_OPERATION', `未知操作 '${operation.id}'（可用：${OPERATION_IDS.join(', ')}）`, { target: operation.target ?? null });
  }
  if (typeof operation.target !== 'string' || operation.target.length === 0) {
    fail('INVALID_DOCUMENT', `操作 '${operation.id}' 需要非空 target`, { target: null });
  }
  if (operation.preserveRelations !== undefined && (!GEOMETRY_TRANSFORMS.includes(operation.id) ||
      !(typeof operation.preserveRelations === 'boolean' || Array.isArray(operation.preserveRelations)))) {
    fail('INVALID_DOCUMENT', 'preserveRelations 只用于 semantic transform，值为 boolean 或关系 ID 数组');
  }
}

function cloneDocWithNode(doc, target, mutate) {
  return {
    ...doc,
    nodes: doc.nodes.map((n) => {
      if (n.id !== target) return { ...n };
      const next = { ...n };
      mutate(next);
      return next;
    }),
  };
}

function renormalize(candidateDoc, opId, target) {
  try {
    return normalizeStudioDocument(candidateDoc);
  } catch (e) {
    if (e instanceof StudioDocumentError) {
      fail('CANDIDATE_INVALID', `${opId} 使文档非法：${e.issues.map((i) => `${i.target}：${i.message}`).join('；')}`, {
        target,
        details: { issues: e.issues },
        suggestedNextAction: '用 inspect 的 capabilities 查看该节点允许的参数范围',
      });
    }
    throw e;
  }
}

function transformGeometry(node, operation) {
  const { id, params, target } = operation;
  if (!['panel', 'screen'].includes(node.kind)) fail('UNSUPPORTED', `${id} 不支持 ${node.kind}，不会退化为普通 resize`, { target });
  if (!params || typeof params !== 'object' || Array.isArray(params)) fail('INVALID_DOCUMENT', `${id} 需要 params`, { target });
  const allowed = id === 'widen_about_center' ? ['deltaWidth'] : id === 'squash_keep_base' ? ['deltaHeight'] : ['deltaWidth', 'deltaHeight', 'targetWidth', 'targetHeight', 'anchor'];
  for (const key of Object.keys(params)) if (!allowed.includes(key)) fail('INVALID_DOCUMENT', `${id} 未知参数 ${key}`, { target });
  const size = (axis, current) => {
    const delta = params[`delta${axis}`], absolute = params[`target${axis}`];
    if (delta !== undefined && absolute !== undefined) fail('INVALID_DOCUMENT', `${axis} 的 delta 与 target 不能同时指定`, { target });
    if ([delta, absolute].some((v) => v !== undefined && !Number.isInteger(v))) fail('CANDIDATE_INVALID', '尺寸参数需要整数', { target });
    return absolute ?? current + (delta ?? 0);
  };
  if (id === 'widen_about_center' && !Number.isInteger(params.deltaWidth)) fail('INVALID_DOCUMENT', '需要 deltaWidth 整数', { target });
  if (id === 'squash_keep_base' && (!Number.isInteger(params.deltaHeight) || params.deltaHeight > 0)) fail('INVALID_DOCUMENT', '需要 deltaHeight <= 0 整数', { target });
  if (id === 'resize_about_anchor' && !['deltaWidth', 'deltaHeight', 'targetWidth', 'targetHeight'].some((k) => params[k] !== undefined)) fail('INVALID_DOCUMENT', 'resize 至少需要一个尺寸参数', { target });
  const presets = { center: { x: 0.5, y: 0.5 }, 'bottom-center': { x: 0.5, y: 1 }, 'top-left': { x: 0, y: 0 } };
  const rawAnchor = id === 'widen_about_center' ? 'center' : id === 'squash_keep_base' ? 'bottom-center' : params.anchor;
  const anchor = typeof rawAnchor === 'string' ? presets[rawAnchor] : rawAnchor;
  if (!anchor || typeof anchor !== 'object' || Array.isArray(anchor) || Object.keys(anchor).some((k) => !['x', 'y'].includes(k)) || ![anchor.x, anchor.y].every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)) fail('INVALID_DOCUMENT', 'anchor 需为 center / bottom-center / top-left 或局部 normalized {x,y}', { target });
  const oldGeometry = { x: node.x, y: node.y, w: node.w, h: node.h };
  const w = size('Width', node.w), h = size('Height', node.h);
  const anchorPoint = { x: node.x + node.w * anchor.x, y: node.y + node.h * anchor.y };
  const newGeometry = { x: anchorPoint.x - w * anchor.x, y: anchorPoint.y - h * anchor.y, w, h };
  if (!Object.values(newGeometry).every(Number.isInteger)) fail('REJECTED_UNSAFE', '整数像素无法精确保留锚点；不做取整或中心漂移', { target, details: { oldGeometry, newGeometry, anchorPoint } });
  const delta = Object.fromEntries(Object.keys(oldGeometry).map((k) => [k, newGeometry[k] - oldGeometry[k]]));
  return { oldGeometry, newGeometry, delta, anchor: { ...anchor }, anchorPoint,
    preservedInvariant: id === 'widen_about_center' ? 'centerX' : id === 'squash_keep_base' ? 'bottomY' : 'anchorPoint' };
}

/**
 * 应用一个受约束操作。
 * @param {object} doc 规范化（或可规范化的）Studio 文档；不会被修改
 * @param {object} operation { id, target, params? / material? / ramp? }
 * @returns {{ doc: object, plan: { id, target, changedFields: Record<string,{from,to}> } }}
 */
export function applyOperation(doc, operation) {
  const normalized = normalizeStudioDocument(doc); // 基准合法性先行；返回新对象，不改输入
  checkOperationShape(operation);
  const { id, target } = operation;
  const node = findNode(normalized, target, id);
  let candidate;
  let changedFields;
  let geometry;

  if (GEOMETRY_TRANSFORMS.includes(id)) {
    geometry = transformGeometry(node, operation);
    changedFields = Object.fromEntries(Object.entries(geometry.newGeometry).filter(([k, v]) => v !== node[k]).map(([k, v]) => [k, { from: node[k], to: v }]));
    candidate = cloneDocWithNode(normalized, target, (next) => Object.assign(next, geometry.newGeometry));
  } else if (id === 'geometry.set') {
    const params = operation.params;
    if (params === null || typeof params !== 'object' || Array.isArray(params)) fail('INVALID_DOCUMENT', 'geometry.set 需要 params 对象', { target });
    const entries = Object.entries(params);
    if (entries.length === 0) fail('CANDIDATE_INVALID', 'geometry.set 至少修改一个几何字段', { target, suggestedNextAction: '提供如 {"w": 28} 的 params' });
    const allowed = GEOMETRY_FIELDS[node.kind] ?? [];
    changedFields = {};
    for (const [field, value] of entries) {
      if (!allowed.includes(field)) fail('CANDIDATE_INVALID', `geometry.set：类型 '${node.kind}' 不支持字段 '${field}'（可用：${allowed.join(', ')}）`, { target });
      if (field === 'vertices') {
        if (!Array.isArray(value) || value.length < 3 || value.length > 8 || !value.every((pt) => Array.isArray(pt) && pt.length === 2 && pt.every(Number.isInteger))) {
          fail('CANDIDATE_INVALID', `geometry.set 字段 'vertices' 需要 3–8 个 [x,y] 整数对`, { target });
        }
        changedFields[field] = { from: node.vertices, to: value.map((pt) => [...pt]) };
      } else if (SCALAR_GEOMETRY_FIELDS.includes(field)) {
        if (!Number.isInteger(value)) fail('CANDIDATE_INVALID', `geometry.set 字段 '${field}' 需要整数 px，收到 ${JSON.stringify(value)}`, { target });
        changedFields[field] = { from: node[field], to: value };
      }
    }
    candidate = cloneDocWithNode(normalized, target, (next) => {
      for (const [field, value] of entries) next[field] = field === 'vertices' ? value.map((pt) => [...pt]) : value;
    });
  } else if (id === 'material.set') {
    const options = materialsFor(node.kind, normalized.schemaVersion);
    if (typeof operation.material !== 'string' || !options.includes(operation.material)) {
      fail('CANDIDATE_INVALID', `material.set：类型 '${node.kind}' 不支持材质 '${operation.material}'（可用：${options.join(', ')}）`, { target });
    }
    changedFields = { material: { from: node.material, to: operation.material } };
    candidate = cloneDocWithNode(normalized, target, (next) => {
      next.material = operation.material;
    });
  } else {
    // ramp.set：共享色阶名引用，或（/2）{ shades:[4色] } 局部覆盖
    const value = operation.ramp;
    if (typeof value === 'string') {
      if (!Object.hasOwn(normalized.style.ramps, value)) {
        fail('CANDIDATE_INVALID', `ramp.set：色阶 '${value}' 不在风格包中（可用：${Object.keys(normalized.style.ramps).join(', ')}）`, { target });
      }
      changedFields = { ramp: { from: node.ramp, to: value } };
      candidate = cloneDocWithNode(normalized, target, (next) => {
        next.ramp = value;
      });
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const shades = value.shades;
      if (!Array.isArray(shades) || shades.length !== 4 || !shades.every((c) => typeof c === 'string')) {
        fail('CANDIDATE_INVALID', `ramp.set 局部覆盖需要 { "shades": ["#rrggbb" × 4] }`, { target });
      }
      if (normalized.schemaVersion === 'pga-studio/1') fail('CANDIDATE_INVALID', 'ramp.set 局部覆盖需要 pga-studio/2 文档', { target });
      changedFields = { ramp: { from: node.ramp, to: { shades: [...shades] } } };
      candidate = cloneDocWithNode(normalized, target, (next) => {
        next.ramp = { shades: [...shades] };
      });
    } else {
      fail('CANDIDATE_INVALID', `ramp.set 需要色阶名或 { "shades": [...] } 局部覆盖，收到 ${JSON.stringify(value)}`, { target });
    }
  }

  let newDoc = renormalize(candidate, id, target);
  let resolution;
  if (operation.preserveRelations !== undefined && operation.preserveRelations !== false) {
    try { resolution = resolveRelations(newDoc, operation.preserveRelations, target); }
    catch (e) { if (e.code === 'RELATION_CONFLICT') fail(e.code, e.message, { target, details: e.details }); else throw e; }
    newDoc = renormalize(resolution.doc, id, target);
  }
  return { doc: newDoc, plan: { id, target, changedFields, ...(geometry ? { geometry } : {}),
    ...(resolution ? { changes: [{ target, changedFields }, ...resolution.changes], relationRepairs: resolution.repairs, selectedRelationIds: resolution.selectedRelationIds, relationTrialCompiles: resolution.trialCompiles } : {}) } };
}

/**
 * 探索项 → 标准 operation 的唯一转换（探索记录、候选身份哈希与 commit 重执行共用同一份）。
 * geometry.set → { id, target, params: { [field]: value } }；
 * material.set → { id, target, material: value }；ramp.set → { id, target, ramp: value }。
 */
export function operationFromExplore(spec, value) {
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) fail('INVALID_DOCUMENT', '探索需要对象 { id, target, field, values }');
  if (spec.id === 'geometry.set' || GEOMETRY_TRANSFORMS.includes(spec.id)) return { id: spec.id, target: spec.target, params: { ...spec.params, [spec.field]: value }, ...(spec.preserveRelations === undefined ? {} : { preserveRelations: spec.preserveRelations }) };
  if (spec.id === 'material.set') return { id: spec.id, target: spec.target, material: value };
  if (spec.id === 'ramp.set') return { id: spec.id, target: spec.target, ramp: value };
  fail('UNSUPPORTED_OPERATION', `未知操作 '${spec.id}'（可用：${OPERATION_IDS.join(', ')}）`, { target: spec.target ?? null });
}

/**
 * 同基准探索：对一个操作的一个字段取有限个值，逐值应用。
 * @param {object} doc 基准文档
 * @param {object} spec { id, target, field, values }
 * @returns {Array<{ value, doc, plan }>} 每个取值一个候选（非法取值以 { value, error } 返回，不中断整批）
 */
export function exploreOperation(doc, spec) {
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) fail('INVALID_DOCUMENT', '探索需要对象 { id, target, field, values }');
  if (!Array.isArray(spec.values) || spec.values.length < 1) fail('INVALID_DOCUMENT', '探索需要非空 values 数组');
  if (spec.values.length > 16) fail('RESOURCE_LIMIT', `探索取值 ${spec.values.length} 超过上限 16`);
  for (const key of Object.keys(spec)) {
    if (!['id', 'target', 'field', 'values', 'params', 'preserveRelations'].includes(key)) fail('INVALID_DOCUMENT', `探索含未知字段 '${key}'`);
  }
  if (!OPERATION_IDS.includes(spec.id)) fail('UNSUPPORTED_OPERATION', `未知操作 '${spec.id}'（可用：${OPERATION_IDS.join(', ')}）`, { target: spec.target ?? null });
  let fieldOk;
  if (spec.id === 'geometry.set') {
    const probe = normalizeStudioDocument(doc);
    const node = probe.nodes.find((n) => n.id === spec.target);
    const allowed = node ? (GEOMETRY_FIELDS[node.kind] ?? []) : SCALAR_GEOMETRY_FIELDS.concat('vertices');
    fieldOk = allowed.includes(spec.field);
  } else if (GEOMETRY_TRANSFORMS.includes(spec.id)) {
    fieldOk = (spec.id === 'widen_about_center' ? ['deltaWidth'] : spec.id === 'squash_keep_base' ? ['deltaHeight'] : ['deltaWidth', 'deltaHeight', 'targetWidth', 'targetHeight']).includes(spec.field);
  } else {
    fieldOk = spec.field === exploreFieldFor(spec.id);
  }
  if (!fieldOk) fail('CANDIDATE_INVALID', `操作 '${spec.id}' 不支持探索字段 '${spec.field}'`, { target: spec.target ?? null });
  const out = [];
  for (const value of spec.values) {
    const operation = operationFromExplore(spec, value);
    try {
      const { doc: d, plan } = applyOperation(doc, operation);
      out.push({ value, doc: d, plan });
    } catch (e) {
      if (e instanceof StudioOperationError) out.push({ value, error: { code: e.code, message: e.message } });
      else throw e;
    }
  }
  return out;
}

/** material.set / ramp.set 探索时 field 必须与操作匹配的校验（CLI/store 共用）。 */
export function exploreFieldFor(opId) {
  return opId === 'geometry.set' ? null : opId === 'material.set' ? 'material' : opId === 'ramp.set' ? 'ramp' : null;
}
