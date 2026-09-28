/**
 * studio/character-doc.js — Studio 角色文档 character/1：校验、规范化与能力范围
 * （纯核心，ADR-0001/0011）
 *
 * 文档是既有 humanoid 配方的**结构化可编辑数据面**（无函数、无模块路径）：
 * 资产级共享字段（palette / frame / rig）+ 部件字段（art.head / art.torso）+
 * 姿态与剪辑（显式数据，LEG_POSES/runLegs 已具体化为数值）。
 * template.checkedPoseKinds 声明不变量检查适配的姿态种类；未适配姿态在报告中
 * 明确列为 notCovered，不假装覆盖（HANDOFF M5）。
 *
 * M5 最小保护：仅 metadata（anchor / attachments.<名>）；pixels/structure 类别
 * 明确拒绝（未实现，不静默接受）。
 */
import { StudioDocumentError } from './document.js';
import { DEFAULT_OUTLINE } from '../bake/frame.js';

export const CHARACTER_SCHEMA_VERSION = 'pga-studio/character/1';
const POSE_KINDS = Object.freeze(['rig', 'prone', 'dead', 'dive', 'ball']);
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const PALETTE_KEY_RE = /^[A-Za-z]$/;
const ID_RE = /^[a-z][a-z0-9._-]{0,63}$/;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** rig.set 可编辑标量路径与范围（capabilities 与操作校验共用）。 */
export const RIG_FIELD_SPECS = Object.freeze({
  thigh: Object.freeze({ type: 'integer', min: 2, max: 9 }),
  shin: Object.freeze({ type: 'integer', min: 2, max: 9 }),
  thick: Object.freeze({ type: 'integer', min: 2, max: 6 }),
  hipSpread: Object.freeze({ type: 'integer', min: 1, max: 4 }),
  hipY: Object.freeze({ type: 'integer', min: -20, max: -4 }),
  torsoDrop: Object.freeze({ type: 'integer', min: -4, max: 4 }),
  headDx: Object.freeze({ type: 'integer', min: -4, max: 4 }),
  headDrop: Object.freeze({ type: 'integer', min: -4, max: 4 }),
});
export const GUN_FIELD_SPECS = Object.freeze({
  len: Object.freeze({ type: 'integer', min: 3, max: 14 }),
  back: Object.freeze({ type: 'integer', min: 0, max: 6 }),
});

function issue(code, target, message) {
  return { code, target, message };
}

function isPlainObject(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function checkKeys(obj, allowed, target, issues) {
  for (const key of Object.keys(obj)) {
    if (DANGEROUS_KEYS.has(key)) issues.push(issue('UNSAFE_PATH', target, `危险键 '${key}' 被拒绝`));
    else if (!allowed.includes(key)) issues.push(issue('INVALID_DOCUMENT', target, `未知字段 '${key}'`));
  }
}

function checkNum(v, target, issues, { integer = false, min = -Infinity, max = Infinity } = {}) {
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

function checkIntPair(v, target, issues, opts = {}) {
  if (!Array.isArray(v) || v.length !== 2) {
    issues.push(issue('INVALID_DOCUMENT', target, '需要 [x, y] 对'));
    return;
  }
  checkNum(v[0], `${target}[0]`, issues, { integer: true, ...opts });
  checkNum(v[1], `${target}[1]`, issues, { integer: true, ...opts });
}

function checkArt(rows, palette, target, issues) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 16 || rows.every((r) => r.length === 0)) {
    issues.push(issue('INVALID_DOCUMENT', target, '像素图需要 1–16 行且至少一行非空'));
    return;
  }
  for (const [y, row] of rows.entries()) {
    if (typeof row !== 'string' || row.length > 16) {
      issues.push(issue('INVALID_DOCUMENT', `${target}[${y}]`, '行需要 ≤16 字符字符串'));
      continue;
    }
    for (const ch of row) {
      if (ch === '.' || ch === ' ') continue;
      if (!Object.hasOwn(palette, ch)) issues.push(issue('INVALID_DOCUMENT', `${target}[${y}]`, `字符 '${ch}' 不在调色板中`));
    }
  }
}

