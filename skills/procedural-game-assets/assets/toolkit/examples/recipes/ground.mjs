/**
 * examples/recipes/ground.mjs — 地形示例：崖壁岩层（本工具包原创）
 *
 * 展示：世界坐标纹理（跨块连续）、顶边地表、裸露侧边、角部组合。
 * bake 列表里 adjacent_a/adjacent_b 是一对水平相邻块，供接缝检查。
 */

export default {
  kind: 'terrain',
  id: 'ground-cliff',
  seed: 31,
  palette: {
    fill: ['#4a4038', '#52473d', '#453b34'], // 岩土底色族（明度相近，防噪点跳跃）
    top: { surface: '#5e6e3c', surfaceDark: '#47542e', lip: '#86995c', depth: 3 },
    side: { edge: '#241f1a', depth: 4 },
  },
  tile: { size: 16 },
  noise: { light: 0.07, dark: 0.07 },
  bake: [
    { id: 'fill', worldX: 0, worldY: 32 },
    { id: 'top', worldX: 0, worldY: 0, edge: 'top' },
    { id: 'left', worldX: 0, worldY: 16, edge: 'left' },
    { id: 'right', worldX: 16, worldY: 16, edge: 'right' },
    { id: 'bottom', worldX: 0, worldY: 32, edge: 'bottom' },
    { id: 'top_left', worldX: 0, worldY: 0, edge: ['top', 'left'] },
    { id: 'top_right', worldX: 16, worldY: 0, edge: ['top', 'right'] },
    { id: 'adjacent_a', worldX: 0, worldY: 48 },
    { id: 'adjacent_b', worldX: 16, worldY: 48 },
  ],
};
