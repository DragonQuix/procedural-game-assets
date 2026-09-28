/**
 * studio/character-compiler.js — 角色文档 → 既有 bakeHumanoid 的纯编译（ADR-0011）
 *
 * 数据流：规范化角色文档 → 内存 CharacterSpec（kind 'humanoid'）→ 既有
 * bakeHumanoid（solvePose 复用，几何只解一次，绘制与附件点同源）→ BakedAsset。
 * 不新增渲染器；不改动旧配方；`BakedAsset.kind` 保持 'humanoid'，既有导出/manifest 直接可用。
 *
 * 编译输出另含跨帧编辑侧数据：
 * - frames：逐帧 { id, anchor, attachments, bounds, pixels, checked }
 * - renderHash：全部帧 RGBA + 锚点/附件点/包围盒 + 剪辑的稳定哈希
 * - 未适配姿态（kind 不在 template.checkedPoseKinds）标记 checked=false（notCovered）。
 */
import { bakeHumanoid } from '../recipes/humanoid.js';
import { normalizeCharacterDocument, CHARACTER_SCHEMA_VERSION } from './character-doc.js';
import { fnv1aHex, stableStringify } from './document.js';

/** 角色文档 → 内存 CharacterSpec（可信数据映射，不执行文档中的任何代码）。 */
function toSpec(doc) {
  return {
    kind: 'humanoid',
    id: doc.id,
    seed: doc.seed,
    palette: doc.palette,
    art: doc.art,
    frame: doc.frame,
    rig: doc.rig,
    poses: doc.poses,
    clips: doc.clips,
    outline: doc.outline,
  };
}

/** 全部帧 RGBA + 关键元数据 + 剪辑的稳定哈希（确定性内容标识，非加密）。 */
export function characterRenderHash(asset) {
  const parts = asset.frames.map((f) => fnv1aHex(stableStringify({ id: f.id, anchor: f.anchor, attachments: f.attachments, bounds: f.bounds })) + fnv1aHex(f.rgba));
  return fnv1aHex(stableStringify({ clips: asset.clips })) + ':' + fnv1aHex(parts.join('|'));
}

/**
 * 编译角色文档。
 * @param {object} doc 原始 JSON 文档（函数内规范化，不改动入参）
 * @param {object} [opts]
 * @param {string} [opts.toolVersion]
 * @returns {{ kind: 'character', asset, frames, hashes, diagnostics, document }}
 */
export function compileCharacterDocument(doc, opts = {}) {
  const normalized = normalizeCharacterDocument(doc);
  const asset = bakeHumanoid(toSpec(normalized));
  const checkedKinds = new Set(normalized.template.checkedPoseKinds);
  const kindOfPose = new Map(normalized.poses.map((p) => [p.id, p.kind ?? 'rig']));
  const frames = asset.frames.map((f) => {
    let pixels = 0;
    for (let i = 3; i < f.rgba.length; i += 4) if (f.rgba[i] > 0) pixels++;
    return {
      id: f.id,
      poseKind: kindOfPose.get(f.id) ?? 'rig',
      checked: checkedKinds.has(kindOfPose.get(f.id) ?? 'rig'),
      anchor: f.anchor,
      attachments: f.attachments,
      bounds: f.bounds,
      pixels,
    };
  });
  const hashes = {
    documentHash: fnv1aHex(stableStringify(normalized)),
    styleHash: fnv1aHex(stableStringify({ palette: normalized.palette, art: normalized.art })),
    renderHash: characterRenderHash(asset),
    toolVersion: opts.toolVersion ?? 'unknown',
  };
  return {
    kind: 'character',
    asset,
    frames,
    hashes,
    diagnostics: {
      schemaVersion: CHARACTER_SCHEMA_VERSION,
      frameCount: frames.length,
      clipCount: Object.keys(asset.clips).length,
      checkedPoseKinds: normalized.template.checkedPoseKinds,
      notCoveredFrames: frames.filter((f) => !f.checked).map((f) => f.id),
      constraintsDeclared: normalized.constraints.length,
    },
    document: normalized,
  };
}

/* ---------- 候选检查（跨帧） ---------- */

function deepEqual(a, b) {
  return stableStringify(a) === stableStringify(b);
}

/**
 * 角色候选检查：结构完整性 + 跨帧不变量 + 受影响帧/附件点报告。
 * @param {object} args { baseCompiled, candidateCompiled, plan, preserve }
 * plan.target 形如 'palette.V' / 'rig.thigh' / 'rig.guns.fwd.len' / 'art.head'
 */
