import test from 'node:test';
import assert from 'node:assert/strict';
import { bindKeyboard, SYSTEM_ACTIONS } from '../../examples/canvas-slice/template/logic/input.js';
import { createGame } from '../../examples/canvas-slice/template/logic/game.js';
import { makeLevel } from '../../examples/canvas-slice/template/logic/collision.js';

function setup() {
  const target = new EventTarget();
  target.document = new EventTarget();
  const emit = (type, key, extra = {}) => {
    const e = new Event(type, { cancelable: true });
    Object.assign(e, { key, ...extra });
    target.dispatchEvent(e);
  };
  const kb = bindKeyboard(target);
  const tap = (key) => { emit('keydown', key); emit('keyup', key); };
  return { target, emit, tap, kb };
}
const game = () => createGame({ level: makeLevel(['..........', '##########']), content: {
  frames: {}, player: { x: 16, y: 0 }, enemies: [{ x: 140, y: 0 }],
} });

test('亚帧点按只补一 tick，长按和自动重复不堆积', () => {
  const { kb, tap, emit } = setup();
  tap('k');
  assert.equal(kb.snapshot().jump, true);
  assert.equal(kb.snapshot().jump, false);
  emit('keydown', 'j');
  assert.equal(kb.snapshot().pressed.fire, true);
  emit('keydown', 'j', { repeat: true });
  assert.equal(kb.snapshot().pressed.fire, false);
  assert.equal(kb.snapshot().fire, true);
  emit('keyup', 'j');
  assert.equal(kb.snapshot().fire, false);
});

test('连续暂停点按通过事件契约暂停再恢复，不被 true/true 吞并', () => {
  const { kb, tap } = setup();
  const g = game();
  tap('Escape'); tap('Escape');
  g.step(1, kb.snapshot()); assert.equal(g.paused, true);
  g.step(1, kb.snapshot()); assert.equal(g.paused, false);
  assert.equal(kb.snapshot().pressed.pause, false);
});

test('按住暂停键只触发一次，held 快照不产生新的 pressed 事件', () => {
  const { kb, emit } = setup();
  const g = game();
  emit('keydown', 'Escape');
  g.step(1, kb.snapshot()); assert.equal(g.paused, true);
  const snap = kb.snapshot();
  assert.equal(snap.pause, true);          // held 仍读 true
  assert.equal(snap.pressed.pause, false); // 但不是新点按
  g.step(1, snap); assert.equal(g.paused, true);
  emit('keyup', 'Escape');
  emit('keydown', 'Escape'); emit('keyup', 'Escape');
  g.step(1, kb.snapshot()); assert.equal(g.paused, false);
});

test('同一快照 step(n) 的离散事件仅应用一次，旧布尔接口保持边沿语义', () => {
  const { kb, tap } = setup();
  const g = game();
  tap('Escape'); g.step(4, kb.snapshot()); assert.equal(g.paused, true);
  g.step(1, {}); g.step(4, { pause: true }); assert.equal(g.paused, false);
  tap('r'); g.step(1, kb.snapshot()); assert.equal(g.state().tick, 0);
  tap('r'); g.step(1, kb.snapshot()); assert.equal(g.state().tick, 0);
});

test('同动作多物理键与 Shift 释放：松一个不清掉另一个', () => {
  const { kb, emit } = setup();
  emit('keydown', 'a', { code: 'KeyA' });
  emit('keydown', 'ArrowLeft', { code: 'ArrowLeft' });
  kb.snapshot(); kb.snapshot();
  emit('keyup', 'A', { code: 'KeyA' });
  assert.equal(kb.snapshot().left, true);
  emit('keyup', 'ArrowLeft', { code: 'ArrowLeft' });
  assert.equal(kb.snapshot().left, false);
});

test('blur、隐藏、clear、unbind 清空 held 和队列；解绑移除全部监听', () => {
  for (const kind of ['blur', 'hidden', 'clear', 'unbind']) {
    const { kb, emit, target, tap } = setup();
    emit('keydown', 'j'); tap('k');
    if (kind === 'blur') emit('blur');
    else if (kind === 'hidden') {
      target.document.visibilityState = 'hidden';
      target.document.dispatchEvent(new Event('visibilitychange'));
    } else kb[kind]();
    assert.equal(kb.snapshot().fire, false);
    assert.equal(kb.snapshot().jump, false);
    if (kind === 'unbind') { tap('k'); assert.equal(kb.snapshot().jump, false); }
  }
});

test('队列每动作最多 8 条，重复事件在失焦清空后不会复活按键', () => {
  const { kb, tap, emit } = setup();
  for (let i = 0; i < 30; i++) tap('k');
  for (let i = 0; i < 8; i++) assert.equal(kb.snapshot().pressed.jump, true);
  assert.equal(kb.snapshot().jump, false);
  emit('blur'); emit('keydown', 'j', { repeat: true });
  assert.equal(kb.snapshot().fire, false);
});

test('clear({ except }) 只清游戏动作，保留暂停/重启点按队列', () => {
  const { kb, emit, tap } = setup();
  emit('keydown', 'ArrowRight', { code: 'ArrowRight' });
  tap('j');
  tap('Escape'); tap('Escape'); // 同帧双击：两条 pause 点按都不得被丢弃
  kb.clear({ except: SYSTEM_ACTIONS });
  const s1 = kb.snapshot();
  assert.equal(s1.right, false);
  assert.equal(s1.pressed.fire, false);
  assert.equal(s1.pressed.pause, true); // 第一条仍在
  assert.equal(kb.snapshot().pressed.pause, true); // 第二条也在
  assert.equal(kb.snapshot().pressed.pause, false);
});

test('clear 后仍按住的键不自动恢复，重新按下才生效', () => {
  const { kb, emit } = setup();
  emit('keydown', 'ArrowRight', { code: 'ArrowRight' });
  assert.equal(kb.snapshot().right, true);
  kb.clear();
  assert.equal(kb.snapshot().right, false);
  emit('keydown', 'ArrowRight', { code: 'ArrowRight', repeat: true }); // 自动重复不复活
  assert.equal(kb.snapshot().right, false);
  emit('keyup', 'ArrowRight', { code: 'ArrowRight' });
  emit('keydown', 'ArrowRight', { code: 'ArrowRight' }); // 重新按下生效
  assert.equal(kb.snapshot().right, true);
});

test('暂停时游戏输入被丢弃，恢复后不补发（main.js 包装策略的契约侧）', () => {
  const { kb, tap, emit } = setup();
  const g = game();
  tap('Escape');
  g.step(1, kb.snapshot()); assert.equal(g.paused, true);
  // 暂停中点按射击与移动：包装器会 clear({except}) 并把快照游戏键清零
  tap('j'); emit('keydown', 'ArrowRight', { code: 'ArrowRight' });
  kb.clear({ except: SYSTEM_ACTIONS });
  const s = kb.snapshot();
  for (const key of ['left', 'right', 'up', 'fire', 'jump']) { s[key] = false; s.pressed[key] = false; }
  g.step(1, s);
  tap('Escape');
  g.step(1, kb.snapshot()); assert.equal(g.paused, false);
  assert.equal(g.state().bullets.length, 0, '恢复后不得补发暂停期间的射击');
});
