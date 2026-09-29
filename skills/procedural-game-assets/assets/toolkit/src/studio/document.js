/**
 * studio/document.js — Studio 可编辑文档：校验、规范化与稳定哈希（纯核心，ADR-0001/0008/0010）
 *
 * 文档只含可序列化数据：无函数、无 JS 字符串、无模块路径、无外部 URL。
 * 校验失败一律拒绝（INVALID_DOCUMENT），不静默修正、不猜测未知版本或字段。
 *
 * 版本词汇：
 * - pga-studio/1（冻结）：panel/screen 矩形节点（x/y/w/h），material ∈ flat|bevel-metal|scanlines，
 *   ramp 仅共享色阶名引用。
 * - pga-studio/2（ADR-0010 扩展）：新增 poly（3–8 整数顶点）与 disc（cx/cy/rx/ry）几何；
 *   panel/poly/disc 可用 shade-diag 体积概括材质；ramp 可为 { shades:[4色] } 局部覆盖；
 *   style 可带 meta（license/source/focusRamp/notes）。/1 文档行为不变，两版本共存。
 *
 * 公共形状：schemaVersion / id / seed / renderProfile(pixel-flat@1) / style / canvas(内画布) /
 * nodes（扁平 + layer 序）/ anchor? / attachments? / constraints?（M2 起强制执行）。
 * 随机命名空间 `studio/1:` 跨模式版本稳定（种子合同独立于模式版本）。
 */
import { DEFAULT_OUTLINE } from '../bake/frame.js';
import { validateProtectionContract } from './protection-contract.js';

export const SCHEMA_VERSIONS = Object.freeze(['pga-studio/1', 'pga-studio/2', 'pga-studio/3']);
export const STUDIO_SCHEMA_VERSION = SCHEMA_VERSIONS[0]; // 兼容引用：最旧支持版本
export const LATEST_SCHEMA_VERSION = SCHEMA_VERSIONS[SCHEMA_VERSIONS.length - 1];

const KINDS_V1 = Object.freeze(['panel', 'screen']);
export const NODE_KINDS = Object.freeze(['panel', 'screen', 'poly', 'disc']); // /2 全集
const MATERIALS_V1 = Object.freeze({
  panel: Object.freeze(['flat', 'bevel-metal']),
  screen: Object.freeze(['flat', 'scanlines']),
});
export const MATERIALS_BY_KIND = Object.freeze({
  panel: Object.freeze(['flat', 'bevel-metal', 'shade-diag']),
  screen: Object.freeze(['flat', 'scanlines']),
  poly: Object.freeze(['flat', 'shade-diag']),
  disc: Object.freeze(['flat', 'shade-diag']),
});
export const CONSTRAINT_KINDS = Object.freeze(['pixels', 'structure', 'metadata']);

/** 指定模式版本下某节点类型的材质白名单。 */
export function materialsFor(kind, schemaVersion) {
  if (schemaVersion === 'pga-studio/1') return MATERIALS_V1[kind] ?? [];
  return MATERIALS_BY_KIND[kind] ?? [];
}

/** 指定模式版本下的几何类型白名单。 */
export function kindsFor(schemaVersion) {
  return schemaVersion === 'pga-studio/1' ? KINDS_V1 : NODE_KINDS;
}

/** 各几何类型的几何字段（其余字段为公共字段）。 */
export const GEOMETRY_FIELDS = Object.freeze({
  panel: Object.freeze(['x', 'y', 'w', 'h']),
  screen: Object.freeze(['x', 'y', 'w', 'h']),
  poly: Object.freeze(['vertices']),
  disc: Object.freeze(['cx', 'cy', 'rx', 'ry']),
});

const LIMITS = Object.freeze({
  canvasMin: 2,
  canvasMax: 512,
  nodesMax: 64,
  rampsMax: 16,
  rampShades: 4,
  attachmentsMax: 32,
  constraintsMax: 32,
  verticesMin: 3,
  verticesMax: 8,
  metaStringMax: 200,
});

