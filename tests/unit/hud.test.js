import test from 'node:test';
import assert from 'node:assert/strict';
import { hudText, updateHud } from '../../examples/canvas-slice/template/render/hud.js';

test('DOM HUD 覆盖游玩、暂停、胜利、失败，恢复时清除横幅', () => {
  const s = { shield: 2, enemies: [{ alive: true }], status: 'playing', paused: false };
  assert.equal(hudText(s).title, '');
  assert.equal(hudText({ ...s, paused: true }).title, '已暂停');
  assert.equal(hudText({ ...s, status: 'win' }).title, '任务完成');
  assert.equal(hudText({ ...s, status: 'fail' }).title, '任务失败');
  const nodes = new Map();
  const root = { querySelector: (s) => { if (!nodes.has(s)) nodes.set(s, {}); return nodes.get(s); } };
  updateHud(root, { ...s, status: 'win' });
  assert.equal(nodes.get('[data-hud="banner"]').hidden, false);
  updateHud(root, s);
  assert.equal(nodes.get('[data-hud="banner"]').hidden, true);
});

test('HUD 统计文案包含护盾与剩余目标数', () => {
  const s = { shield: 1, enemies: [{ alive: true }, { alive: false }, { alive: true }], status: 'playing', paused: false };
  const t = hudText(s);
  assert.equal(t.stats, '护盾 1 · 剩余目标 2');
  assert.equal(t.hint, '');
});
