/**
 * examples/faults/bad-mirror.mjs — 植入故障 B：镜像帧附件点未随镜像
 *
 * 故障：左向帧由水平镜像得到，但 muzzle 附件点仍按右向坐标填写，
 * 红点落在枪口之外。画廊对比视图（同帧 right/left）应直接暴露。
 * 正确做法：bake/variants.js 的 flipVariant 联动变换像素与附件点（W-x）。
 */
import { bakeHumanoid } from '../../src/recipes/humanoid.js';
import { flipHorizontal } from '../../src/core/transform.js';
import { assembleFrame } from '../../src/bake/frame.js';
import { PixelPainter } from '../../src/core/raster.js';
import { LEG_POSES } from '../../src/geometry/humanoid.js';
import ember from './shared-ember-data.mjs';

export default {
  ...ember,
  id: 'fault-bad-mirror',
  clip: 'warn',
  poses: [{ id: 'stand_fwd', kind: 'rig', legs: LEG_POSES.stand, aim: 'fwd' }],
  clips: {},
  // 手工拼装一个"附件点没镜像"的左向帧（演示没走 flipVariant 的结果）
  postBake(asset) {
    const f = asset.frames[0];
    const mirrored = flipHorizontal(PixelPainter.fromRGBA(f.width, f.height, f.rgba));
    asset.frames.push(
      assembleFrame('stand_fwd_left', mirrored, {
        anchor: { x: f.width - f.anchor.x, y: f.anchor.y },
        attachments: { muzzle: { ...f.attachments.muzzle } }, // 故障：没有随镜像 W-x
        outline: null, // 帧已含描边，不再扩边
      }),
    );
    return asset;
  },
};
