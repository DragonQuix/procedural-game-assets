/** 单帧位图文档与局部绘改；无 IO，复用 PixelPainter 和标准帧。 */
import { PixelPainter } from '../core/raster.js';
import { assembleFrame } from '../bake/frame.js';
import { assembleAsset } from '../bake/asset.js';
import { StudioDocumentError, stableStringify, fnv1aHex } from './document.js';
import { StudioOperationError } from './operators.js';

export const RASTER_SCHEMA_VERSION = 'pga-studio/raster/1';
export const RASTER_LIMITS = Object.freeze({ dimension: 256, commands: 128, vertices: 128, strokeSegments: 512 });
const ID = /^[a-z][a-z0-9._-]{0,63}$/;
const ATTACHMENT = /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/;
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
const equal = (a, b) => stableStringify(a) === stableStringify(b);
const copy = (v) => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const fail = (message, code = 'INVALID_DOCUMENT') => { throw new StudioOperationError(code, message); };

function keys(v, allowed, at) {
  if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) fail(`${at} 需要普通对象`);
  for (const key of Object.keys(v)) if (!allowed.includes(key) || UNSAFE.has(key)) fail(`${at} 未知字段 '${key}'`);
}
function integer(v, min, max, at) {
  if (!Number.isInteger(v) || v < min || v > max) fail(`${at} 需要 ${min}..${max} 整数`);
}
function point(v, w, h, at) {
  keys(v, ['x', 'y'], at);
  if (![v.x, v.y].every(Number.isFinite) || v.x < 0 || v.y < 0 || v.x > w || v.y > h) fail(`${at} 必须在帧的像素边界坐标内`);
}
function attachments(v, w, h) {
  keys(v, Object.keys(v ?? {}), 'attachments');
  if (Object.keys(v).length > 32) fail('附件点最多 32 个');
  for (const [name, p] of Object.entries(v)) {
    if (!ATTACHMENT.test(name) || UNSAFE.has(name)) fail(`非法附件点 '${name}'`);
    point(p, w, h, `attachments.${name}`);
  }
}