const ASSET_ID_RE = /^[a-z][a-z0-9._-]{0,63}$/;
const NODE_ID_RE = /^[a-z][a-z0-9]*(\.[a-z0-9_]+)+$/;
const RAMP_NAME_RE = /^[a-z][a-z0-9_]{0,31}$/;
const ATTACHMENT_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** 文档校验/规范化失败：issues 为结构化问题列表。 */
export class StudioDocumentError extends Error {
  constructor(issues) {
    super(`Studio 文档非法：${issues.map((i) => `${i.target}：${i.message}`).join('；')}`);
    this.name = 'StudioDocumentError';
    this.code = 'INVALID_DOCUMENT';
    this.issues = issues;
  }
}

function issue(code, target, message) {
  return { code, target, message };
}

function isPlainObject(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** 白名单键检查 + 危险键拒绝。返回问题列表。 */
function checkKeys(obj, allowed, target, issues, code = 'INVALID_DOCUMENT') {
  for (const key of Object.keys(obj)) {
    if (DANGEROUS_KEYS.has(key)) {
      issues.push(issue('UNSAFE_PATH', target, `危险键 '${key}' 被拒绝`));
    } else if (!allowed.includes(key)) {
      issues.push(issue(code, target, `未知字段 '${key}'`));
    }
  }
}

function checkFiniteNumber(v, target, issues, { integer = false, min = -Infinity, max = Infinity } = {}) {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    issues.push(issue('INVALID_DOCUMENT', target, `需要有限数字，收到 ${JSON.stringify(v)}`));
    return false;
  }
  if (integer && !Number.isInteger(v)) {
    issues.push(issue('INVALID_DOCUMENT', target, `需要整数，收到 ${v}`));
    return false;
  }
  if (v < min || v > max) {
    issues.push(issue('INVALID_DOCUMENT', target, `超出范围 [${min}, ${max}]：${v}`));
    return false;
  }
  return true;
}

function checkPoint(v, target, canvas, issues) {
  if (!isPlainObject(v)) {
    issues.push(issue('INVALID_DOCUMENT', target, '需要 {x, y} 对象'));
    return;
  }
  checkKeys(v, ['x', 'y'], target, issues);
  if (!checkFiniteNumber(v.x, `${target}.x`, issues, { min: 0, max: canvas.w })) return;
  checkFiniteNumber(v.y, `${target}.y`, issues, { min: 0, max: canvas.h });
}

function checkShades(ramp, target, issues) {
  if (!Array.isArray(ramp) || ramp.length !== LIMITS.rampShades) {
    issues.push(issue('INVALID_DOCUMENT', target, `色阶需为 ${LIMITS.rampShades} 级 '#rrggbb' 数组（shadow/base/light/highlight）`));
    return;
  }
  for (const [i, c] of ramp.entries()) {
    if (typeof c !== 'string' || !HEX_RE.test(c)) issues.push(issue('INVALID_DOCUMENT', `${target}[${i}]`, `非法颜色 ${JSON.stringify(c)}`));
  }
}

function validateRamps(style, issues) {
  const ramps = style.ramps;
  if (!isPlainObject(ramps)) {
    issues.push(issue('INVALID_DOCUMENT', 'style.ramps', '需要色阶表对象'));
    return;
  }
  const names = Object.keys(ramps);
  if (names.length < 1 || names.length > LIMITS.rampsMax) {
    issues.push(issue('RESOURCE_LIMIT', 'style.ramps', `色阶数量 ${names.length} 超出 [1, ${LIMITS.rampsMax}]`));
  }
  for (const name of names) {
    const target = `style.ramps.${name}`;
    if (DANGEROUS_KEYS.has(name)) {
      issues.push(issue('UNSAFE_PATH', 'style.ramps', `危险键 '${name}' 被拒绝`));
      continue;
    }
    if (!RAMP_NAME_RE.test(name)) issues.push(issue('INVALID_DOCUMENT', target, `非法色阶名 '${name}'`));
    checkShades(ramps[name], target, issues);
  }
}

