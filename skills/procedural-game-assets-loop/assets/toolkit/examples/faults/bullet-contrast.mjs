/**
 * examples/faults/bullet-contrast.mjs — 植入故障 C：敌弹与深背景色太近
 *
 * 故障：敌弹暗红（#7a2430）在夜间深背景上几乎不可读——危险物必须
 * 与背景明显区分。画廊"夜间场景"背景下应直接看不清；灰度变体下
 * 敌弹与背景灰度接近。修复方向：提高明度差 + 换色相（如亮紫红/橙）。
 */

const PAL = Object.freeze({
  P: '#ffe08a', p: '#c8923d', // 玩家弹：亮黄（对照）
  E: '#7a2430', e: '#4a141d', // 敌弹：暗红（故障）
  W: '#ffffff', G: '#39d0c4',
});

function drawBullet(main, dark) {
  return (p) => {
    p.ellipse(6, 3.5, 4, 2, main);
    p.ellipse(4.5, 3.5, 2, 1.4, dark);
    p.set(9, 3, main);
  };
}

export default [
  { kind: 'prop', id: 'bullet-player', seed: 1, palette: PAL, frame: { w: 12, h: 7 }, shell: drawBullet(PAL.P, PAL.p) },
  { kind: 'prop', id: 'bullet-enemy-bad', seed: 1, palette: PAL, frame: { w: 12, h: 7 }, shell: drawBullet(PAL.E, PAL.e) },
];