/**
 * 校验角色文档。返回结构化问题数组（空数组 = 合法）。
 */
export function validateCharacterDocument(doc) {
  const issues = [];
  if (!isPlainObject(doc)) return [issue('INVALID_DOCUMENT', '(root)', '文档需要 JSON 对象')];
  checkKeys(doc, ['schemaVersion', 'id', 'seed', 'template', 'meta', 'frame', 'palette', 'art', 'rig', 'poses', 'clips', 'outline', 'constraints'], '(root)', issues);
  if (doc.schemaVersion !== CHARACTER_SCHEMA_VERSION) {
    issues.push(issue('INVALID_DOCUMENT', 'schemaVersion', `未知版本 ${JSON.stringify(doc.schemaVersion)}，本校验器仅支持 '${CHARACTER_SCHEMA_VERSION}'`));
    return issues;
  }
  if (typeof doc.id !== 'string' || !ID_RE.test(doc.id)) issues.push(issue('INVALID_DOCUMENT', 'id', `资产 ID 非法：${JSON.stringify(doc.id)}`));
  checkNum(doc.seed, 'seed', issues, { integer: true, min: -Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER });
  // template
  if (!isPlainObject(doc.template)) {
    issues.push(issue('INVALID_DOCUMENT', 'template', '需要 { id, version, checkedPoseKinds } 对象'));
  } else {
    checkKeys(doc.template, ['id', 'version', 'checkedPoseKinds'], 'template', issues);
    if (doc.template.id !== 'humanoid-rig' || doc.template.version !== 1) issues.push(issue('INVALID_DOCUMENT', 'template', `未知模板 ${JSON.stringify(doc.template.id)}@${JSON.stringify(doc.template.version)}（支持 humanoid-rig@1）`));
    if (!Array.isArray(doc.template.checkedPoseKinds) || doc.template.checkedPoseKinds.length === 0 || doc.template.checkedPoseKinds.some((k) => !POSE_KINDS.includes(k))) {
      issues.push(issue('INVALID_DOCUMENT', 'template.checkedPoseKinds', `需为姿态种类子集：${POSE_KINDS.join(', ')}`));
    }
  }
  // meta（可选：来源与许可）
  if (doc.meta !== undefined) {
    if (!isPlainObject(doc.meta)) issues.push(issue('INVALID_DOCUMENT', 'meta', '需要 { source?, license?, notes? } 对象'));
    else {
      checkKeys(doc.meta, ['source', 'license', 'notes'], 'meta', issues);
      for (const k of ['source', 'license', 'notes']) {
        if (doc.meta[k] !== undefined && (typeof doc.meta[k] !== 'string' || doc.meta[k].length > 200)) issues.push(issue('INVALID_DOCUMENT', `meta.${k}`, '需要 ≤200 字符字符串'));
      }
    }
  }
  // frame
  const frame = { w: 0, h: 0, feetY: 0, bodyX: 0 };
  if (!isPlainObject(doc.frame)) {
    issues.push(issue('INVALID_DOCUMENT', 'frame', '需要 { w, h, feetY, bodyX } 对象'));
  } else {
    checkKeys(doc.frame, ['w', 'h', 'feetY', 'bodyX'], 'frame', issues);
    checkNum(doc.frame.w, 'frame.w', issues, { integer: true, min: 8, max: 64 });
    checkNum(doc.frame.h, 'frame.h', issues, { integer: true, min: 8, max: 64 });
    checkNum(doc.frame.feetY, 'frame.feetY', issues, { integer: true, min: 1, max: 63 });
    checkNum(doc.frame.bodyX, 'frame.bodyX', issues, { integer: true, min: 0, max: 63 });
    Object.assign(frame, doc.frame);
    if (Number.isInteger(doc.frame.w) && Number.isInteger(doc.frame.h) && Number.isInteger(doc.frame.feetY) && Number.isInteger(doc.frame.bodyX)) {
      if (doc.frame.feetY >= doc.frame.h) issues.push(issue('INVALID_DOCUMENT', 'frame.feetY', `feetY ${doc.frame.feetY} 须在帧高 ${doc.frame.h} 内`));
      if (doc.frame.bodyX >= doc.frame.w) issues.push(issue('INVALID_DOCUMENT', 'frame.bodyX', `bodyX ${doc.frame.bodyX} 须在帧宽 ${doc.frame.w} 内`));
    }
  }
  // palette
  const palette = isPlainObject(doc.palette) ? doc.palette : {};
  if (!isPlainObject(doc.palette)) {
    issues.push(issue('INVALID_DOCUMENT', 'palette', '需要调色板对象（单字符键 → #rrggbb）'));
  } else {
    const keys = Object.keys(doc.palette);
    if (keys.length < 1 || keys.length > 48) issues.push(issue('RESOURCE_LIMIT', 'palette', `调色板键数 ${keys.length} 超出 [1, 48]`));
    for (const key of keys) {
      if (DANGEROUS_KEYS.has(key)) {
        issues.push(issue('UNSAFE_PATH', 'palette', `危险键 '${key}' 被拒绝`));
        continue;
      }
      if (!PALETTE_KEY_RE.test(key)) issues.push(issue('INVALID_DOCUMENT', `palette.${key}`, `调色板键需为单字母：${JSON.stringify(key)}`));
      if (typeof doc.palette[key] !== 'string' || !HEX_RE.test(doc.palette[key])) issues.push(issue('INVALID_DOCUMENT', `palette.${key}`, `非法颜色 ${JSON.stringify(doc.palette[key])}`));
    }
  }
  // art
  if (!isPlainObject(doc.art)) {
    issues.push(issue('INVALID_DOCUMENT', 'art', '需要 { head, torso } 对象'));
  } else {
    checkKeys(doc.art, ['head', 'torso'], 'art', issues);
    checkArt(doc.art.head, palette, 'art.head', issues);
    checkArt(doc.art.torso, palette, 'art.torso', issues);
  }
  // rig
  if (!isPlainObject(doc.rig)) {
    issues.push(issue('INVALID_DOCUMENT', 'rig', '需要骨架参数对象'));
  } else {
    checkKeys(doc.rig, [...Object.keys(RIG_FIELD_SPECS), 'shoulderBack', 'shoulderFront', 'heavyGun', 'guns', 'proneMuzzle', 'ballCenterY'], 'rig', issues);
    for (const [field, spec] of Object.entries(RIG_FIELD_SPECS)) {
      const required = ['thigh', 'shin', 'hipY'].includes(field);
      if (doc.rig[field] === undefined) {
        if (required) issues.push(issue('INVALID_DOCUMENT', `rig.${field}`, '缺少必需骨架参数'));
      } else {
        checkNum(doc.rig[field], `rig.${field}`, issues, { integer: spec.type === 'integer', min: spec.min, max: spec.max });
      }
    }
    if (doc.rig.shoulderBack !== undefined) checkIntPair(doc.rig.shoulderBack, 'rig.shoulderBack', issues, { min: -32, max: 32 });
    if (doc.rig.shoulderFront !== undefined) checkIntPair(doc.rig.shoulderFront, 'rig.shoulderFront', issues, { min: -32, max: 32 });
    if (doc.rig.heavyGun !== undefined && typeof doc.rig.heavyGun !== 'boolean') issues.push(issue('INVALID_DOCUMENT', 'rig.heavyGun', '需要布尔值'));
    if (!isPlainObject(doc.rig.guns) || Object.keys(doc.rig.guns).length < 1) {
      issues.push(issue('INVALID_DOCUMENT', 'rig.guns', '至少需要 1 个瞄准方向'));
    } else {
      for (const [aim, gun] of Object.entries(doc.rig.guns)) {
        const t = `rig.guns.${aim}`;
        if (DANGEROUS_KEYS.has(aim)) {
          issues.push(issue('UNSAFE_PATH', 'rig.guns', `危险键 '${aim}' 被拒绝`));
          continue;
        }
        if (!/^[a-z][a-zA-Z0-9]{0,15}$/.test(aim)) issues.push(issue('INVALID_DOCUMENT', t, `非法方向名 '${aim}'`));
        if (!isPlainObject(gun)) {
          issues.push(issue('INVALID_DOCUMENT', t, '需要 { grip, dir, back, len } 对象'));
          continue;
        }
        checkKeys(gun, ['grip', 'dir', 'back', 'len'], t, issues);
        checkIntPair(gun.grip, `${t}.grip`, issues, { min: -32, max: 32 });
        if (!Array.isArray(gun.dir) || gun.dir.length !== 2 || !gun.dir.every(Number.isFinite) || (gun.dir[0] === 0 && gun.dir[1] === 0)) {
          issues.push(issue('INVALID_DOCUMENT', `${t}.dir`, '需要非零 [dx, dy] 方向'));
        } else {
          const norm = Math.hypot(gun.dir[0], gun.dir[1]);
          if (Math.abs(norm - 1) > 0.01) issues.push(issue('INVALID_DOCUMENT', `${t}.dir`, `方向需为单位向量（|d|=${norm.toFixed(3)}）`));
        }
        for (const [f, spec] of Object.entries(GUN_FIELD_SPECS)) checkNum(gun[f], `${t}.${f}`, issues, { integer: true, min: spec.min, max: spec.max });
      }
    }
    if (doc.rig.proneMuzzle !== undefined) checkIntPair(doc.rig.proneMuzzle, 'rig.proneMuzzle', issues, { min: -32, max: 32 });
    if (doc.rig.ballCenterY !== undefined) checkNum(doc.rig.ballCenterY, 'rig.ballCenterY', issues, { integer: true, min: -24, max: 0 });
  }
  // poses
  if (!Array.isArray(doc.poses) || doc.poses.length < 1) {
    issues.push(issue('INVALID_DOCUMENT', 'poses', '至少需要 1 个姿态'));
  } else {
    if (doc.poses.length > 48) issues.push(issue('RESOURCE_LIMIT', 'poses', `姿态数 ${doc.poses.length} 超过上限 48`));
    const seen = new Set();
    const aims = new Set(isPlainObject(doc.rig?.guns) ? Object.keys(doc.rig.guns) : []);
    for (const [i, pose] of doc.poses.entries()) {
      const t = `poses[${i}]${isPlainObject(pose) && typeof pose.id === 'string' ? `(${pose.id})` : ''}`;
      if (!isPlainObject(pose)) {
        issues.push(issue('INVALID_DOCUMENT', `poses[${i}]`, '姿态需要对象'));
        continue;
      }
      checkKeys(pose, ['id', 'kind', 'legs', 'aim', 'gunLen', 'arms', 'turn'], t, issues);
      if (typeof pose.id !== 'string' || !/^[a-z][a-zA-Z0-9_]{0,31}$/.test(pose.id)) {
        issues.push(issue('INVALID_DOCUMENT', `${t}.id`, `非法姿态 ID：${JSON.stringify(pose.id)}`));
      } else if (seen.has(pose.id)) {
        issues.push(issue('INVALID_DOCUMENT', `${t}.id`, `姿态 ID 重复：'${pose.id}'`));
      }
      seen.add(pose.id);
      const kind = pose.kind ?? 'rig';
      if (!POSE_KINDS.includes(kind)) {
        issues.push(issue('UNSUPPORTED_OPERATION', `${t}.kind`, `未知姿态种类 '${pose.kind}'（可用：${POSE_KINDS.join(', ')}）`));
        continue;
      }
      if (kind === 'rig') {
        if (!Array.isArray(pose.legs) || pose.legs.length !== 2) {
          issues.push(issue('INVALID_DOCUMENT', `${t}.legs`, 'rig 姿态需要 [[大腿角,膝弯],[大腿角,膝弯]]'));
        } else {
          for (const [li, leg] of pose.legs.entries()) {
            if (!Array.isArray(leg) || leg.length !== 2 || !leg.every(Number.isFinite)) issues.push(issue('INVALID_DOCUMENT', `${t}.legs[${li}]`, '需要 [大腿角, 膝弯] 数值对'));
          }
        }
        if (pose.aim !== undefined && (typeof pose.aim !== 'string' || !aims.has(pose.aim))) issues.push(issue('INVALID_DOCUMENT', `${t}.aim`, `引用不存在的瞄准方向 '${pose.aim}'`));
        if (pose.gunLen !== undefined) checkNum(pose.gunLen, `${t}.gunLen`, issues, { min: 1, max: 20 });
        if (pose.arms !== undefined && pose.arms !== 'flail') issues.push(issue('INVALID_DOCUMENT', `${t}.arms`, `未知手臂模式 '${pose.arms}'`));
      }
      if (kind === 'ball') checkNum(pose.turn ?? 0, `${t}.turn`, issues, { integer: true, min: 0, max: 3 });
      if (kind === 'prone' && doc.rig?.proneMuzzle === undefined) issues.push(issue('INVALID_DOCUMENT', t, 'prone 姿态需要 rig.proneMuzzle'));
    }
  }
  // clips
  if (!isPlainObject(doc.clips)) {
    issues.push(issue('INVALID_DOCUMENT', 'clips', '需要剪辑对象（可为空对象）'));
  } else {
    const poseIds = new Set((Array.isArray(doc.poses) ? doc.poses : []).filter(isPlainObject).map((p) => p.id));
    for (const [name, clip] of Object.entries(doc.clips)) {
      const t = `clips.${name}`;
      if (!/^[a-z][a-z0-9_]{0,31}$/.test(name)) issues.push(issue('INVALID_DOCUMENT', t, `非法剪辑名 '${name}'`));
      if (!isPlainObject(clip)) {
        issues.push(issue('INVALID_DOCUMENT', t, '需要 { frames, ms } 对象'));
        continue;
      }
      checkKeys(clip, ['frames', 'ms'], t, issues);
      if (!Array.isArray(clip.frames) || clip.frames.length < 1) {
        issues.push(issue('INVALID_DOCUMENT', `${t}.frames`, '需要非空姿态 ID 数组'));
      } else {
        for (const fid of clip.frames) if (!poseIds.has(fid)) issues.push(issue('INVALID_DOCUMENT', `${t}.frames`, `引用不存在的姿态 '${fid}'`));
      }
      const durations = Array.isArray(clip.ms) ? clip.ms : [clip.ms];
      if (durations.some((d) => !Number.isFinite(d) || d <= 0)) issues.push(issue('INVALID_DOCUMENT', `${t}.ms`, '时长需要正有限毫秒数'));
      if (Array.isArray(clip.ms) && Array.isArray(clip.frames) && clip.ms.length !== clip.frames.length) issues.push(issue('INVALID_DOCUMENT', `${t}.ms`, '时长数组长度 ≠ 帧数'));
    }
  }
  if (doc.outline !== undefined && doc.outline !== null && (typeof doc.outline !== 'string' || !HEX_RE.test(doc.outline))) issues.push(issue('INVALID_DOCUMENT', 'outline', `需要 '#rrggbb' 或 null：${JSON.stringify(doc.outline)}`));
  // constraints：M5 角色仅支持 metadata 类别
  if (doc.constraints !== undefined) {
    if (!Array.isArray(doc.constraints)) {
      issues.push(issue('INVALID_DOCUMENT', 'constraints', '需要数组'));
    } else {
      for (const [i, c] of doc.constraints.entries()) {
        const t = `constraints[${i}]`;
        if (!isPlainObject(c)) {
          issues.push(issue('INVALID_DOCUMENT', t, '保护项需要对象'));
          continue;
        }
        checkKeys(c, ['kind', 'target', 'note'], t, issues);
        if (c.kind !== 'metadata') issues.push(issue('UNSUPPORTED_SCOPE', t, `character/1 仅支持 metadata 保护（pixels/structure 未实现）`));
        else if (typeof c.target !== 'string' || !/^(anchor|attachments(\.[a-zA-Z][a-zA-Z0-9_]{0,31})?|frameSize)$/.test(c.target)) issues.push(issue('INVALID_DOCUMENT', `${t}.target`, `角色元数据目标需为 anchor / attachments[.<名>] / frameSize：${JSON.stringify(c.target)}`));
        if (c.note !== undefined && typeof c.note !== 'string') issues.push(issue('INVALID_DOCUMENT', `${t}.note`, 'note 需要字符串'));
      }
    }
  }
  return issues;
}