function validateStyleMeta(style, version, issues) {
  if (style.meta === undefined) return;
  if (version === 'pga-studio/1') {
    issues.push(issue('INVALID_DOCUMENT', 'style.meta', `pga-studio/1 不支持 style.meta（需要 ${LATEST_SCHEMA_VERSION}）`));
    return;
  }
  if (!isPlainObject(style.meta)) {
    issues.push(issue('INVALID_DOCUMENT', 'style.meta', '需要对象 { license?, source?, focusRamp?, notes? }'));
    return;
  }
  checkKeys(style.meta, ['license', 'source', 'focusRamp', 'notes'], 'style.meta', issues);
  for (const key of ['license', 'source', 'notes']) {
    if (style.meta[key] !== undefined && (typeof style.meta[key] !== 'string' || style.meta[key].length > LIMITS.metaStringMax)) {
      issues.push(issue('INVALID_DOCUMENT', `style.meta.${key}`, `需要 ≤${LIMITS.metaStringMax} 字符字符串`));
    }
  }
  if (style.meta.focusRamp !== undefined) {
    const rampNames = isPlainObject(style.ramps) ? Object.keys(style.ramps) : [];
    if (typeof style.meta.focusRamp !== 'string' || !rampNames.includes(style.meta.focusRamp)) {
      issues.push(issue('INVALID_DOCUMENT', 'style.meta.focusRamp', `焦点色阶需为已声明色阶：${JSON.stringify(style.meta.focusRamp)}`));
    }
  }
}

function checkVertices(vertices, target, canvas, issues) {
  if (!Array.isArray(vertices) || vertices.length < LIMITS.verticesMin || vertices.length > LIMITS.verticesMax) {
    issues.push(issue('INVALID_DOCUMENT', target, `vertices 需为 ${LIMITS.verticesMin}–${LIMITS.verticesMax} 个顶点`));
    return;
  }
  for (const [i, pt] of vertices.entries()) {
    const ptTarget = `${target}[${i}]`;
    if (!Array.isArray(pt) || pt.length !== 2) {
      issues.push(issue('INVALID_DOCUMENT', ptTarget, '顶点需为 [x, y] 整数对'));
      continue;
    }
    checkFiniteNumber(pt[0], `${ptTarget}[0]`, issues, { integer: true, min: 0, max: canvas.w });
    checkFiniteNumber(pt[1], `${ptTarget}[1]`, issues, { integer: true, min: 0, max: canvas.h });
  }
}

