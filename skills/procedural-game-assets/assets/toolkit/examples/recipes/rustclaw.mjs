/**
 * examples/recipes/rustclaw.mjs — 新角色「锈爪」拾荒者（本工具包原创）
 *
 * 与兼容样本刻意拉开差异：矮壮体型（腿更短更粗、躯干更宽）、
 * 焊接面罩 + 全覆式青色目镜带、大背包、短粗铆钉枪；锈橙/沙色 + 青色点缀。
 * 覆盖站立、跑动、瞄准、下落与特殊动作（brace 跪姿压制）。
 */
import { LEG_POSES, runLegs } from '../../src/geometry/humanoid.js';

const R2 = Math.SQRT1_2;

export const RUST_PAL = Object.freeze({
  A: '#8a4b26', a: '#5e3018', // 风帽锈橙/暗
  V: '#39d0c4', E: '#8ff0e8', // 目镜青/亮
  k: '#241812', // 面部阴影
  K: '#7a4a24', L: '#a86a34', // 外套主色/亮
  G: '#7a4a24', g: '#5e3a1c', // 球形态用（同外套）
  B: '#33261c', b: '#4a382a', // 靴与背包
  Y: '#c98f3f', y: '#8a5f26', // 铜扣腰带
  P: '#46352a', p: '#2e2118', q: '#6b5442', // 腿
  t: '#3d2b1a', T: '#5a4028', // 手臂后/前
  C: '#241a12', // 手套
  m: '#3a3226', M: '#6b5e4a', W: '#e8ddc0', O: '#ff9a3d', // 枪：暗钢/铜/枪口/强调
});

/** 焊接面罩 + 全覆式目镜带（面罩朝右）。 */
const HEAD = [
  '..AAAA..',
  '.AAAAAa.',
  'AAAAAAAA',
  'AAVVVVEk',
  'AAAVVVkk',
  '.AAkkkkk',
  '..kkkk..',
];

/** 宽躯干：左侧大背包，铜扣腰带。 */
const TORSO = [
  'BB.........',
  'BBbKKKKKKK.',
  'BBKKKKLLLKk',
  'BbKKKLLKKKk',
  '.bKKKYKKKKk',
  '.bKKKKKKKk.',
  '..KKKKKKk..',
  '..kKKKKk...',
  '..yYYYYYy..',
];

const poses = [];
for (const aim of ['fwd', 'diagUp', 'up']) poses.push({ id: `stand_${aim}`, kind: 'rig', legs: LEG_POSES.stand, aim });
for (let f = 0; f < 6; f++) poses.push({ id: `run${f}_fwd`, kind: 'rig', legs: runLegs(f), aim: 'fwd' });
poses.push({ id: 'fall_fwd', kind: 'rig', legs: LEG_POSES.fall, aim: 'fwd' });
poses.push({ id: 'fall_down', kind: 'rig', legs: LEG_POSES.fall, aim: 'down' });
poses.push({ id: 'brace', kind: 'rig', legs: LEG_POSES.kneel, aim: 'diagDown', gunLen: 8 });
poses.push({ id: 'dead_ground', kind: 'dead' });

export default {
  kind: 'humanoid',
  id: 'rustclaw',
  seed: 42,
  palette: RUST_PAL,
  art: { head: HEAD, torso: TORSO },
  frame: { w: 40, h: 46, feetY: 44, bodyX: 20 }, // h 比 feetY 多 2px：粗笔刷在脚底下的余量，无需声明裁剪
  rig: {
    hipY: -11,
    hipSpread: 2,
    shoulderBack: [-5, -16],
    shoulderFront: [5, -16],
    thigh: 4,
    shin: 4,
    thick: 4,
    heavyGun: true,
    torsoDrop: 1,
    guns: {
      fwd: { grip: [7, -14], dir: [1, 0], back: 3, len: 7 },
      diagUp: { grip: [6, -16], dir: [R2, -R2], back: 3, len: 7 },
      up: { grip: [4, -15], dir: [0, -1], back: 3, len: 9 },
      diagDown: { grip: [6, -12], dir: [R2, R2], back: 3, len: 7 },
      down: { grip: [4, -11], dir: [0, 1], back: 3, len: 6 }, // 粗笔刷向下枪口短一些，避免插进地面
    },
    proneMuzzle: [17, -4],
    ballCenterY: -11,
  },
  poses,
  clips: {
    stand_fwd: { frames: ['stand_fwd'], ms: 1000 },
    run_fwd: { frames: [0, 1, 2, 3, 4, 5].map((f) => `run${f}_fwd`), ms: 110 },
    brace: { frames: ['brace'], ms: 1000 },
    fall_fwd: { frames: ['fall_fwd'], ms: 1000 },
  },
};
