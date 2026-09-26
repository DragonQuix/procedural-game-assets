/**
 * examples/recipes/trees.mjs — 植被示例：雨林阔冠树与枯松（本工具包原创）
 *
 * 展示：轮廓与树冠分组先行（canopy 数据决定结构），种子只改叶面斑点与
 * ±1px 内的团块位置；两棵树是"不同结构"，不是"同结构换种子"。
 */

const broadleaf = {
  kind: 'vegetation',
  id: 'tree-broadleaf',
  seed: 11,
  palette: {
    trunk: '#4a3524',
    trunkDark: '#2e2114',
    leafDark: '#1e3a1f',
    leafMid: '#2f5a2c',
    leafLight: '#4d8a3d',
  },
  frame: { w: 48, h: 56 },
  trunk: { x: 24, yBottom: 55, width: 4, height: 30, lean: 2 },
  canopy: [
    { cx: 18, cy: 22, rx: 12, ry: 9, tone: 0, jitter: 1 },
    { cx: 31, cy: 20, rx: 11, ry: 8, tone: 0, jitter: 1 },
    { cx: 24, cy: 16, rx: 12, ry: 8, tone: 1, jitter: 1 },
    { cx: 16, cy: 18, rx: 7, ry: 5, tone: 1, jitter: 1 },
    { cx: 27, cy: 13, rx: 6, ry: 4, tone: 2, jitter: 1 },
    { cx: 20, cy: 12, rx: 4, ry: 3, tone: 2, jitter: 0 },
  ],
  speckle: { density: 0.10, color: '#6fae52' },
};

const deadPine = {
  kind: 'vegetation',
  id: 'tree-deadpine',
  seed: 23,
  palette: {
    trunk: '#3d3128',
    trunkDark: '#241c14',
    leafDark: '#2a3324',
    leafMid: '#44503a',
    leafLight: '#5e6b4c',
  },
  frame: { w: 32, h: 64 },
  trunk: { x: 15, yBottom: 63, width: 3, height: 52, lean: -3 },
  canopy: [
    // 枯枝：稀疏、小而暗，位置严格受控
    { cx: 11, cy: 20, rx: 4, ry: 2, tone: 1, jitter: 0 },
    { cx: 20, cy: 28, rx: 5, ry: 2, tone: 0, jitter: 0 },
    { cx: 10, cy: 36, rx: 4, ry: 2, tone: 0, jitter: 0 },
    { cx: 19, cy: 44, rx: 4, ry: 2, tone: 1, jitter: 0 },
    { cx: 13, cy: 12, rx: 3, ry: 2, tone: 2, jitter: 0 },
  ],
  speckle: { density: 0.05, color: '#77865e' },
};

export default [broadleaf, deadPine];