function validateNodes(doc, canvas, version, issues) {
  const { nodes, style } = doc;
  if (!Array.isArray(nodes) || nodes.length < 1) {
    issues.push(issue('INVALID_DOCUMENT', 'nodes', '至少需要 1 个节点'));
    return;
  }
  if (nodes.length > LIMITS.nodesMax) issues.push(issue('RESOURCE_LIMIT', 'nodes', `节点数 ${nodes.length} 超过上限 ${LIMITS.nodesMax}`));
  const seen = new Set();
  const rampNames = isPlainObject(style?.ramps) ? new Set(Object.keys(style.ramps)) : new Set();
  const kinds = kindsFor(version);
  for (const [index, node] of nodes.entries()) {
    const target = `nodes[${index}]${isPlainObject(node) && typeof node.id === 'string' ? `(${node.id})` : ''}`;
    if (!isPlainObject(node)) {
      issues.push(issue('INVALID_DOCUMENT', `nodes[${index}]`, '节点需要对象'));
      continue;
    }
    checkKeys(node, ['id', 'kind', 'x', 'y', 'w', 'h', 'vertices', 'cx', 'cy', 'rx', 'ry', 'ramp', 'material', 'layer'], target, issues);
    if (typeof node.id !== 'string' || !NODE_ID_RE.test(node.id)) {
      issues.push(issue('INVALID_DOCUMENT', `${target}.id`, `节点 ID 需为点分命名（如 terminal.shell）：${JSON.stringify(node.id)}`));
    } else if (seen.has(node.id)) {
      issues.push(issue('INVALID_DOCUMENT', `${target}.id`, `节点 ID 重复：'${node.id}'`));
    }
    seen.add(node.id);
    if (!kinds.includes(node.kind)) {
      issues.push(issue('UNSUPPORTED_OPERATION', `${target}.kind`, `版本 ${version} 未知几何类型 '${node.kind}'（可用：${kinds.join(', ')}）`));
    }
    // 按类型的几何字段：该类型的字段必须齐全且合法，其他类型的几何字段不得出现
    const geomFields = GEOMETRY_FIELDS[node.kind] ?? [];
    for (const f of ['x', 'y', 'w', 'h', 'vertices', 'cx', 'cy', 'rx', 'ry']) {
      if (!geomFields.includes(f) && node[f] !== undefined) issues.push(issue('INVALID_DOCUMENT', `${target}.${f}`, `类型 '${node.kind}' 不含几何字段 '${f}'`));
    }
    if (node.kind === 'panel' || node.kind === 'screen') {
      const geomOk =
        checkFiniteNumber(node.x, `${target}.x`, issues, { integer: true, min: 0, max: canvas.w - 1 }) &
        checkFiniteNumber(node.y, `${target}.y`, issues, { integer: true, min: 0, max: canvas.h - 1 }) &
        checkFiniteNumber(node.w, `${target}.w`, issues, { integer: true, min: 1, max: canvas.w }) &
        checkFiniteNumber(node.h, `${target}.h`, issues, { integer: true, min: 1, max: canvas.h });
      if (geomOk) {
        if (node.x + node.w > canvas.w) issues.push(issue('INVALID_DOCUMENT', target, `节点右缘 ${node.x + node.w} 超出内画布宽 ${canvas.w}`));
        if (node.y + node.h > canvas.h) issues.push(issue('INVALID_DOCUMENT', target, `节点下缘 ${node.y + node.h} 超出内画布高 ${canvas.h}`));
      }
    } else if (node.kind === 'poly') {
      checkVertices(node.vertices, `${target}.vertices`, canvas, issues);
    } else if (node.kind === 'disc') {
      const geomOk =
        checkFiniteNumber(node.cx, `${target}.cx`, issues, { integer: true, min: 0, max: canvas.w }) &
        checkFiniteNumber(node.cy, `${target}.cy`, issues, { integer: true, min: 0, max: canvas.h }) &
        checkFiniteNumber(node.rx, `${target}.rx`, issues, { integer: true, min: 1, max: canvas.w }) &
        checkFiniteNumber(node.ry, `${target}.ry`, issues, { integer: true, min: 1, max: canvas.h });
      if (geomOk) {
        if (node.cx - node.rx < 0 || node.cx + node.rx > canvas.w) issues.push(issue('INVALID_DOCUMENT', target, `disc 水平范围 [${node.cx - node.rx}, ${node.cx + node.rx}] 超出内画布宽 ${canvas.w}`));
        if (node.cy - node.ry < 0 || node.cy + node.ry > canvas.h) issues.push(issue('INVALID_DOCUMENT', target, `disc 垂直范围 [${node.cy - node.ry}, ${node.cy + node.ry}] 超出内画布高 ${canvas.h}`));
      }
    }
    // ramp：共享色阶名引用，或（/2）{ shades } 局部覆盖
    if (typeof node.ramp === 'string') {
      if (!rampNames.has(node.ramp)) issues.push(issue('INVALID_DOCUMENT', `${target}.ramp`, `引用不存在的色阶 '${node.ramp}'`));
    } else if (isPlainObject(node.ramp)) {
      if (version === 'pga-studio/1') {
        issues.push(issue('INVALID_DOCUMENT', `${target}.ramp`, `pga-studio/1 的 ramp 仅支持共享色阶名引用（局部覆盖需要 ${LATEST_SCHEMA_VERSION}）`));
      } else {
        checkKeys(node.ramp, ['shades'], `${target}.ramp`, issues);
        checkShades(node.ramp.shades, `${target}.ramp.shades`, issues);
      }
    } else {
      issues.push(issue('INVALID_DOCUMENT', `${target}.ramp`, 'ramp 需为色阶名或 { shades } 局部覆盖'));
    }
    const materials = materialsFor(node.kind, version);
    if (!materials.includes(node.material)) {
      issues.push(issue('UNSUPPORTED_OPERATION', `${target}.material`, `版本 ${version} 的类型 '${node.kind}' 不支持材质 '${node.material}'（可用：${materials.join(', ')}）`));
    }
    if (node.layer !== undefined) checkFiniteNumber(node.layer, `${target}.layer`, issues, { integer: true, min: -1024, max: 1024 });
  }
}

