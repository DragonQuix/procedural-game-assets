/**
 * studio/compiler.js — Studio 文档 → 现有 BakedAsset 的纯编译（ADR-0008）
 *
 * 数据流：规范化文档 → 可信内置算子逐节点直绘（各自子画布）→ 按 layer 序 blit 到
 * 内画布 → 既有 assembleFrame / assembleAsset 组装。不新增渲染器与坐标系：
 * 与 bakeProp 同一条底层路径（PixelPainter + assembleFrame + assembleAsset）。
 *
 * 绘制回调来自本文件维护的算子，绝不执行文档中的函数文本。
 * 几何解析只做一次：像素绘制、节点定位（sceneMap）与元数据消费同一结果。
 *
 * BakedAsset.kind 记为 'prop'（单帧静态道具；下游不按 kind 分派，见 ADR-0008 决定 3）。
 */
import { PixelPainter, packColor } from '../core/raster.js';
import { Rng } from '../core/rng.js';
import { assembleFrame, computeBounds } from '../bake/frame.js';
import { assembleAsset } from '../bake/asset.js';
import { partSeed } from '../recipes/machine.js';
import { checkAssetProtection } from './protection-contract.js';
import { evaluateRelations } from './relations.js';
import { normalizeStudioDocument, documentHash, styleHash, fnv1aHex, stableStringify, materialsFor } from './document.js';

/** 节点子种子：复用 machine.parts 的子种子算法；命名空间跨模式版本稳定（ADR-0008/0010）。 */
function nodeSeed(assetSeed, nodeId) {
  return partSeed(assetSeed, `studio/1:${nodeId}`);
}

/* ---------- 可信绘制算子（有限几何 × 有限材质；不是文档驱动的任意代码） ---------- */

function fillPanel(p, node, shades) {
  p.rect(node.x, node.y, node.w, node.h, shades[1]);
}

function fillPanelBevelMetal(p, node, shades) {
  const { x, y, w, h } = node;
  p.rect(x, y, w, h, shades[1]); // base
  p.rect(x, y, w, 1, shades[2]); // 受光上缘
  p.rect(x, y, 1, h, shades[2]); // 受光左缘
  p.rect(x, y + h - 1, w, 1, shades[0]); // 阴影下缘
  p.rect(x + w - 1, y, 1, h, shades[0]); // 阴影右缘
  p.set(x, y, shades[3]); // 左上高光角
}

function fillScreenFlat(p, node, shades) {
  const { x, y, w, h } = node;
  p.rect(x, y, w, h, shades[1]);
  p.rect(x, y, w, 1, shades[0]);
  p.rect(x, y + h - 1, w, 1, shades[0]);
  p.rect(x, y, 1, h, shades[0]);
  p.rect(x + w - 1, y, 1, h, shades[0]);
}

/** 扫描线屏幕：暗色边框 + 每 3 行一条暗扫描线 + 确定性"字符"短划（终端读数感）。 */
function fillScreenScanlines(p, node, shades, rng) {
  fillScreenFlat(p, node, shades);
  const { x, y, w, h } = node;
  for (let j = y + 1; j < y + h - 1; j++) {
    if ((j - y) % 3 === 0) p.rect(x + 1, j, w - 2, 1, shades[0]);
  }
  for (let gy = y + 2; gy <= y + h - 3; gy += 2) {
    let cx = x + 2;
    while (cx < x + w - 3) {
      if (rng.next() < 0.55) {
        const len = 1 + Math.floor(rng.next() * 3);
        p.rect(cx, gy, Math.min(len, x + w - 2 - cx), 1, rng.next() < 0.8 ? shades[2] : shades[3]);
        cx += len + 1;
      } else {
        cx += 2;
      }
    }
  }
}

