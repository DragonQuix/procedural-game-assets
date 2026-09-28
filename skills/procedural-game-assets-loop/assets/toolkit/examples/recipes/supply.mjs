/**
 * examples/recipes/supply.mjs — 道具示例：补给舱与四种装载（本工具包原创）
 *
 * 展示：共享外壳 + 图标/颜色变体。图标形状各不相同（散射=三弹丸、激光=光束条、
 * 飞弹=火箭、医疗=十字包换外壳），不靠颜色区分种类。
 */

const POD_PAL = Object.freeze({
  H: '#5a6478', h: '#39404f', k: '#20242e', W: '#c5cbe0', Y: '#ffb13d',
  G: '#39d0c4', O: '#ff8a3d', R: '#ff2e44', X: '#e8e8f0',
});

/** 共享补给舱外壳：舱体 + 顶灯 + 支脚。 */
const POD_SHELL = [
  '..hhhhhh..',
  '.hHHHHHHh.',
  'hHHYHHHHWh',
  'hHHHHHHHHh',
  'hHkkkkkkHh',
  '.hHHHHHHh.',
  '..h.hh.h..',
  '.k..kk..k.',
];

const ICON_SCATTER = [
  'O..O..O',
  '.O.O.O.',
];

const ICON_LASER = [
  'GGGGGGG',
  '.GGGGG.',
];

const ICON_MISSILE = [
  '..O..',
  '.OOO.',
  '.OOO.',
  'O.O.O',
];

const MED_SHELL = [
  '.XXXXXX.',
  'XXWWWWXX',
  'XWkRRkWX',
  'XWRRRRWX',
  'XWkRRkWX',
  'XXWWWWXX',
  '.XXXXXX.',
];

const mk = (id, icon, extra = {}) => ({
  kind: 'prop',
  id,
  seed: 5,
  palette: POD_PAL,
  frame: { w: 12, h: 10 },
  shell: POD_SHELL,
  icon,
  iconBox: { x: 2, y: 2, w: 8, h: 3 }, // 图标嵌在舱体中部观察窗
  ...extra,
});

export default [
  mk('pod-scatter', ICON_SCATTER),
  mk('pod-laser', ICON_LASER),
  mk('pod-missile', ICON_MISSILE),
  {
    kind: 'prop',
    id: 'medkit',
    seed: 5,
    palette: POD_PAL,
    frame: { w: 10, h: 9 },
    shell: MED_SHELL, // 不同外壳形状（方形医疗包）
  },
];
