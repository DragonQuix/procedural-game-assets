/**
 * template/demo-content.js — 演示切片的内容数据（关卡、敌人、验收预设）
 *
 * 数据与逻辑分离：main.js（浏览器引导）与 tests 共用同一份内容，
 * 保证浏览器预设画面与机测断言的是同一状态。
 */

export const DEMO_SEED = 20260926;

// 平台放在头顶高度（row7，y112..128）：地面移动与平射子弹（y≈158）从其下通过，
// 跳跃用于登高而非必经——子弹撞图块的语义仍生效（朝上子弹会撞到平台）。
export const DEMO_LEVEL_ROWS = [
  '........................................',
  '........................................',
  '........................................',
  '........................................',
  '........................................',
  '........................................',
  '........................................',
  '..............###.........###...........',
  '........................................',
  '........................................',
  '........................................',
  '########################################',
];

export const DEMO_PLAYER = { x: 40, y: 146, w: 12, h: 30 };

export const DEMO_ENEMIES = [
  { id: 'mole1', x: 200, y: 156, w: 24, h: 20, hp: 3 },
  { id: 'mole2', x: 400, y: 156, w: 24, h: 20, hp: 3 },
  { id: 'mole3', x: 560, y: 156, w: 24, h: 20, hp: 4 },
];

/** 周期性起跳脚本（可选登高） */
export function jumpEvery(ticks, period = 90, base = {}) {
  const seq = [];
  for (let t = 0; t < ticks; t++) {
    const inp = { ...base };
    if (t % period < 22) inp.jump = true;
    seq.push(inp);
  }
  return seq;
}

/** 浏览器验收预设（?preset=fight|win|contact） */
export const PRESETS = {
  fight: [
    ...Array(40).fill({ right: true }),
    ...Array(4).fill({ right: true, fire: true }),
    ...Array(6).fill({ right: true }),
    ...Array(4).fill({ fire: true }),
    ...Array(2).fill({}),
  ],
  win: jumpEvery(760, 90, { right: true, fire: true }),
  contact: [...jumpEvery(70, 90, { right: true }), ...Array(45).fill({ right: true })],
};
