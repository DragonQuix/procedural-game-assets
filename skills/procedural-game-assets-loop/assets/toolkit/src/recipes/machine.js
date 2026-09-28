/**
 * recipes/machine.js — 机械资产配方与烘焙
 *
 * 造型由可信 JS 绘制函数表达（方案 §4：允许可信 JS 配方用组合函数表达复杂造型），
 * 工具包负责：确定性种子、机身/附件分件、正常/损坏状态、方向变体、
 * 锚点/附件点随变换联动、描边组装与校验。
 *
 * MachineSpec（kind: 'machine'）：
 *   id, seed, palette,
 *   parts: [{
 *     id, w, h, anchor?,                          // anchor 默认底边中点
 *     attachments?,                                // 命名关键点（帧内像素边界坐标）
 *     draw(painter, ctx),                          // ctx = { palette, rng }
 *     directions?: ['right','left'],               // 方向变体，默认 ['right']
 *     states?: ['intact','damaged'],               // 状态变体，默认 ['intact']
 *   }]
 * 帧 ID：`<part>[_<direction>][_<state>]`（'right'/'intact' 为默认值时省略，保持短名）。
 *
 * 参数提示：w/h 是显式帧约束（越界默认报错）；方向变体是整帧镜像——
 * 需要任意角度（如 12 向炮管）时应在 draw 里按参数重画，而非旋转像素。
 */
import { PixelPainter } from '../core/raster.js';
import { Rng } from '../core/rng.js';
import { hash2 } from '../core/hash.js';
import { assembleFrame, DEFAULT_OUTLINE } from '../bake/frame.js';
import { assembleAsset } from '../bake/asset.js';
import { flipVariant, damageVariant } from '../bake/variants.js';

function partSeed(specSeed, partId) {
  // 每个部件独立的确定性子种子，不受其他部件影响
  let h = 0;
  for (const ch of String(partId)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return ((typeof specSeed === 'number' ? specSeed : 0) ^ h) >>> 0;
}

export function bakeMachine(spec) {
  if (spec.kind !== 'machine') throw new TypeError(`bakeMachine 收到 kind='${spec.kind}'`);
  if (!Array.isArray(spec.parts) || spec.parts.length === 0) throw new TypeError(`机械 '${spec.id}' 需要 parts`);
  const outline = spec.outline === undefined ? DEFAULT_OUTLINE : spec.outline;
  const frames = [];
  for (const part of spec.parts) {
    if (!Number.isInteger(part.w) || !Number.isInteger(part.h)) throw new TypeError(`机械 '${spec.id}/${part.id}' 需要整数 w/h`);
    if (typeof part.draw !== 'function') throw new TypeError(`机械 '${spec.id}/${part.id}' 需要 draw(painter, ctx)`);
    const directions = part.directions ?? ['right'];
    const states = part.states ?? ['intact'];
    const baseAnchor = part.anchor ?? { x: part.w / 2, y: part.h };
    for (const direction of directions) {
      for (const state of states) {
        const painter = new PixelPainter(part.w, part.h, { clip: part.clip ?? spec.clip ?? 'error' });
        const rng = new Rng(partSeed(spec.seed ?? 0, `${part.id}:${direction}:${state}`));
        part.draw(painter, { palette: spec.palette, rng, direction, state });
        let p = painter;
        let points = { anchor: { ...baseAnchor }, attachments: Object.fromEntries(Object.entries(part.attachments ?? {}).map(([k, v]) => [k, { ...v }])) };
        if (state === 'damaged') ({ painter: p, points } = damageVariant(p, points, { rng: () => rng.next() }));
        if (direction === 'left') ({ painter: p, points } = flipVariant(p, points));
        const suffix = `${direction === 'right' ? '' : `_${direction}`}${state === 'intact' ? '' : `_${state}`}`;
        frames.push(
          assembleFrame(`${part.id}${suffix}`, p, {
            anchor: points.anchor,
            attachments: points.attachments,
            outline,
            diagnostics: painter.diagnostics.empty ? null : painter.diagnostics.toJSON(),
          }),
        );
      }
    }
  }
  return assembleAsset({ id: spec.id, kind: spec.kind, seed: spec.seed ?? 0, frames, clips: spec.clips ?? {} });
}