function validateConstraints(doc, issues) {
  if (doc.constraints === undefined) return;
  if (!Array.isArray(doc.constraints)) {
    issues.push(issue('INVALID_DOCUMENT', 'constraints', '需要数组'));
    return;
  }
  if (doc.constraints.length > LIMITS.constraintsMax) issues.push(issue('RESOURCE_LIMIT', 'constraints', `保护项数量超过上限 ${LIMITS.constraintsMax}`));
  const nodeIds = new Set((Array.isArray(doc.nodes) ? doc.nodes : []).filter(isPlainObject).map((n) => n.id));
  for (const [i, c] of doc.constraints.entries()) {
    const target = `constraints[${i}]`;
    if (!isPlainObject(c)) {
      issues.push(issue('INVALID_DOCUMENT', target, '保护项需要对象'));
      continue;
    }
    checkKeys(c, ['kind', 'target', 'note'], target, issues);
    if (!CONSTRAINT_KINDS.includes(c.kind)) issues.push(issue('INVALID_DOCUMENT', `${target}.kind`, `未知保护类别 '${c.kind}'`));
    if (typeof c.target !== 'string' || c.target.length === 0) {
      issues.push(issue('INVALID_DOCUMENT', `${target}.target`, '需要非空目标字符串'));
    } else if (c.kind !== 'metadata' && !nodeIds.has(c.target)) {
      issues.push(issue('INVALID_DOCUMENT', `${target}.target`, `像素/结构保护目标需为已声明节点：'${c.target}'`));
    }
    if (c.note !== undefined && typeof c.note !== 'string') issues.push(issue('INVALID_DOCUMENT', `${target}.note`, 'note 需要字符串'));
  }
}

/**
 * 校验 Studio 文档。返回结构化问题数组（空数组 = 合法）。
 * 只校验，不修改输入；合法文档交由 normalizeStudioDocument 填默认值。
 */