/**
 * 规范化：校验 + 默认值，返回全新普通数据对象（不改动输入）。
 * @throws {StudioDocumentError}
 */
export function normalizeCharacterDocument(doc) {
  const issues = validateCharacterDocument(doc);
  if (issues.length > 0) throw new StudioDocumentError(issues);
  const copy = (v) => JSON.parse(JSON.stringify(v));
  const rig = copy(doc.rig);
  if (rig.thick === undefined) rig.thick = 3;
  if (rig.hipSpread === undefined) rig.hipSpread = 1;
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    id: doc.id,
    seed: doc.seed,
    template: { id: 'humanoid-rig', version: 1, checkedPoseKinds: [...doc.template.checkedPoseKinds] },
    ...(doc.meta ? { meta: copy(doc.meta) } : {}),
    frame: copy(doc.frame),
    palette: copy(doc.palette),
    art: { head: [...doc.art.head], torso: [...doc.art.torso] },
    rig,
    poses: doc.poses.map((p) => copy(p)),
    clips: copy(doc.clips),
    outline: doc.outline === undefined ? DEFAULT_OUTLINE : doc.outline,
    constraints: (doc.constraints ?? []).map((c) => (c.note === undefined ? { kind: c.kind, target: c.target } : { kind: c.kind, target: c.target, note: c.note })),
  };
}

