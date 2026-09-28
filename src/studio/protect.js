/**
 * studio/protect.js — 候选保护检查（纯核心，ADR-0008/0009）
 *
 * 三类保护（HANDOFF §7.4）：
 *   结构保护   非目标节点与资产级字段（seed/canvas/style/anchor/attachments）逐字段不变
 *   像素保护   声明节点的最终帧区域 RGBA 不变（结构没变 ≠ 画面没被遮挡，故独立按像素核对）
 *   元数据保护 锚点、附件点、帧尺寸等声明目标不变
 *
 * 允许影响区域由操作计划与依赖关系**独立计算**（旧/新几何 ∪ 1px 描边邻域，
 * 再减去未变更高层节点的遮挡），绝不是把"实际发生变化的像素集合"事后定义为允许区域。
 * 首版图像很小，全量重渲染后逐像素差分。
 */
import { stableStringify } from './document.js';

const METADATA_TARGETS = Object.freeze(['anchor', 'attachments', 'frameSize']);

function deepEqual(a, b) {
  return stableStringify(a) === stableStringify(b);
}

function rectDilatedUnion(rects, dilation, W, H) {
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (const r of rects) {
    if (!r) continue;
    x0 = Math.min(x0, r.x - dilation);
    y0 = Math.min(y0, r.y - dilation);
    x1 = Math.max(x1, r.x + r.w + dilation);
    y1 = Math.max(y1, r.y + r.h + dilation);
  }
  if (x1 < 0) return null;
  return { x0: Math.max(0, x0), y0: Math.max(0, y0), x1: Math.min(W, x1), y1: Math.min(H, y1) };
}

/** 内画布支持掩码 → 最终帧坐标掩码（+padding 平移）。 */
function maskToFinal(compiled, nodeId) {
  const { inner, final, padding } = compiled.sceneMap;
  const mask = compiled.masks[nodeId];
  const out = new Uint8Array(final.w * final.h);
  for (let y = 0; y < inner.h; y++) {
    for (let x = 0; x < inner.w; x++) {
      if (mask[y * inner.w + x]) out[(y + padding) * final.w + (x + padding)] = 1;
    }
  }
  return out;
}

function diffFrames(baseFrame, candFrame) {
  const W = baseFrame.width;
  const pixels = [];
  for (let i = 0; i < baseFrame.rgba.length; i += 4) {
    if (
      baseFrame.rgba[i] !== candFrame.rgba[i] ||
      baseFrame.rgba[i + 1] !== candFrame.rgba[i + 1] ||
      baseFrame.rgba[i + 2] !== candFrame.rgba[i + 2] ||
      baseFrame.rgba[i + 3] !== candFrame.rgba[i + 3]
    ) {
      const p = i / 4;
      pixels.push({ x: p % W, y: Math.floor(p / W) });
    }
  }
  return pixels;
}

/**
 * 校验候选相对基准的保护与影响区域。
 * @param {object} args
 * @param {object} args.baseCompiled      基准 compile 结果
 * @param {object} args.candidateCompiled 候选 compile 结果
 * @param {object} args.plan              applyOperation 返回的 plan
 * @param {Array<{kind:string,target:string}>} [args.preserve] 合并后的保护项（文档 constraints + 请求级）
 * @returns {object} checks { status: 'OK'|'UNCHANGED'|'REJECTED', code?, conflicts[], diff, protections }
 */