export function validateStudioDocument(doc) {
  const issues = [];
  if (!isPlainObject(doc)) return [issue('INVALID_DOCUMENT', '(root)', '文档需要 JSON 对象')];
  checkKeys(doc, ['schemaVersion', 'id', 'seed', 'renderProfile', 'style', 'canvas', 'nodes', 'anchor', 'attachments', 'constraints', 'protection'], '(root)', issues);
  if (!SCHEMA_VERSIONS.includes(doc.schemaVersion)) {
    issues.push(issue('INVALID_DOCUMENT', 'schemaVersion', `未知版本 ${JSON.stringify(doc.schemaVersion)}，本校验器仅支持 ${SCHEMA_VERSIONS.map((v) => `'${v}'`).join(' 与 ')}`));
    return issues; // 版本不兼容时不继续猜测其余字段
  }
  const version = doc.schemaVersion;
  if (typeof doc.id !== 'string' || !ASSET_ID_RE.test(doc.id)) {
    issues.push(issue('INVALID_DOCUMENT', 'id', `资产 ID 需匹配 ${ASSET_ID_RE}：${JSON.stringify(doc.id)}`));
  }
  checkFiniteNumber(doc.seed, 'seed', issues, { integer: true, min: -Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER });
  // renderProfile
  if (!isPlainObject(doc.renderProfile)) {
    issues.push(issue('INVALID_DOCUMENT', 'renderProfile', '需要 { name, version } 对象'));
  } else {
    checkKeys(doc.renderProfile, ['name', 'version'], 'renderProfile', issues);
    if (doc.renderProfile.name !== 'pixel-flat' || doc.renderProfile.version !== 1) {
      issues.push(issue('INVALID_DOCUMENT', 'renderProfile', `未知渲染配置 ${JSON.stringify(doc.renderProfile.name)}@${JSON.stringify(doc.renderProfile.version)}（支持 pixel-flat@1）`));
    }
  }
  // style
  if (!isPlainObject(doc.style)) {
    issues.push(issue('INVALID_DOCUMENT', 'style', '需要 { id, version, ramps, meta? } 对象'));
  } else {
    checkKeys(doc.style, ['id', 'version', 'ramps', 'meta'], 'style', issues);
    if (typeof doc.style.id !== 'string' || doc.style.id.length === 0 || doc.style.id.length > 64) issues.push(issue('INVALID_DOCUMENT', 'style.id', '需要 1–64 字符风格 ID'));
    checkFiniteNumber(doc.style.version, 'style.version', issues, { integer: true, min: 1 });
    validateRamps(doc.style, issues);
    validateStyleMeta(doc.style, version, issues);
  }
  // canvas（先行校验，节点/锚点范围依赖它）
  const canvas = { w: 0, h: 0 };
  if (!isPlainObject(doc.canvas)) {
    issues.push(issue('INVALID_DOCUMENT', 'canvas', '需要 { w, h, outline? } 对象'));
  } else {
    checkKeys(doc.canvas, ['w', 'h', 'outline'], 'canvas', issues);
    checkFiniteNumber(doc.canvas.w, 'canvas.w', issues, { integer: true, min: LIMITS.canvasMin, max: LIMITS.canvasMax });
    checkFiniteNumber(doc.canvas.h, 'canvas.h', issues, { integer: true, min: LIMITS.canvasMin, max: LIMITS.canvasMax });
    canvas.w = Number.isInteger(doc.canvas.w) ? doc.canvas.w : 0;
    canvas.h = Number.isInteger(doc.canvas.h) ? doc.canvas.h : 0;
    if (doc.canvas.outline !== undefined && doc.canvas.outline !== null && (typeof doc.canvas.outline !== 'string' || !HEX_RE.test(doc.canvas.outline))) {
      issues.push(issue('INVALID_DOCUMENT', 'canvas.outline', `需要 '#rrggbb' 或 null：${JSON.stringify(doc.canvas.outline)}`));
    }
  }
  validateNodes(doc, canvas, version, issues);
  if (doc.anchor !== undefined) checkPoint(doc.anchor, 'anchor', canvas, issues);
  if (doc.attachments !== undefined) {
    if (!isPlainObject(doc.attachments)) {
      issues.push(issue('INVALID_DOCUMENT', 'attachments', '需要命名点表对象'));
    } else {
      const names = Object.keys(doc.attachments);
      if (names.length > LIMITS.attachmentsMax) issues.push(issue('RESOURCE_LIMIT', 'attachments', `附件点数量超过上限 ${LIMITS.attachmentsMax}`));
      for (const name of names) {
        if (DANGEROUS_KEYS.has(name)) {
          issues.push(issue('UNSAFE_PATH', 'attachments', `危险键 '${name}' 被拒绝`));
          continue;
        }
        if (!ATTACHMENT_NAME_RE.test(name)) issues.push(issue('INVALID_DOCUMENT', `attachments.${name}`, `非法附件点名 '${name}'`));
        checkPoint(doc.attachments[name], `attachments.${name}`, canvas, issues);
      }
    }
  }
  validateConstraints(doc, issues);
  if (doc.protection !== undefined) {
    if (version !== 'pga-studio/3') issues.push(issue('INVALID_DOCUMENT', 'protection', '资产级保护需要 pga-studio/3'));
    else issues.push(...validateProtectionContract(doc.protection, validateStudioDocument));
  }
  return issues;
}