export function checkCharacterCandidate(args) {
  const { baseCompiled, candidateCompiled, plan } = args;
  const preserve = args.preserve ?? [];
  const conflicts = [];
  const baseDoc = baseCompiled.document;
  const candDoc = candidateCompiled.document;

  /* 结构完整性：只允许 plan.changedFields 声明的路径变化 */
  const allowed = new Set(Object.keys(plan.changedFields));
  const sections = ['seed', 'template', 'meta', 'frame', 'palette', 'art', 'rig', 'poses', 'clips', 'outline'];
  const scan = (baseVal, candVal, path) => {
    if (deepEqual(baseVal, candVal)) return;
    if (allowed.has(path)) return;
    // 命中路径的父级时继续下钻（如 palette 整体变了，但只允许 palette.V）
    if (isContainer(baseVal) && isContainer(candVal)) {
      for (const key of new Set([...Object.keys(baseVal), ...Object.keys(candVal)])) scan(baseVal[key], candVal[key], `${path}.${key}`);
      return;
    }
    conflicts.push({ kind: 'structure', target: path, message: `未声明字段 '${path}' 被修改（操作只应触碰 ${[...allowed].join(', ')}）` });
  };
  for (const section of sections) scan(baseDoc[section], candDoc[section], section);

  /* 前置冲突：metadata 保护目标不得由本操作改变 */
  const metaPreserve = preserve.filter((p) => p.kind === 'metadata').map((p) => p.target);

  /* 跨帧对比：受影响帧与附件点报告 */
  const baseFrames = new Map(baseCompiled.frames.map((f) => [f.id, f]));
  const candFrames = new Map(candidateCompiled.frames.map((f) => [f.id, f]));
  const baseRgba = new Map(baseCompiled.asset.frames.map((f) => [f.id, f.rgba]));
  const candRgba = new Map(candidateCompiled.asset.frames.map((f) => [f.id, f.rgba]));
  const affectedFrames = [];
  const notCoveredChanges = [];
  let totalDiffPixels = 0;
  for (const [id, baseF] of baseFrames) {
    const candF = candFrames.get(id);
    if (!candF) {
      conflicts.push({ kind: 'structure', target: id, message: `候选缺少帧 '${id}'` });
      continue;
    }
    let diffPixels = 0;
    const a = baseRgba.get(id);
    const b = candRgba.get(id);
    if (a.length !== b.length) {
      conflicts.push({ kind: 'metadata', target: 'frameSize', message: `帧 '${id}' 尺寸变化` });
      diffPixels = -1;
    } else {
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diffPixels++;
    }
    const attachmentDeltas = {};
    for (const [name, pt] of Object.entries(baseF.attachments)) {
      const np = candF.attachments[name];
      if (!np) {
        conflicts.push({ kind: 'metadata', target: `attachments.${name}`, message: `帧 '${id}' 丢失附件点 '${name}'` });
        continue;
      }
      const dx = +(np.x - pt.x).toFixed(2);
      const dy = +(np.y - pt.y).toFixed(2);
      if (dx !== 0 || dy !== 0) attachmentDeltas[name] = { dx, dy };
    }
    const anchorDelta = { dx: +(candF.anchor.x - baseF.anchor.x).toFixed(2), dy: +(candF.anchor.y - baseF.anchor.y).toFixed(2) };
    const groundingChanged = Boolean(baseF.bounds && candF.bounds && baseF.bounds.y1 !== candF.bounds.y1); // 接地 = 包围盒底缘；顶缘随体高合法变化
    const changed = diffPixels !== 0;
    if (changed && baseF.checked) {
      affectedFrames.push({ id, diffPixels, attachmentDeltas, anchorDelta, groundingChanged });
    } else if (changed && !baseF.checked) {
      notCoveredChanges.push({ id, poseKind: baseF.poseKind, diffPixels, note: '该姿态种类不在 template.checkedPoseKinds 内：已重渲染但未做不变量断言（明确不假装覆盖）' });
    }
    totalDiffPixels += Math.max(0, diffPixels);
    /* 不变量（仅 checked 帧）：锚点不动、接地（底缘边界）不变 */
    if (baseF.checked) {
      if (anchorDelta.dx !== 0 || anchorDelta.dy !== 0) {
        conflicts.push({ kind: 'metadata', target: 'anchor', message: `帧 '${id}' 锚点移动 (${anchorDelta.dx}, ${anchorDelta.dy})（角色锚点 = 脚底中线，应不动）` });
      }
      if (groundingChanged) {
        conflicts.push({ kind: 'metadata', target: 'grounding', message: `帧 '${id}' 包围盒底缘变化（接地被破坏）：y1 ${baseF.bounds?.y1} → ${candF.bounds?.y1}` });
      }
    }
  }

  /* metadata 保护核对（声明驱动） */
  for (const target of metaPreserve) {
    if (target === 'anchor') {
      for (const f of affectedFrames) {
        if (f.anchorDelta.dx !== 0 || f.anchorDelta.dy !== 0) {
          conflicts.push({ kind: 'metadata', target: 'anchor', message: `锚点保护命中：帧 '${f.id}' 锚点移动` });
        }
      }
    } else if (target === 'attachments' || target.startsWith('attachments.')) {
      const name = target === 'attachments' ? null : target.slice('attachments.'.length);
      for (const f of affectedFrames) {
        for (const key of Object.keys(f.attachmentDeltas)) {
          if (name === null || key === name) conflicts.push({ kind: 'metadata', target: `attachments.${key}`, message: `附件点保护命中：帧 '${f.id}' 的 '${key}' 移动 ${JSON.stringify(f.attachmentDeltas[key])}` });
        }
      }
    } else if (target === 'frameSize') {
      // 尺寸变化已在上方逐帧记录为冲突；此处无需重复
    }
  }

  /* 受剪辑影响的剪辑（引用变化帧的剪辑） */
  const changedIds = new Set([...affectedFrames.map((f) => f.id), ...notCoveredChanges.map((f) => f.id)]);
  const affectedClips = Object.entries(baseCompiled.asset.clips)
    .filter(([, clip]) => clip.frames.some((fid) => changedIds.has(fid)))
    .map(([name, clip]) => ({ name, frames: clip.frames.filter((fid) => changedIds.has(fid)).length, totalFrames: clip.frames.length, ms: clip.ms }));

  const rejected = conflicts.length > 0;
  return {
    status: rejected ? 'REJECTED' : totalDiffPixels === 0 ? 'UNCHANGED' : 'OK',
    code: rejected ? 'CANDIDATE_INVALID' : null,
    conflicts,
    affectedFrames,
    notCoveredChanges,
    affectedClips,
    totalDiffPixels,
    protections: { metadata: metaPreserve },
  };
}

function isContainer(v) {
  return v !== null && typeof v === 'object';
}