/** 十六进制 RGBA 字节；不依赖 Buffer 或宿主字节序。 */
export function rgbaToHex(bytes) {
  // 透明像素统一为全零，保证会跳过透明像素的既有图集绘制也能逐字节往返。
  return Array.from(bytes, (v, i) => (bytes[i - i % 4 + 3] === 0 ? 0 : v).toString(16).padStart(2, '0')).join('');
}
export function hexToRGBA(hex) {
  const out = new Uint8ClampedArray(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function validatePixels(hex, w, h) {
  if (typeof hex !== 'string' || hex.length !== w * h * 8 || !/^[0-9a-f]*$/.test(hex)) fail('rgba 需要 w*h*8 个小写十六进制字符（RGBA 顺序）');
  for (let i = 6; i < hex.length; i += 8) {
    const alpha = hex.slice(i, i + 2);
    if (alpha !== '00' && alpha !== 'ff') fail('raster/1 只支持二值 alpha；半透明需要显式预处理', 'UNSUPPORTED_SCOPE');
    if (alpha === '00' && hex.slice(i - 6, i) !== '000000') fail('透明像素的 RGB 必须为 0；PNG 导入会规范化不可见通道');
  }
}

export function validateRasterPreserve(preserve, doc) {
  if (!Array.isArray(preserve) || preserve.length > 64) fail('preserve 需要最多 64 项数组');
  return preserve.map((p) => {
    keys(p, ['kind', 'target', 'note'], 'preserve');
    if (p.note !== undefined && (typeof p.note !== 'string' || p.note.length > 512)) fail('note 需要不超过 512 字符');
    const valid = p.kind === 'pixels' ? p.target === 'canvas' : p.kind === 'metadata' &&
      (['anchor', 'attachments', 'frameSize'].includes(p.target) || typeof p.target === 'string' && p.target.startsWith('attachments.') && Object.hasOwn(doc.attachments ?? {}, p.target.slice(12)));
    if (!valid) fail('位图保护只支持 pixels:canvas 或 metadata:anchor/attachments[.<名称>]/frameSize', 'UNSUPPORTED_SCOPE');
    return { kind: p.kind, target: p.target, ...(p.note === undefined ? {} : { note: p.note }) };
  });
}

export function normalizeRasterDocument(doc) {
  try {
    keys(doc, ['schemaVersion', 'id', 'seed', 'canvas', 'rgba', 'anchor', 'attachments', 'constraints'], 'document');
    if (doc.schemaVersion !== RASTER_SCHEMA_VERSION) fail('未知位图文档版本');
    if (!ID.test(doc.id) || typeof doc.id !== 'string' || UNSAFE.has(doc.id)) fail('非法资产 ID');
    integer(doc.seed, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 'seed');
    keys(doc.canvas, ['w', 'h'], 'canvas');
    const { w, h } = doc.canvas;
    integer(w, 1, RASTER_LIMITS.dimension, 'canvas.w'); integer(h, 1, RASTER_LIMITS.dimension, 'canvas.h');
    validatePixels(doc.rgba, w, h);
    point(doc.anchor, w, h, 'anchor'); attachments(doc.attachments ?? {}, w, h);
    const constraints = validateRasterPreserve(doc.constraints ?? [], doc);
    return { schemaVersion: RASTER_SCHEMA_VERSION, id: doc.id, seed: doc.seed, canvas: { w, h }, rgba: doc.rgba,
      anchor: { ...doc.anchor }, attachments: copy(doc.attachments ?? {}), constraints };
  } catch (e) {
    if (!(e instanceof StudioOperationError)) throw e;
    throw new StudioDocumentError([{ code: e.code, target: 'raster', message: e.message }]);
  }
}

export function createRasterDocument({ id, width, height, rgba, anchor, attachments: points = {}, seed = 0 }) {
  integer(width, 1, RASTER_LIMITS.dimension, 'width'); integer(height, 1, RASTER_LIMITS.dimension, 'height');
  return normalizeRasterDocument({ schemaVersion: RASTER_SCHEMA_VERSION, id, seed, canvas: { w: width, h: height },
    rgba: rgba === undefined ? '00000000'.repeat(width * height) : rgbaToHex(rgba),
    anchor: anchor ?? { x: width / 2, y: height }, attachments: points, constraints: [] });
}

export function compileRasterDocument(doc, opts = {}) {
  const document = normalizeRasterDocument(doc), { w, h } = document.canvas;
  const painter = PixelPainter.fromRGBA(w, h, hexToRGBA(document.rgba));
  const frame = assembleFrame('main', painter, { anchor: document.anchor, attachments: document.attachments, outline: null });
  const asset = assembleAsset({ id: document.id, kind: 'raster', seed: document.seed, frames: [frame] });
  const opaquePixels = painter.data.reduce((n, p) => n + ((p >>> 24) > 0 ? 1 : 0), 0);
  const hashes = { documentHash: fnv1aHex(stableStringify(document)), renderHash: fnv1aHex(frame.rgba) + ':' + fnv1aHex(stableStringify({ anchor: frame.anchor, attachments: frame.attachments, w, h })), toolVersion: opts.toolVersion ?? 'unknown' };
  return { kind: 'raster', document, asset, hashes,
    sceneMap: { inner: { w, h }, final: { w, h }, padding: 0, nodes: [{ id: 'canvas', kind: 'raster', layer: 0, frameRect: { x: 0, y: 0, w, h }, frameBounds: frame.bounds, opaquePixels }] },
    protection: { status: 'NOT_CONFIGURED', conflicts: [] },
    diagnostics: { schemaVersion: RASTER_SCHEMA_VERSION, alpha: 'binary', opaquePixels, visualReview: 'UNVERIFIED' } };
}

/** 选区先于绘制和差分声明；mask 是按行的 0/1 字符串数组。 */
export function validateRasterRegion(region, w, h) {
  keys(region, ['id', 'x', 'y', 'w', 'h', 'mask'], 'region');
  if (typeof region.id !== 'string' || !ID.test(region.id) || UNSAFE.has(region.id)) fail('region 需要稳定 ID');
  integer(region.x, 0, w - 1, 'region.x'); integer(region.y, 0, h - 1, 'region.y');
  integer(region.w, 1, w - region.x, 'region.w'); integer(region.h, 1, h - region.y, 'region.h');
  if (region.mask !== undefined && (!Array.isArray(region.mask) || region.mask.length !== region.h ||
    region.mask.some((row) => typeof row !== 'string' || row.length !== region.w || !/^[01]+$/.test(row)) || !region.mask.some((row) => row.includes('1')))) fail('mask 需要 h 行、每行 w 个 0/1 且至少有一个 1');
  return copy(region);
}
export function regionContains(r, x, y) {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h && (r.mask === undefined || r.mask[y - r.y][x - r.x] === '1');
}

function resampleDraft(doc, params) {
  keys(params, ['width', 'height', 'sampling'], 'resample.params');
  const { width, height, sampling } = params, { w, h } = doc.canvas;
  integer(width, 1, RASTER_LIMITS.dimension, 'width'); integer(height, 1, RASTER_LIMITS.dimension, 'height');
  if (sampling !== 'nearest') fail('resample 需要显式 sampling=nearest', 'UNSUPPORTED_SCOPE');
  if (width * h !== height * w) fail('resample 首版必须保持宽高比，不暗中拉伸', 'UNSUPPORTED_SCOPE');
  const source = hexToRGBA(doc.rgba), rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = Math.floor((x + 0.5) * w / width), sy = Math.floor((y + 0.5) * h / height);
    const index = (sy * w + sx) * 4;
    rgba.set(source.subarray(index, index + 4), (y * width + x) * 4);
  }
  const scalePoint = (p) => ({ x: width === w ? p.x : p.x / w * width, y: height === h ? p.y : p.y / h * height });
  const next = normalizeRasterDocument({ ...doc, canvas: { w: width, h: height }, rgba: rgbaToHex(rgba),
    anchor: scalePoint(doc.anchor), attachments: Object.fromEntries(Object.entries(doc.attachments).map(([id, p]) => [id, scalePoint(p)])) });
  return { doc: next, plan: { id: 'raster.resample', target: 'canvas', region: null, metadata: null,
    resample: { from: { w, h }, to: { w: width, h: height }, sampling } } };
}

function drawCommand(p, command, origin) {
  const fields = { pixel: ['x', 'y'], rect: ['x', 'y', 'w', 'h'], line: ['x0', 'y0', 'x1', 'y1', 'thick'], poly: ['points'], path: ['points', 'thick', 'closed'] };
  if (!command || !Object.hasOwn(fields, command.kind)) fail('绘制只支持 pixel/rect/line/poly/path', 'UNSUPPORTED_OPERATION');
  keys(command, ['kind', 'color', ...fields[command.kind]], 'command');
  if (command.color !== null && (typeof command.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(command.color))) fail('color 需要 #rrggbb 或 null（擦除）');
  command = { ...command };
  for (const field of fields[command.kind]) {
    if (['points', 'closed'].includes(field) || field === 'thick' && command.thick === undefined) continue;
    integer(command[field], 0, RASTER_LIMITS.dimension, field);
    if (['x', 'x0', 'x1'].includes(field)) command[field] -= origin.x;
    if (['y', 'y0', 'y1'].includes(field)) command[field] -= origin.y;
    if (field !== 'thick') integer(command[field], 0, RASTER_LIMITS.dimension, field);
  }
  if (['poly', 'path'].includes(command.kind)) {
    const min = command.kind === 'poly' ? 3 : 2;
    if (!Array.isArray(command.points) || command.points.length < min || command.points.length > RASTER_LIMITS.vertices) fail(`${command.kind} 需要 ${min}..${RASTER_LIMITS.vertices} 个顶点`);
    command.points = command.points.map((pt) => {
      if (!Array.isArray(pt) || pt.length !== 2) fail('顶点需要 [x,y]');
      integer(pt[0], 0, RASTER_LIMITS.dimension, 'point.x'); integer(pt[1], 0, RASTER_LIMITS.dimension, 'point.y');
      const local = [pt[0] - origin.x, pt[1] - origin.y];
      const edge = command.kind === 'poly' ? 0 : 1;
      integer(local[0], 0, p.w - edge, 'point.x'); integer(local[1], 0, p.h - edge, 'point.y');
      return local;
    });
  }
  const c = command.color === null ? 0 : command.color;
  if (command.kind === 'pixel') p.set(command.x, command.y, c);
  if (command.kind === 'rect') {
    integer(command.w, 1, p.w, 'w'); integer(command.h, 1, p.h, 'h');
    p.rect(command.x, command.y, command.w, command.h, c);
  }
  if (command.kind === 'line') p.line(command.x0, command.y0, command.x1, command.y1, c, command.thick ?? 1);
  if (command.kind === 'poly') p.poly(command.points, c);
  if (command.kind === 'path') {
    if (command.closed !== undefined && typeof command.closed !== 'boolean') fail('path.closed 需要布尔值');
    const points = command.points, count = command.closed ? points.length : points.length - 1;
    const thick = command.thick ?? 1;
    integer(thick, 1, 64, 'path.thick');
    // 沿用 line 的方形笔刷和端点规则；不填充、不平滑、不额外修饰连接处。
    for (let i = 0; i < count; i++) p.line(...points[i], ...points[(i + 1) % points.length], c, thick);
  }
}

export function applyRasterOperation(input, operation) {
  const doc = normalizeRasterDocument(input);
  keys(operation, ['id', 'target', 'params', 'value'], 'operation');
  if (operation.id === 'raster.metadata') {
    keys(operation, ['id', 'target', 'value'], 'operation');
    if (!['anchor', 'attachments'].includes(operation.target)) fail('metadata 目标仅支持 anchor/attachments');
    const next = normalizeRasterDocument({ ...doc, [operation.target]: copy(operation.value) });
    return { doc: next, plan: { id: operation.id, target: operation.target, region: null,
      metadata: { target: operation.target, from: doc[operation.target], to: next[operation.target] } } };
  }
  if (operation.id === 'raster.resample') {
    keys(operation, ['id', 'target', 'params'], 'operation');
    if (operation.target !== 'canvas') fail('重采样 target 必须为 canvas');
    return resampleDraft(doc, operation.params);
  }
  if (!['raster.draw', 'raster.replace'].includes(operation.id)) fail('位图仅支持 raster.draw/raster.replace/raster.metadata/raster.resample', 'UNSUPPORTED_OPERATION');
  keys(operation, ['id', 'target', 'params'], 'operation');
  if (operation.target !== 'canvas') fail('位图绘制 target 必须为 canvas');
  const params = operation.params;
  keys(params, operation.id === 'raster.draw' ? ['region', 'commands', 'coordinateSpace'] : ['region', 'rgba'], 'params');
  const region = validateRasterRegion(params.region, doc.canvas.w, doc.canvas.h);
  const base = PixelPainter.fromRGBA(doc.canvas.w, doc.canvas.h, hexToRGBA(doc.rgba));
  let patch;
  if (operation.id === 'raster.replace') {
    validatePixels(params.rgba, region.w, region.h);
    patch = PixelPainter.fromRGBA(region.w, region.h, hexToRGBA(params.rgba));
  } else {
    const space = params.coordinateSpace === undefined ? 'region-local-pixels' : params.coordinateSpace;
    if (!['region-local-pixels', 'canvas-pixels'].includes(space)) fail('coordinateSpace 仅支持 region-local-pixels 或 canvas-pixels');
    const origin = space === 'canvas-pixels' ? region : { x: 0, y: 0 };
    if (!Array.isArray(params.commands) || params.commands.length < 1 || params.commands.length > RASTER_LIMITS.commands) fail('commands 需要 1..128 条绘制指令');
    const segments = params.commands.reduce((sum, cmd) => sum + (cmd?.kind === 'line' ? 1 : cmd?.kind === 'path' && Array.isArray(cmd.points) ? Math.max(0, cmd.points.length - 1) + (cmd.closed === true ? 1 : 0) : 0), 0);
    if (segments > RASTER_LIMITS.strokeSegments) fail('一次绘制的 line/path 合计最多 512 条线段', 'RESOURCE_LIMIT');
    patch = new PixelPainter(region.w, region.h);
    for (let y = 0; y < region.h; y++) for (let x = 0; x < region.w; x++) patch.set(x, y, base.get(region.x + x, region.y + y));
    for (const command of params.commands) drawCommand(patch, command, origin);
  }
  // 必须复制包括 alpha=0 的全部通道；blit 会跳过透明像素，不能用于擦除。
  for (let y = 0; y < region.h; y++) for (let x = 0; x < region.w; x++) {
    if (regionContains(region, region.x + x, region.y + y)) base.set(region.x + x, region.y + y, patch.get(x, y));
  }
  return { doc: { ...doc, rgba: rgbaToHex(base.toRGBA()) }, plan: { id: operation.id, target: 'canvas', region, metadata: null } };
}

export function checkRasterCandidate({ baseCompiled, candidateCompiled, plan, preserve = [] }) {
  const base = baseCompiled.document, next = candidateCompiled.document, conflicts = [];
  const protections = validateRasterPreserve(preserve, base);
  const resample = plan.id === 'raster.resample', sizeChanged = !equal(base.canvas, next.canvas);
  if (resample) {
    keys(plan.resample, ['from', 'to', 'sampling'], 'resample.plan');
    const expected = resampleDraft(base, { width: plan.resample.to.w, height: plan.resample.to.h, sampling: plan.resample.sampling });
    if (!equal(plan.resample, expected.plan.resample)) conflicts.push({ kind: 'structure', target: 'resample', message: '重采样计划与基准不符' });
    for (const field of ['canvas', 'rgba', 'anchor', 'attachments']) if (!equal(next[field], expected.doc[field])) {
      conflicts.push({ kind: 'resample', target: field, message: '最终结果与显式重采样及点位变换不符' });
    }
  }
  for (const field of Object.keys(base)) {
    if (field === 'rgba' || field === plan.metadata?.target || resample && ['canvas', 'anchor', 'attachments'].includes(field)) continue;
    if (!equal(base[field], next[field])) conflicts.push({ kind: 'structure', target: field, message: '非目标字段发生变化' });
  }
  if (plan.metadata && (!equal(base[plan.metadata.target], plan.metadata.from) || !equal(next[plan.metadata.target], plan.metadata.to))) conflicts.push({ kind: 'metadata', target: plan.metadata.target, message: '元数据与操作计划不符' });
  const region = plan.region ? validateRasterRegion(plan.region, base.canvas.w, base.canvas.h) : null;
  let changed = 0, outside = 0;
  for (let i = 0; !sizeChanged && i < base.rgba.length; i += 8) {
    if (base.rgba.slice(i, i + 8) === next.rgba.slice(i, i + 8)) continue;
    changed++;
    const pixel = i / 8;
    if (!region || !regionContains(region, pixel % base.canvas.w, Math.floor(pixel / base.canvas.w))) outside++;
  }
  if (sizeChanged && !resample) conflicts.push({ kind: 'pixels', target: 'canvas', message: '局部编辑不能改变帧尺寸' });
  if (outside) conflicts.push({ kind: 'pixels', target: region?.id ?? 'canvas', message: `${outside} 个像素在事先声明的选区外改变` });
  for (const p of protections) {
    const t = p.target;
    const violated = p.kind === 'pixels' ? sizeChanged || changed > 0 : t === 'frameSize' ? sizeChanged :
      t.startsWith('attachments.') ? !equal(base.attachments[t.slice(12)], next.attachments[t.slice(12)]) : !equal(base[t], next[t]);
    if (violated) conflicts.push({ kind: p.kind, target: t, message: '违反声明保护' });
  }
  return { status: conflicts.length ? 'REJECTED' : equal(base, next) ? 'UNCHANGED' : 'OK', code: conflicts.length ? 'CANDIDATE_INVALID' : null,
    conflicts, diff: sizeChanged ? { total: null, outside: null, reason: 'FRAME_SIZE_CHANGED' } : { total: changed, outside },
    protections, allowedRegion: region, visualReview: 'UNVERIFIED', ...(resample ? { resample: { ...plan.resample,
      anchor: { from: base.anchor, to: next.anchor }, attachments: { from: base.attachments, to: next.attachments } } } : {}) };
}

export function describeRasterCapabilities(doc) {
  const normalized = normalizeRasterDocument(doc);
  return { schemaVersion: RASTER_SCHEMA_VERSION, canvas: normalized.canvas, target: 'canvas', limits: RASTER_LIMITS,
    operations: ['raster.draw', 'raster.replace', 'raster.metadata', 'raster.resample'], primitives: ['pixel', 'rect', 'line', 'poly', 'path'],
    coordinateSpace: 'region-local-pixels', alpha: 'binary', eraseColor: null,
    coordinateSpaces: ['region-local-pixels', 'canvas-pixels'],
    path: { minPoints: 2, maxPoints: RASTER_LIMITS.vertices, maxThickness: 64, supportsClosed: true, defaultClosed: false, fill: false },
    resample: { sampling: ['nearest'], preserveAspectRatio: true, scope: 'whole-canvas-draft', metadata: 'scale-boundary-points-without-rounding' },
    selection: 'rect + optional binary mask rows', explore: 'UNSUPPORTED_SCOPE', visualReview: 'agent' };
}
