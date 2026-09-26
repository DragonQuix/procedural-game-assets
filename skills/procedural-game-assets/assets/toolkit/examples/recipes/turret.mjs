/**
 * examples/recipes/turret.mjs — 机械示例：哨戒炮塔「鼹鼠」（本工具包原创）
 *
 * 展示：机身与可替换附件分件（基座 + 平射炮管 + 高射炮管）、
 * 正常/损坏状态、左右方向变体。炮管俯仰角通过在 draw 里按角度重画实现，
 * 不旋转像素（见 recipes/machine.js 头注）。
 */
const PAL = Object.freeze({
  h: '#3a4152', H: '#57617a', // 装甲暗/亮
  m: '#23262f', M: '#4a4f60', // 金属暗/亮
  R: '#ff2e44', // 目镜（与黑曜军团同族警示色）
  Y: '#ffb13d', // 警示条纹
  k: '#14161c', // 阴影
});

function drawBase(p, { palette: c }) {
  // 梯形基座 + 顶部转盘 + 警示条纹 + 舱门
  p.poly([[2, 15], [5, 9], [19, 9], [22, 15]], c.h);
  p.rect(5, 9, 14, 2, c.H);
  p.rect(3, 14, 18, 1, c.m);
  p.rect(6, 11, 3, 2, c.Y);
  p.rect(10, 11, 3, 2, c.k);
  p.rect(14, 11, 3, 2, c.Y);
  p.rect(15, 4, 3, 5, c.m); // 舱门凸起（后侧）
  p.ellipse(11, 8, 6, 3, c.m);
  p.ellipse(11, 7, 5, 2.4, c.H);
  p.set(15, 6, c.R); // 目镜
}

function drawBarrel(len, pitch, ox = 2, oy = 3) {
  return (p, { palette: c }) => {
    // 从 (ox,oy) 向右上 pitch 角的炮管；len 决定管长
    const dx = Math.cos(pitch);
    const dy = -Math.sin(pitch);
    const mx = ox + dx * len;
    const my = oy + dy * len;
    p.line(ox, oy, mx, my, c.m, 3);
    p.line(ox + dx * 2, oy + dy * 2 - 1, ox + dx * (len - 2), oy + dy * (len - 2) - 1, c.M, 1);
    p.rect(ox - 2, oy - 2, 4, 5, c.h); // 炮闩
    p.set(Math.round(mx), Math.round(my), c.R);
  };
}

export default {
  kind: 'machine',
  id: 'turret-mole',
  seed: 7,
  palette: PAL,
  parts: [
    {
      id: 'mole_base',
      w: 24,
      h: 16,
      anchor: { x: 12, y: 16 },
      attachments: { barrel: { x: 12, y: 6 } }, // 炮管安装点
      draw: drawBase,
      directions: ['right', 'left'],
      states: ['intact', 'damaged'],
    },
    {
      id: 'mole_barrel_flat',
      w: 18,
      h: 8,
      anchor: { x: 2, y: 4 },
      attachments: { muzzle: { x: 15, y: 3 } },
      draw: drawBarrel(13, 0),
      directions: ['right', 'left'],
      states: ['intact', 'damaged'],
    },
    {
      id: 'mole_barrel_high',
      w: 16,
      h: 12,
      anchor: { x: 3, y: 9 },
      attachments: { muzzle: { x: 9, y: 1 } },
      // 高射仰角 ~50°：按角度重画，帧高显式给足
      draw: drawBarrel(10, Math.PI / 3.6, 3, 9),
      directions: ['right', 'left'],
      states: ['intact', 'damaged'],
    },
  ],
};