/**
 * 角色能力声明（inspect 用）：可编辑字段、范围与单位。
 */
export function describeCharacterCapabilities(doc) {
  const normalized = normalizeCharacterDocument(doc);
  const palette = {};
  for (const [key, value] of Object.entries(normalized.palette)) {
    palette[key] = { current: value, usage: usageOfKey(normalized, key) };
  }
  const rig = {};
  for (const [field, spec] of Object.entries(RIG_FIELD_SPECS)) {
    if (normalized.rig[field] !== undefined) rig[field] = { current: normalized.rig[field], ...spec };
  }
  const guns = {};
  for (const [aim, gun] of Object.entries(normalized.rig.guns)) {
    guns[aim] = {
      len: { current: gun.len, ...GUN_FIELD_SPECS.len },
      back: { current: gun.back, ...GUN_FIELD_SPECS.back },
    };
  }
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    checkedPoseKinds: normalized.template.checkedPoseKinds,
    notCheckedPoseKinds: POSE_KINDS.filter((k) => !normalized.template.checkedPoseKinds.includes(k)),
    operations: {
      'palette.set': { status: 'available-m5', unit: '#rrggbb', targets: palette },
      'rig.set': { status: 'available-m5', unit: 'px', targets: { scalars: rig, guns } },
      'art.set': { status: 'available-m5', targets: { head: { rows: normalized.art.head.length }, torso: { rows: normalized.art.torso.length } }, note: '替换 ASCII 像素图；字符须取自调色板或 . 空格' },
    },
    poses: normalized.poses.map((p) => ({ id: p.id, kind: p.kind ?? 'rig', checked: normalized.template.checkedPoseKinds.includes(p.kind ?? 'rig') })),
    clips: Object.fromEntries(Object.entries(normalized.clips).map(([name, clip]) => [name, { frames: clip.frames.length, ms: clip.ms }])),
  };
}

function usageOfKey(doc, key) {
  const usage = [];
  for (const part of ['head', 'torso']) {
    if (doc.art[part].some((row) => row.includes(key))) usage.push(`art.${part}`);
  }
  return usage.length > 0 ? usage : ['draw-code（四肢/枪等绘制键）'];
}