/**
 * 规范化：校验 + 填默认值，返回全新的普通数据对象（不改动输入）。
 * layer 缺省 = 数组下标；outline 缺省 = 既有默认描边色；anchor 缺省 = 内画布底边中点。
 * @throws {StudioDocumentError}
 */
export function normalizeStudioDocument(doc) {
  const issues = validateStudioDocument(doc);
  if (issues.length > 0) throw new StudioDocumentError(issues);
  const canvas = {
    w: doc.canvas.w,
    h: doc.canvas.h,
    outline: doc.canvas.outline === undefined ? DEFAULT_OUTLINE : doc.canvas.outline,
  };
  const nodes = doc.nodes.map((n, index) => {
    const out = { id: n.id, kind: n.kind };
    for (const f of GEOMETRY_FIELDS[n.kind]) {
      out[f] = Array.isArray(n[f]) ? n[f].map((pt) => [...pt]) : n[f];
    }
    out.ramp = isPlainObject(n.ramp) ? { shades: [...n.ramp.shades] } : n.ramp;
    out.material = n.material;
    out.layer = n.layer ?? index;
    return out;
  });
  const ramps = {};
  for (const [name, ramp] of Object.entries(doc.style.ramps)) ramps[name] = [...ramp];
  const style = { id: doc.style.id, version: doc.style.version, ramps };
  if (doc.style.meta) {
    style.meta = {};
    for (const k of ['license', 'source', 'focusRamp', 'notes']) if (doc.style.meta[k] !== undefined) style.meta[k] = doc.style.meta[k];
  }
  return {
    schemaVersion: doc.schemaVersion,
    id: doc.id,
    seed: doc.seed,
    renderProfile: { name: 'pixel-flat', version: 1 },
    style,
    canvas,
    nodes,
    anchor: doc.anchor ? { x: doc.anchor.x, y: doc.anchor.y } : { x: canvas.w / 2, y: canvas.h },
    attachments: Object.fromEntries(Object.entries(doc.attachments ?? {}).map(([k, v]) => [k, { x: v.x, y: v.y }])),
    constraints: (doc.constraints ?? []).map((c) => (c.note === undefined ? { kind: c.kind, target: c.target } : { kind: c.kind, target: c.target, note: c.note })),
    ...(doc.protection === undefined ? {} : { protection: { ...JSON.parse(JSON.stringify(doc.protection)), baseline: normalizeStudioDocument(doc.protection.baseline) } }),
  };
}

/* ---------- 稳定序列化与内容哈希（纯 JS，不用 node:crypto，核心可在浏览器运行） ---------- */

/** 确定性序列化：对象键排序、数组保序。只接受普通 JSON 数据。 */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/** FNV-1a 32 位哈希（确定性内容标识，非加密用途）。输入字符串（UTF-8）或字节数组。 */
export function fnv1aHex(input) {
  let bytes;
  if (typeof input === 'string') {
    bytes = [];
    for (let i = 0; i < input.length; i++) {
      let cp = input.codePointAt(i);
      if (cp > 0xffff) i++;
      if (cp < 0x80) bytes.push(cp);
      else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
      else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    }
  } else {
    bytes = input;
  }
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 规范化文档内容哈希（不含工具版本、时间戳、路径）。 */
export function documentHash(normalizedDoc) {
  return fnv1aHex(stableStringify(normalizedDoc));
}

/** 风格内容哈希（ ramps 实际内容，不只是风格 ID）。 */
export function styleHash(normalizedDoc) {
  return fnv1aHex(stableStringify(normalizedDoc.style));
}
