/**
 * template/logic/input.js — 键盘输入 → 输入快照（浏览器侧薄层）
 *
 * 游戏逻辑只消费快照 { left, right, up, fire, jump, pause, restart, pressed }；
 * 测试直接注入快照，不需要键盘。
 *
 * 输入契约（与 game.js 的 step(n, input) 配套）：
 * - held：按物理键跟踪（e.code 优先）。同动作映射多个物理键时，松开其中一个
 *   不影响另一个；动作 held = 任一映射键仍按住。按住时的自动重复 keydown
 *   （e.repeat）不改变状态。
 * - pressed：离散点按事件。每次非重复 keydown 边沿给对应动作的队列 +1
 *   （每动作上限 8，超出丢弃，防止卡顿/失焦期间无限堆积）；每次 snapshot()
 *   每动作消费一条。连续 true 的布尔快照无法表达"按了两次"，必须用 pressed。
 * - 快照字段：snap[k] = 该动作 held 或有未消费点按（一次点按至少读到一 tick
 *   的 true）；snap.pressed[k] = 本次快照消费到一条点按。
 * - clear()：清空全部 held 与点按队列（blur/页面隐藏/unbind 走这里）。
 *   clear({ except }) 保留 except 列出的动作，只清其余（暂停帧丢弃游戏输入
 *   走这里）。被清掉的物理键即使仍按着也不会恢复，直到重新按下——
 *   这是防粘键语义，与失焦清空一致。
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

/** 系统动作（暂停/重启）；其余为游戏动作。暂停帧丢弃输入时保留这两类队列。 */
export const SYSTEM_ACTIONS = ['pause', 'restart'];

/** 绑定到 window（或测试用 EventTarget），返回 { snapshot, clear, unbind }。 */
export function bindKeyboard(target = window) {
  const held = new Map();
  const pending = new Map();
  const actions = [...new Set(Object.values(KEYMAP))];
  const identity = (e) => e.code || e.key.toLowerCase();
  const down = (e) => {
    const k = KEYMAP[e.key];
    if (k) {
      const id = identity(e);
      if (!e.repeat && !held.has(id)) {
        pending.set(k, Math.min(8, (pending.get(k) || 0) + 1));
        held.set(id, k);
      }
      e.preventDefault();
    }
  };
  const up = (e) => {
    held.delete(identity(e));
  };
  // except：保留列出的动作，只清其余（如暂停时丢弃游戏输入但保留暂停/重启队列）
  const clear = ({ except = [] } = {}) => {
    if (except.length === 0) { held.clear(); pending.clear(); return; }
    for (const [id, k] of held) if (!except.includes(k)) held.delete(id);
    for (const k of pending.keys()) if (!except.includes(k)) pending.delete(k);
  };
  const visible = () => { if (target.document?.visibilityState === 'hidden') clear(); };
  target.addEventListener('keydown', down);
  target.addEventListener('keyup', up);
  target.addEventListener('blur', clear);
  target.document?.addEventListener('visibilitychange', visible);
  // pressed 是离散事件；连续 true 快照不能代替两次独立按下。
  const snapshot = () => {
    const snap = { pressed: {} };
    const active = new Set(held.values());
    for (const k of actions) {
      const count = pending.get(k) || 0;
      snap.pressed[k] = count > 0;
      snap[k] = active.has(k) || count > 0;
      if (count) pending.set(k, count - 1);
    }
    return snap;
  };
  const unbind = () => {
    target.removeEventListener('keydown', down);
    target.removeEventListener('keyup', up);
    target.removeEventListener('blur', clear);
    target.document?.removeEventListener('visibilitychange', visible);
    clear();
  };
  return { snapshot, clear, unbind };
}
