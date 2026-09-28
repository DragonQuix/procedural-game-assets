/**
 * studio/character-ops.js — 角色受约束操作（ADR-0011）
 *
 *   palette.set  { target: '<调色板键>', value: '#rrggbb' }   资产级共享改色，传播到全部帧
 *   rig.set      { target: '<骨架标量>' 或 'guns.<aim>.<len|back>', value: 整数 }
 *                几何修改，经 solvePose 重解；接地由求解器自动保持
 *   art.set      { target: 'head'|'torso', value: string[] }   头部/装备 ASCII 部件替换
 *
 * 每个操作返回 plan.changedFields，键为带点路径（如 palette.V / rig.thigh / art.head），
 * 供跨帧候选检查独立核对。不做：姿态/剪辑编辑、任意骨架、逐帧覆盖（M5 最小面）。
 */
import { normalizeCharacterDocument, RIG_FIELD_SPECS, GUN_FIELD_SPECS } from './character-doc.js';
import { StudioDocumentError } from './document.js';
import { StudioOperationError } from './operators.js';

export const CHARACTER_OPERATION_IDS = Object.freeze(['palette.set', 'rig.set', 'art.set']);
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function fail(code, message, extra) {
  throw new StudioOperationError(code, message, extra);
}

function checkShape(operation) {
  if (operation === null || typeof operation !== 'object' || Array.isArray(operation)) fail('INVALID_DOCUMENT', '操作需要对象 { id, target, value }');
  for (const key of Object.keys(operation)) {
    if (!['id', 'target', 'value'].includes(key)) fail('INVALID_DOCUMENT', `操作含未知字段 '${key}'`, { target: operation.target ?? null });
  }
  if (!CHARACTER_OPERATION_IDS.includes(operation.id)) fail('UNSUPPORTED_OPERATION', `未知操作 '${operation.id}'（可用：${CHARACTER_OPERATION_IDS.join(', ')}）`, { target: operation.target ?? null });
  if (typeof operation.target !== 'string' || operation.target.length === 0) fail('INVALID_DOCUMENT', `操作 '${operation.id}' 需要非空 target`);
}

function renormalize(candidateDoc, opId, target) {
  try {
    return normalizeCharacterDocument(candidateDoc);
  } catch (e) {
    if (e instanceof StudioDocumentError) {
      fail('CANDIDATE_INVALID', `${opId} 使文档非法：${e.issues.map((i) => `${i.target}：${i.message}`).join('；')}`, { target, details: { issues: e.issues } });
    }
    throw e;
  }
}

/**
 * 应用一个角色操作。
 * @param {object} doc 角色文档（不改动输入）
 * @param {object} operation { id, target, value }
 * @returns {{ doc, plan: { id, target, changedFields } }}
 */
export function applyCharacterOperation(doc, operation) {
  const normalized = normalizeCharacterDocument(doc);
  checkShape(operation);
  const { id, target, value } = operation;
  const candidate = JSON.parse(JSON.stringify(normalized));
  let changedFields;

  if (id === 'palette.set') {
    if (!Object.hasOwn(normalized.palette, target)) fail('CANDIDATE_INVALID', `palette.set 目标键 '${target}' 不在调色板中（可用：${Object.keys(normalized.palette).sort().join(' ')}）`, { target });
    if (typeof value !== 'string' || !HEX_RE.test(value)) fail('CANDIDATE_INVALID', `palette.set 需要 '#rrggbb' 颜色值，收到 ${JSON.stringify(value)}`, { target });
    changedFields = { [`palette.${target}`]: { from: normalized.palette[target], to: value } };
    candidate.palette[target] = value;
  } else if (id === 'rig.set') {
    const gunMatch = target.match(/^guns\.([a-z][a-zA-Z0-9]{0,15})\.(len|back)$/);
    if (gunMatch) {
      const [, aim, field] = gunMatch;
      const gun = normalized.rig.guns[aim];
      if (!gun) fail('CANDIDATE_INVALID', `rig.set 目标方向 '${aim}' 不存在（可用：${Object.keys(normalized.rig.guns).join(', ')}）`, { target });
      const spec = GUN_FIELD_SPECS[field];
      if (!Number.isInteger(value) || value < spec.min || value > spec.max) fail('CANDIDATE_INVALID', `rig.set '${target}' 需要 [${spec.min}, ${spec.max}] 整数，收到 ${JSON.stringify(value)}`, { target });
      changedFields = { [`rig.guns.${aim}.${field}`]: { from: gun[field], to: value } };
      candidate.rig.guns[aim][field] = value;
    } else {
      const spec = RIG_FIELD_SPECS[target];
      if (!spec) fail('CANDIDATE_INVALID', `rig.set 目标 '${target}' 不可编辑（可用：${Object.keys(RIG_FIELD_SPECS).join(', ')} 或 guns.<方向>.<len|back>）`, { target });
      if (!Number.isInteger(value) || value < spec.min || value > spec.max) fail('CANDIDATE_INVALID', `rig.set '${target}' 需要 [${spec.min}, ${spec.max}] 整数，收到 ${JSON.stringify(value)}`, { target });
      changedFields = { [`rig.${target}`]: { from: normalized.rig[target], to: value } };
      candidate.rig[target] = value;
    }
  } else {
    // art.set
    if (target !== 'head' && target !== 'torso') fail('CANDIDATE_INVALID', `art.set 目标需为 'head' 或 'torso'，收到 '${target}'`, { target });
    if (!Array.isArray(value) || value.length < 1 || value.length > 16 || value.some((r) => typeof r !== 'string' || r.length > 16)) {
      fail('CANDIDATE_INVALID', 'art.set 需要 1–16 行、每行 ≤16 字符的字符串数组', { target });
    }
    for (const row of value) {
      for (const ch of row) {
        if (ch !== '.' && ch !== ' ' && !Object.hasOwn(normalized.palette, ch)) fail('CANDIDATE_INVALID', `art.set 含调色板外字符 '${ch}'`, { target });
      }
    }
    changedFields = { [`art.${target}`]: { from: normalized.art[target], to: [...value] } };
    candidate.art[target] = [...value];
  }

  const newDoc = renormalize(candidate, id, target);
  return { doc: newDoc, plan: { id, target, changedFields } };
}

/**
 * 角色同基准探索：一个操作目标取有限个值。
 * @param {object} doc 基准文档
 * @param {object} spec { id, target, values }
 */
export function exploreCharacterOperation(doc, spec) {
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) fail('INVALID_DOCUMENT', '探索需要对象 { id, target, values }');
  if (!Array.isArray(spec.values) || spec.values.length < 1) fail('INVALID_DOCUMENT', '探索需要非空 values 数组');
  if (spec.values.length > 16) fail('RESOURCE_LIMIT', `探索取值 ${spec.values.length} 超过上限 16`);
  for (const key of Object.keys(spec)) {
    if (!['id', 'target', 'values'].includes(key)) fail('INVALID_DOCUMENT', `探索含未知字段 '${key}'`);
  }
  const out = [];
  for (const value of spec.values) {
    try {
      const { doc: d, plan } = applyCharacterOperation(doc, { id: spec.id, target: spec.target, value });
      out.push({ value, doc: d, plan });
    } catch (e) {
      if (e instanceof StudioOperationError) out.push({ value, error: { code: e.code, message: e.message } });
      else throw e;
    }
  }
  return out;
}