export function checkCandidate(args) {
  const { baseCompiled, candidateCompiled, plan } = args;
  const preserve = args.preserve ?? [];
  const baseDoc = baseCompiled.document;
  const candDoc = candidateCompiled.document;
  const conflicts = [];

  /* ---------- 结构完整性（始终执行，不只依赖声明） ---------- */
  for (const field of ['seed', 'canvas', 'style', 'anchor', 'attachments']) {
    if (!deepEqual(baseDoc[field], candDoc[field])) {
      conflicts.push({ kind: 'structure', target: field, message: `资产级字段 '${field}' 在候选中被修改（${plan.id} 不应触碰）` });
    }
  }
  const baseNodes = new Map(baseDoc.nodes.map((n) => [n.id, n]));
  const candNodes = new Map(candDoc.nodes.map((n) => [n.id, n]));
  if (baseNodes.size !== candNodes.size || [...baseNodes.keys()].some((id) => !candNodes.has(id))) {
    conflicts.push({ kind: 'structure', target: 'nodes', message: '候选增删了节点（操作不允许）' });
  }
  for (const [id, baseNode] of baseNodes) {
    const candNode = candNodes.get(id);
    if (!candNode) continue;
    if (id !== plan.target) {
      if (!deepEqual(baseNode, candNode)) conflicts.push({ kind: 'structure', target: id, message: `非目标节点 '${id}' 被修改` });
    } else {
      for (const key of Object.keys(baseNode)) {
        const change = plan.changedFields[key];
        if (change) {
          if (!deepEqual(baseNode[key], change.from) || !deepEqual(candNode[key], change.to)) {
            conflicts.push({ kind: 'structure', target: id, message: `目标节点字段 '${key}' 与操作计划不符（篡改或非授权修改）` });
          }
        } else if (!deepEqual(baseNode[key], candNode[key])) {
          conflicts.push({ kind: 'structure', target: id, message: `目标节点未声明字段 '${key}' 被修改` });
        }
      }
    }
  }

  /* ---------- 前置冲突：目标本身受像素/结构保护 ---------- */
  const pixelPreserve = preserve.filter((p) => p.kind === 'pixels');
  const structurePreserve = preserve.filter((p) => p.kind === 'structure');
  const metadataPreserve = preserve.filter((p) => p.kind === 'metadata');
  for (const p of [...pixelPreserve, ...structurePreserve]) {
    if (p.target === plan.target) {
      conflicts.push({ kind: p.kind, target: p.target, message: `操作目标 '${p.target}' 被声明为${p.kind === 'pixels' ? '像素' : '结构'}保护，不能修改；请先解除保护或改选其他节点`, upfront: true });
    }
  }

  /* ---------- 元数据保护 ---------- */
  for (const p of metadataPreserve) {
    const t = p.target;
    if (t === 'anchor' && !deepEqual(baseDoc.anchor, candDoc.anchor)) conflicts.push({ kind: 'metadata', target: 'anchor', message: '锚点在候选中发生变化' });
    else if (t === 'frameSize' && !deepEqual(baseDoc.canvas, candDoc.canvas)) conflicts.push({ kind: 'metadata', target: 'frameSize', message: '帧尺寸在候选中发生变化' });
    else if (t === 'attachments' && !deepEqual(baseDoc.attachments, candDoc.attachments)) conflicts.push({ kind: 'metadata', target: 'attachments', message: '附件点在候选中发生变化' });
    else if (t.startsWith('attachments.')) {
      const name = t.slice('attachments.'.length);
      if (!deepEqual(baseDoc.attachments[name], candDoc.attachments[name])) conflicts.push({ kind: 'metadata', target: t, message: `附件点 '${name}' 在候选中发生变化` });
    } else if (!METADATA_TARGETS.includes(t) && !t.startsWith('attachments.')) {
      conflicts.push({ kind: 'metadata', target: t, message: `未知元数据保护目标 '${t}'（可用：${METADATA_TARGETS.join(', ')} 或 attachments.<name>）` });
    }
  }

  /* ---------- 像素分析：独立计算允许影响区域 ---------- */
  const baseFrame = baseCompiled.asset.frames[0];
  const candFrame = candidateCompiled.asset.frames[0];
  let diff = { pixels: 0, outside: 0, region: null, samples: [] };
  if (baseFrame.width !== candFrame.width || baseFrame.height !== candFrame.height) {
    conflicts.push({ kind: 'metadata', target: 'frameSize', message: `最终帧尺寸变化 ${baseFrame.width}×${baseFrame.height} → ${candFrame.width}×${candFrame.height}` });
  } else if (!conflicts.some((c) => c.upfront)) {
    const { final } = baseCompiled.sceneMap;
    const baseTarget = baseCompiled.sceneMap.nodes.find((n) => n.id === plan.target);
    const candTarget = candidateCompiled.sceneMap.nodes.find((n) => n.id === plan.target);
    const dilation = plan.id === 'geometry.set' ? 1 : 0; // 几何变化需覆盖 1px 描边邻域；材质/色阶只改矩形内部
    const region = rectDilatedUnion([baseTarget?.frameRect, candTarget?.frameRect], dilation, final.w, final.h);
    // 未变更高层节点的遮挡：其覆盖处最终像素不可能因本操作变化，从允许区域剔除
    const targetLayer = baseTarget?.layer ?? 0;
    const allowed = new Uint8Array(final.w * final.h);
    if (region) {
      for (let y = region.y0; y < region.y1; y++) for (let x = region.x0; x < region.x1; x++) allowed[y * final.w + x] = 1;
    }
    for (const n of baseCompiled.sceneMap.nodes) {
      if (n.id === plan.target || n.layer <= targetLayer) continue;
      const cover = maskToFinal(baseCompiled, n.id);
      for (let i = 0; i < allowed.length; i++) if (cover[i]) allowed[i] = 0;
    }
    const diffPixels = diffFrames(baseFrame, candFrame);
    const outsideSamples = [];
    let outside = 0;
    for (const p of diffPixels) {
      if (!allowed[p.y * final.w + p.x]) {
        outside++;
        if (outsideSamples.length < 8) outsideSamples.push(p);
      }
    }
    diff = { pixels: diffPixels.length, outside, region, samples: outsideSamples };
    if (outside > 0) {
      conflicts.push({ kind: 'pixels', target: plan.target, message: `${outside} 个像素变化落在独立计算的允许影响区域之外（样例 ${outsideSamples.map((p) => `(${p.x},${p.y})`).join(' ')}）`, pixels: outside });
    }
    // 声明的像素保护区域逐一核对
    for (const p of pixelPreserve) {
      const protectedNode = baseCompiled.sceneMap.nodes.find((n) => n.id === p.target);
      if (!protectedNode || !protectedNode.frameBounds) continue;
      const b = protectedNode.frameBounds;
      let hits = 0;
      for (const px of diffPixels) {
        if (px.x >= b.x0 && px.x < b.x1 && px.y >= b.y0 && px.y < b.y1) hits++;
      }
      if (hits > 0) conflicts.push({ kind: 'pixels', target: p.target, message: `像素保护区域 '${p.target}' 内发现 ${hits} 个变化像素`, pixels: hits });
    }
  }

  const rejected = conflicts.length > 0;
  const constraintConflict = conflicts.some((c) => c.upfront);
  return {
    status: rejected ? 'REJECTED' : diff.pixels === 0 ? 'UNCHANGED' : 'OK',
    code: rejected ? (constraintConflict ? 'CONSTRAINT_CONFLICT' : 'CANDIDATE_INVALID') : null,
    conflicts,
    diff,
    protections: {
      pixels: pixelPreserve.map((p) => p.target),
      structure: structurePreserve.map((p) => p.target),
      metadata: metadataPreserve.map((p) => p.target),
    },
  };
}

/** 文档声明的 constraints → 保护项（与请求级 preserve 合并用）。 */
export function preserveFromDocument(doc) {
  return (doc.constraints ?? []).map((c) => ({ kind: c.kind, target: c.target }));
}
