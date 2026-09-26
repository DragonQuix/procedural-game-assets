/**
 * examples/faults/clipped-muzzle.mjs — 植入故障 A：枪口被帧约束裁掉
 *
 * 故障：枪长 15 超出 38 宽帧的右缘，clip:'warn' 下烘焙"成功"但枪管被截断。
 * 期望诊断路径：画廊裁剪诊断计数 + 视觉上枪口红点不在管端 → 放大帧或缩短枪长。
 */
import { LEG_POSES } from '../../src/geometry/humanoid.js';
import ember from './shared-ember-data.mjs';

export default {
  ...ember,
  id: 'fault-clipped-muzzle',
  clip: 'warn', // 故障资产故意允许裁剪，模拟"没注意到越界"的配方
  poses: [
    { id: 'stand_fwd', kind: 'rig', legs: LEG_POSES.stand, aim: 'fwd', gunLen: 20 }, // 枪口 x=39 越出 38 宽帧，被截断
  ],
  clips: {},
};