/** 节点几何的包围盒（内画布坐标，声明语义；实际像素包围盒见 sceneMap.bounds）。 */
export function nodeRect(node) {
  if (node.kind === 'poly') {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [vx, vy] of node.vertices) {
      x0 = Math.min(x0, vx);
      y0 = Math.min(y0, vy);
      x1 = Math.max(x1, vx);
      y1 = Math.max(y1, vy);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  if (node.kind === 'disc') return { x: node.cx - node.rx, y: node.cy - node.ry, w: node.rx * 2, h: node.ry * 2 };
  return { x: node.x, y: node.y, w: node.w, h: node.h };
}

/**
 * shade-diag：风格化对角体积概括（ADR-0010）。在节点自身包围盒上按对角参数 t
 * （左上 0 → 右下 1）分带：t<0.15 高光(3)、t<0.4 受光(2)、t<0.75 基色(1)、其余阴影(0)。
 * 只改已有不透明像素；是风格化概括，不是物理光照；尺寸过小时分带自然塌缩，不制造杂点。
 */
function applyShadeDiag(p, node, shades) {
  const rect = nodeRect(node);
  const span = Math.max(1, rect.w + rect.h - 2);
  p.map((x, y) => {
    const t = (x - rect.x + (y - rect.y)) / span;
    if (t < 0.15) return shades[3];
    if (t < 0.4) return shades[2];
    if (t < 0.75) return shades[1];
    return shades[0];
  });
}

function fillPoly(p, node, shades) {
  p.poly(node.vertices, shades[1]);
}

function fillDisc(p, node, shades) {
  p.ellipse(node.cx, node.cy, node.rx, node.ry, shades[1]);
}

const SHAPE_FILL = Object.freeze({
  panel: fillPanel,
  screen: fillScreenFlat,
  poly: fillPoly,
  disc: fillDisc,
});

const DRAW_OPERATORS = Object.freeze({
  'panel/flat': (p, node, shades) => fillPanel(p, node, shades),
  'panel/bevel-metal': (p, node, shades) => fillPanelBevelMetal(p, node, shades),
  'panel/shade-diag': (p, node, shades) => {
    fillPanel(p, node, shades);
    applyShadeDiag(p, node, shades);
  },
  'screen/flat': (p, node, shades) => fillScreenFlat(p, node, shades),
  'screen/scanlines': (p, node, shades, rng) => fillScreenScanlines(p, node, shades, rng),
  'poly/flat': (p, node, shades) => fillPoly(p, node, shades),
  'poly/shade-diag': (p, node, shades) => {
    fillPoly(p, node, shades);
    applyShadeDiag(p, node, shades);
  },
  'disc/flat': (p, node, shades) => fillDisc(p, node, shades),
  'disc/shade-diag': (p, node, shades) => {
    fillDisc(p, node, shades);
    applyShadeDiag(p, node, shades);
  },
});

/** 节点色阶：共享引用查 style.ramps；{ shades } 局部覆盖直接使用（互不影响同名共享色阶）。 */
function rampShades(node, ramps) {
  if (typeof node.ramp === 'string') {
    const ramp = Object.hasOwn(ramps, node.ramp) ? ramps[node.ramp] : null;
    if (!ramp) throw new Error(`节点 '${node.id}' 引用不存在的色阶 '${node.ramp}'（内部校验遗漏）`);
    return ramp;
  }
  return node.ramp.shades;
}

function drawNode(sub, node, ramps, assetSeed) {
  const shades = rampShades(node, ramps).map((c) => packColor(c));
  const op = DRAW_OPERATORS[`${node.kind}/${node.material}`];
  if (!op) throw new Error(`节点 '${node.id}' 的 ${node.kind}/${node.material} 无绘制算子（内部校验遗漏）`);
  op(sub, node, shades, new Rng(nodeSeed(assetSeed, node.id)));
}

/* ---------- 编译 ---------- */

/**
 * 渲染内容哈希：最终帧 RGBA + 锚点/附件点/包围盒（不含工具版本与路径）。
 */
export function renderHash(frame) {
  const meta = stableStringify({ anchor: frame.anchor, attachments: frame.attachments, bounds: frame.bounds, width: frame.width, height: frame.height });
  return fnv1aHex(meta) + ':' + fnv1aHex(frame.rgba);
}

/**
 * 把 Studio 文档编译为现有 BakedAsset 与编辑侧 sceneMap。
 * @param {object} doc 原始 JSON 文档（函数内规范化，不改动入参）
 * @param {object} [opts]
 * @param {string} [opts.toolVersion] 工具/渲染器版本（由 IO 层注入，核心不读 FS）
 * @returns {{ asset: BakedAsset, sceneMap: object, hashes: object, diagnostics: object }}
 */
export function compileStudioDocument(doc, opts = {}) {
  const normalized = normalizeStudioDocument(doc);
  const { canvas } = normalized;
  const padPx = canvas.outline ? 1 : 0;

  // layer 升序，同层按文档顺序（稳定）
  const order = normalized.nodes.map((node, index) => ({ node, index })).sort((a, b) => a.node.layer - b.node.layer || a.index - b.index);

  const main = new PixelPainter(canvas.w, canvas.h, { clip: 'error' });
  const sceneNodes = [];
  const masks = {};
  for (const { node } of order) {
    const sub = new PixelPainter(canvas.w, canvas.h, { clip: 'error' });
    drawNode(sub, node, normalized.style.ramps, normalized.seed);
    main.blit(sub, 0, 0);
    const bounds = computeBounds(sub);
    let opaquePixels = 0;
    const mask = new Uint8Array(canvas.w * canvas.h); // 支持掩码：内画布坐标，1 = 本节点不透明
    for (let i = 0; i < sub.data.length; i++) {
      if (sub.data[i] >>> 24) {
        opaquePixels++;
        mask[i] = 1;
      }
    }
    masks[node.id] = mask;
    const rect = nodeRect(node); // 声明几何包围盒（poly/disc 由顶点/半径求得），内画布坐标
    sceneNodes.push({
      id: node.id,
      kind: node.kind,
      layer: node.layer,
      ramp: node.ramp,
      material: node.material,
      rect,
      bounds,
      opaquePixels,
      // 最终帧坐标（含 assembleFrame 的 1px 描边扩边，ADR-0002 padding 平移规则）
      frameRect: { x: rect.x + padPx, y: rect.y + padPx, w: rect.w, h: rect.h },
      frameBounds: bounds ? { x0: bounds.x0 + padPx, y0: bounds.y0 + padPx, x1: bounds.x1 + padPx, y1: bounds.y1 + padPx } : null,
    });
  }

  const frame = assembleFrame(normalized.id, main, {
    anchor: normalized.anchor,
    attachments: normalized.attachments,
    outline: canvas.outline,
  });
  const asset = assembleAsset({ id: normalized.id, kind: 'prop', seed: normalized.seed, frames: [frame], clips: {} });

  const sceneMap = {
    frameId: frame.id,
    inner: { w: canvas.w, h: canvas.h },
    final: { w: frame.width, h: frame.height },
    padding: padPx,
    outline: canvas.outline,
    nodes: sceneNodes,
  };
  const hashes = {
    documentHash: documentHash(normalized),
    styleHash: styleHash(normalized),
    renderHash: renderHash(frame),
    toolVersion: opts.toolVersion ?? 'unknown',
  };
  const diagnostics = {
    nodeCount: sceneNodes.length,
    clipped: main.diagnostics.clips,
    constraintsDeclared: normalized.constraints.length, // 声明计数；强制执行证据见候选 checks（store/protect）
  };
  const compiled = { asset, sceneMap, masks, hashes, diagnostics, document: normalized };
  compiled.protectionBaseline = normalized.protection ? compileStudioDocument(normalized.protection.baseline, opts) : null;
  compiled.protection = checkAssetProtection(normalized.protection, compiled.protectionBaseline, compiled, opts.protectionContext);
  compiled.relations = evaluateRelations(compiled, opts.protectionContext);
  return compiled;
}

/** 显式建立新的保护合同；不会从 edit 请求中猜测或自动迁移旧工作区。 */
export function createProtectedDocument(doc, rules) {
  const baseline = normalizeStudioDocument(doc);
  if (baseline.protection) throw new Error('已有保护合同，不能隐式重置基线');
  const relations = baseline.relations;
  delete baseline.relations;
  baseline.schemaVersion = 'pga-studio/2';
  return normalizeStudioDocument({ ...baseline, schemaVersion: relations ? 'pga-studio/4' : 'pga-studio/3', ...(relations ? { relations } : {}), protection: {
    schemaVersion: 'pga-protection/1', coordinateSpace: 'final-frame',
    protectedRegions: [], metadataPaths: [], nodeIds: [], ...rules, baseline,
  } });
}

/**
 * 节点能力声明（inspect 用）：当前文档下每个节点支持的操作、参数范围与单位。
 * 操作由 operators.js 执行；此处为静态范围元数据，供 agent 不猜字段。
 */
export function describeCapabilities(doc) {
  const normalized = normalizeStudioDocument(doc);
  const { canvas, style } = normalized;
  const version = normalized.schemaVersion;
  const nodes = {};
  for (const node of normalized.nodes) {
    let geometryFields;
    if (node.kind === 'poly') {
      geometryFields = {
        vertices: { type: 'array', item: '[x,y] 整数对', minLength: 3, maxLength: 8, x: { min: 0, max: canvas.w }, y: { min: 0, max: canvas.h } },
      };
    } else if (node.kind === 'disc') {
      geometryFields = {
        cx: { type: 'integer', min: node.rx, max: canvas.w - node.rx },
        cy: { type: 'integer', min: node.ry, max: canvas.h - node.ry },
        rx: { type: 'integer', min: 1, max: Math.min(node.cx, canvas.w - node.cx) },
        ry: { type: 'integer', min: 1, max: Math.min(node.cy, canvas.h - node.cy) },
      };
    } else {
      geometryFields = {
        x: { type: 'integer', min: 0, max: canvas.w - node.w },
        y: { type: 'integer', min: 0, max: canvas.h - node.h },
        w: { type: 'integer', min: 1, max: canvas.w - node.x },
        h: { type: 'integer', min: 1, max: canvas.h - node.y },
      };
    }
    const rampOp = { status: 'available-m2', options: Object.keys(style.ramps) };
    if (version !== 'pga-studio/1') {
      rampOp.localOverride = { form: '{ "shades": ["#rrggbb" × 4] }', note: '节点级局部覆盖，不影响共享色阶与其他节点' };
    }
    nodes[node.id] = {
      kind: node.kind,
      operations: {
        'geometry.set': { status: 'available-m2', unit: 'px', fields: geometryFields },
        'material.set': { status: 'available-m2', options: materialsFor(node.kind, version) },
        'ramp.set': rampOp,
        ...(['panel', 'screen'].includes(node.kind) ? {
          widen_about_center: { status: 'available-v1.3', params: ['deltaWidth'], invariant: 'centerX', integerPolicy: 'reject-fractional-position' },
          squash_keep_base: { status: 'available-v1.3', params: ['deltaHeight <= 0'], invariant: 'bottomY' },
          resize_about_anchor: { status: 'available-v1.3', params: ['deltaWidth|targetWidth', 'deltaHeight|targetHeight', 'anchor'], anchors: ['center', 'bottom-center', 'top-left', '{x,y} normalized'], invariant: 'anchorPoint' },
        } : { semanticTransforms: { status: 'UNSUPPORTED' } }),
      },
      example: { operation: 'geometry.set', target: node.id, params: node.kind === 'poly' ? { vertices: node.vertices.map(([a, b]) => [Math.min(canvas.w, a + 1), b]) } : node.kind === 'disc' ? { rx: node.rx + 1 } : { w: node.w + 2 } },
    };
  }
  return {
    schemaVersion: normalized.schemaVersion,
    limits: { canvasMax: 512, nodesMax: 64, rampShades: 4, verticesMax: 8 },
    nodes,
    relations: { status: normalized.relations?.length ? 'CONFIGURED' : 'NOT_CONFIGURED', types: ['contact'],
      geometry: ['panel', 'screen'], preserveRelations: 'true | [relationId]',
      policies: ['translate-follower', 'resize-follower-edge'], finalValidation: 'required relations AND protection' },
  };
}
