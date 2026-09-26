/**
 * examples/faults/sliding-run.mjs — 植入故障 D：滑步跑动
 *
 * 故障：跑步 6 帧全部使用站立腿姿（双脚从不离地、身体无起伏），
 * 播放时像在滑行。画廊剪辑播放应直接暴露；正确做法见
 * geometry/humanoid.js 的 runLegs（相位差 + 贴地起伏）。
 */
import { LEG_POSES } from '../../src/geometry/humanoid.js';
import ember from './shared-ember-data.mjs';

const poses = [];
for (let f = 0; f < 6; f++) poses.push({ id: `run${f}`, kind: 'rig', legs: LEG_POSES.stand, aim: 'fwd' });

export default {
  ...ember,
  id: 'fault-sliding-run',
  clip: 'warn',
  poses,
  clips: { run: { frames: poses.map((p) => p.id), ms: 90 } },
};
