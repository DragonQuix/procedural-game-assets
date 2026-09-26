/**
 * template/logic/input.js — 键盘输入 → 输入快照（浏览器侧薄层）
 *
 * 游戏逻辑只消费快照 { left, right, up, fire, jump, pause, restart }；
 * 测试直接注入快照，不需要键盘。
 */

const KEYMAP = {
  ArrowLeft: 'left',
  a: 'left',
  A: 'left',
  ArrowRight: 'right',
  d: 'right',
  D: 'right',
  ArrowUp: 'up',
  w: 'up',
  W: 'up',
  j: 'fire',
  J: 'fire',
  x: 'fire',
  X: 'fire',
  k: 'jump',
  K: 'jump',
  ' ': 'jump',
  z: 'jump',
  Z: 'jump',
  Escape: 'pause',
  Enter: 'pause',
  r: 'restart',
  R: 'restart',
};

/** 绑定到 window，返回读取当前快照的函数。unbind() 解除监听。 */
export function bindKeyboard(target = window) {
  const held = new Set();
  const down = (e) => {
    const k = KEYMAP[e.key];
    if (k) {
      held.add(k);
      if (['left', 'right', 'up', 'jump'].includes(k)) e.preventDefault();
    }
  };
  const up = (e) => {
    const k = KEYMAP[e.key];
    if (k) held.delete(k);
  };
  target.addEventListener('keydown', down);
  target.addEventListener('keyup', up);
  const snapshot = () => ({
    left: held.has('left'),
    right: held.has('right'),
    up: held.has('up'),
    fire: held.has('fire'),
    jump: held.has('jump'),
    pause: held.has('pause'),
    restart: held.has('restart'),
  });
  const unbind = () => {
    target.removeEventListener('keydown', down);
    target.removeEventListener('keyup', up);
  };
  return { snapshot, unbind };
}
