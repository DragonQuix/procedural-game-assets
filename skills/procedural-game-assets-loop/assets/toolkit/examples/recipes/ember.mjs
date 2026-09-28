/**
 * examples/recipes/ember.mjs — 兼容样本：主角「余烬」（源自 others_003 characters.js）
 *
 * 数据与原版逐字一致，用于逐像素回归（tests/integration/compat-hero.test.js）。
 * clips 是新增数据（原游戏由状态机驱动帧，没有剪辑表），不影响像素回归。
 */
import { LEG_POSES, runLegs } from '../../src/geometry/humanoid.js';

const R2 = Math.SQRT1_2;

export const HERO_PAL = Object.freeze({
  H: '#2b2230', h: '#4e3f55', S: '#e2a076', s: '#b2694a', k: '#18121c', C: '#1f1b22',
  R: '#d8283b', r: '#8c1628', e: '#ff6a6a',
  G: '#5d6e3c', g: '#3c4a27', L: '#86995c',
  t: '#39424f', T: '#4f5b6c',
  P: '#4a4f62', p: '#2f3342', q: '#687089',
  B: '#2a2124', b: '#4d3f43',
  Y: '#94703f', y: '#5f4526',
  M: '#5a5f70', m: '#2d2f3a', W: '#c5cbe0', O: '#ff8a3d',
});

const HEAD = [
  '..HHHHh.',
  '.HHHHHHH',
  'HHHhHHHH',
  'HHHHSSSs',
  'HCHSSkSS',
  '.HsSSSSs',
  '..sSSSs.',
];

const TORSO = [
  '..eRRRr..',
  '.rRRRRRr.',
  'tgGGGGLLt',
  'tgGGGGGLt',
  '.gGYGGGLg',
  '.gGGGGGLg',
  '.ggGGGGL.',
  '..gGGGL..',
  '.yYYYYYy.',
];

const poses = [];
for (const aim of ['fwd', 'diagUp', 'up']) poses.push({ id: `p_stand_${aim}`, kind: 'rig', legs: LEG_POSES.stand, aim });
poses.push({ id: 'p_stand_diagDown', kind: 'rig', legs: LEG_POSES.lock, aim: 'diagDown' });
for (let f = 0; f < 6; f++) {
  for (const aim of ['fwd', 'diagUp', 'diagDown']) poses.push({ id: `p_run${f}_${aim}`, kind: 'rig', legs: runLegs(f), aim });
}
for (const aim of ['fwd', 'diagUp', 'up', 'diagDown', 'down']) {
  poses.push({ id: `p_fall_${aim}`, kind: 'rig', legs: LEG_POSES.fall, aim });
}
poses.push({ id: 'p_prone', kind: 'prone' });
for (let f = 0; f < 4; f++) poses.push({ id: `p_ball${f}`, kind: 'ball', turn: f });
poses.push({ id: 'p_dead_ground', kind: 'dead' });
poses.push({ id: 'p_dive', kind: 'dive' });

// 原 38×46 帧在底边（y=46）有 1–3px 的腿部笔刷越界，p_prone 左缘（x=-3）有靴子越界；
// 原版静默裁剪。为保持逐像素一致，显式声明 clip:'warn'——绘制行为与原版相同，
// 越界次数随帧诊断记录（见 tests/integration/compat-characters.test.js）。
export default {
  kind: 'humanoid',
  id: 'ember',
  seed: 0,
  clip: 'warn',
  palette: HERO_PAL,
  art: { head: HEAD, torso: TORSO },
  frame: { w: 38, h: 46, feetY: 46, bodyX: 14 },
  rig: {
    hipY: -14,
    shoulderBack: [-3, -21],
    shoulderFront: [3, -21],
    thigh: 6,
    shin: 6,
    thick: 3,
    guns: {
      fwd: { grip: [5, -19], dir: [1, 0], back: 5, len: 11 },
      diagUp: { grip: [4, -21], dir: [R2, -R2], back: 4, len: 10 },
      up: { grip: [3, -20], dir: [0, -1], back: 4, len: 13 },
      diagDown: { grip: [4, -17], dir: [R2, R2], back: 4, len: 10 },
      down: { grip: [2, -16], dir: [0, 1], back: 3, len: 12 },
    },
    proneMuzzle: [19, -4],
    ballCenterY: -14,
  },
  poses,
  clips: {
    stand_fwd: { frames: ['p_stand_fwd'], ms: 1000 },
    run_fwd: { frames: [0, 1, 2, 3, 4, 5].map((f) => `p_run${f}_fwd`), ms: 90 },
    run_diagUp: { frames: [0, 1, 2, 3, 4, 5].map((f) => `p_run${f}_diagUp`), ms: 90 },
    ball: { frames: ['p_ball0', 'p_ball1', 'p_ball2', 'p_ball3'], ms: 60 },
  },
};
