/**
 * examples/recipes/legion.mjs — 兼容样本：黑曜军团（源自 others_003 characters.js）
 *
 * 一个配方文件导出角色族：普通军团兵、狙击手、重装兵三个 spec。
 * 数据与原版逐字一致，用于逐像素回归。
 */
import { LEG_POSES, runLegs } from '../../src/geometry/humanoid.js';

const R2 = Math.SQRT1_2;

export const LEGION_PAL = Object.freeze({
  H: '#3b4254', h: '#5e6882', V: '#ff2e44', k: '#1c1f28', C: '#1a1a20',
  G: '#4d5b74', g: '#323c50', L: '#7385a3', e: '#ff2e44',
  t: '#2b303c', T: '#3d4556',
  P: '#3a3f4d', p: '#262a34', q: '#56607a',
  B: '#1a1a20', b: '#34343e',
  Y: '#5d5242', y: '#3d3529',
  M: '#484a56', m: '#24242c', W: '#b0b0c4', O: '#ff3d6a',
});

const SNIPER_PAL = Object.freeze({
  ...LEGION_PAL,
  G: '#4b5a36', g: '#2f3a22', L: '#6d7c4e', H: '#4b5a36', h: '#6d7c4e',
});

const HEAVY_PAL = Object.freeze({
  ...LEGION_PAL,
  G: '#6b5a3a', g: '#46391f', L: '#98835a', H: '#4a3f33', h: '#6e604c',
  P: '#3a3530', p: '#26221e', q: '#5a5248',
});

const LEGION_HEAD = [
  '..hHHHh.',
  '.hHHHHHH',
  'hHHHHHHH',
  'HHHHVVVV',
  'HHHkkkkk',
  '.Hkkkkkk',
  '..kkkkk.',
];

const LEGION_TORSO = [
  '..kkkkk..',
  '.kGGGGGk.',
  'tgGGLGGGt',
  'tgGGLGeGt',
  '.gGGLGGGg',
  '.gGGGGGGg',
  '.ggGGGGg.',
  '..gGGGg..',
  '.yYYYYYy.',
];

const SNIPER_HEAD = [
  '..gGGGg.',
  '.gGGGGGG',
  'gGGGGGGG',
  'GGGGkkVk',
  'GGGkkkkk',
  '.Gkkkkk.',
  '..kkkk..',
];

const HEAVY_HEAD = [
  '...hHHHh..',
  '..hHHHHHH.',
  '.hHHHHHHHH',
  '.HHHHVVVVV',
  'HHHHHkkkkk',
  'HHHHkkkkkk',
  '.HHkkkkkk.',
  '..kkkkkk..',
];

const HEAVY_TORSO = [
  '...kkkkkkkk...',
  '..kGGGGGGGGk..',
  'tTgGGGLGGGGGTt',
  'tTgGGGLGGGGGTt',
  'tTgGGGLGeGGGTt',
  '.tgGGGLGGGGGt.',
  '.tgGGGLGGGGGt.',
  '..gGGGLGGGGg..',
  '..gGGGGGGGGg..',
  '..ggGGGGGGgg..',
  '..yYYYYYYYYy..',
];

const GUNS = {
  fwd: { grip: [5, -19], dir: [1, 0], back: 5, len: 11 },
  diagUp: { grip: [4, -21], dir: [R2, -R2], back: 4, len: 10 },
  up: { grip: [3, -20], dir: [0, -1], back: 4, len: 13 },
  diagDown: { grip: [4, -17], dir: [R2, R2], back: 4, len: 10 },
  down: { grip: [2, -16], dir: [0, 1], back: 3, len: 12 },
};

const FRAME = { w: 38, h: 46, feetY: 46, bodyX: 14 };

// 与 ember 相同的底边笔刷越界（heavy 为 y=46–47 两行）：显式 clip:'warn' 保持逐像素一致。

const baseRig = {
  hipY: -14,
  shoulderBack: [-3, -21],
  shoulderFront: [3, -21],
  thigh: 6,
  shin: 6,
  thick: 3,
  guns: GUNS,
  proneMuzzle: [19, -4],
  ballCenterY: -14,
};

/** 普通军团兵：突击兵、步枪兵、迫击炮手。 */
const legionPoses = [];
for (let f = 0; f < 6; f++) legionPoses.push({ id: `trooper_run${f}`, kind: 'rig', legs: runLegs(f), aim: 'fwd', gunLen: 8 });
legionPoses.push({ id: 'trooper_aim', kind: 'rig', legs: LEG_POSES.stand, aim: 'fwd', gunLen: 8 });
legionPoses.push({ id: 'trooper_jump', kind: 'rig', legs: LEG_POSES.fall, aim: 'fwd', gunLen: 8 });
legionPoses.push({ id: 'rifleman_hide', kind: 'rig', legs: LEG_POSES.crouch, aim: 'fwd', gunLen: 8 });
for (const aim of ['fwd', 'diagUp', 'up', 'diagDown']) {
  legionPoses.push({ id: `rifleman_${aim}`, kind: 'rig', legs: LEG_POSES.lock, aim, gunLen: 9 });
}
legionPoses.push({ id: 'legion_dead', kind: 'dead' });
legionPoses.push({ id: 'mortar_crew', kind: 'rig', legs: LEG_POSES.kneel, aim: null });

const legion = {
  kind: 'humanoid',
  id: 'legion',
  clip: 'warn',
  seed: 0,
  palette: LEGION_PAL,
  art: { head: LEGION_HEAD, torso: LEGION_TORSO },
  frame: FRAME,
  rig: baseRig,
  poses: legionPoses,
  clips: {
    trooper_run: { frames: [0, 1, 2, 3, 4, 5].map((f) => `trooper_run${f}`), ms: 100 },
  },
};

const sniper = {
  kind: 'humanoid',
  id: 'legion-sniper',
  clip: 'warn',
  seed: 0,
  palette: SNIPER_PAL,
  art: { head: SNIPER_HEAD, torso: LEGION_TORSO },
  frame: FRAME,
  rig: baseRig,
  poses: ['fwd', 'diagUp', 'diagDown'].map((aim) => ({ id: `sniper_${aim}`, kind: 'rig', legs: LEG_POSES.kneel, aim, gunLen: 15 })),
  clips: {},
};

const heavyPoses = [];
for (let f = 0; f < 6; f++) {
  heavyPoses.push({
    id: `heavy_walk${f}`,
    kind: 'rig',
    legs: runLegs(f).map(([t, b]) => [t * 0.55, b * 0.6]),
    aim: 'fwd',
    gunLen: 14,
  });
}
heavyPoses.push({ id: 'heavy_fire', kind: 'rig', legs: LEG_POSES.lock, aim: 'fwd', gunLen: 14 });
heavyPoses.push({ id: 'heavy_stomp', kind: 'rig', legs: LEG_POSES.crouch, aim: 'diagDown', gunLen: 12 });

const heavy = {
  kind: 'humanoid',
  id: 'legion-heavy',
  clip: 'warn',
  seed: 0,
  palette: HEAVY_PAL,
  art: { head: HEAVY_HEAD, torso: HEAVY_TORSO },
  frame: FRAME,
  rig: { ...baseRig, thick: 4, thigh: 7, shin: 7, heavyGun: true, torsoDrop: 1 },
  poses: heavyPoses,
  clips: {
    heavy_walk: { frames: [0, 1, 2, 3, 4, 5].map((f) => `heavy_walk${f}`), ms: 130 },
  },
};

export default [legion, sniper, heavy];
