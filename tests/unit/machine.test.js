import test from 'node:test';
import assert from 'node:assert/strict';
import { bakeMachine } from '../../src/recipes/machine.js';
import turret from '../../examples/recipes/turret.mjs';

const asset = bakeMachine(turret);
const byId = new Map(asset.frames.map((f) => [f.id, f]));

test('机械：分件 × 方向 × 状态的帧数与命名', () => {
  // 基座 2×2 + 平射管 2×2 + 高射管 2×2 = 12
  assert.equal(asset.frames.length, 12);
  for (const id of ['mole_base', 'mole_base_damaged', 'mole_base_left', 'mole_base_left_damaged', 'mole_barrel_flat', 'mole_barrel_high_left_damaged']) {
    assert.ok(byId.has(id), `缺帧 ${id}`);
  }
});

test('机械：镜像变体的锚点与附件点随镜像（W-x）', () => {
  const right = byId.get('mole_barrel_flat');
  const left = byId.get('mole_barrel_flat_left');
  assert.equal(left.anchor.x, right.width - right.anchor.x);
  assert.equal(left.attachments.muzzle.x, right.width - right.attachments.muzzle.x);
  assert.equal(left.attachments.muzzle.y, right.attachments.muzzle.y);
});

test('机械：损坏状态确定、与正常不同、不透明像素只减不增', () => {
  const intact = byId.get('mole_base');
  const damaged = byId.get('mole_base_damaged');
  assert.notDeepEqual([...damaged.rgba], [...intact.rgba]);
  for (let i = 0; i < intact.rgba.length; i += 4) {
    if (intact.rgba[i + 3] === 0) assert.equal(damaged.rgba[i + 3], 0, `像素 ${i / 4} 损坏后反而出现`);
  }
  // 同种子再烘焙一致
  const again = bakeMachine(turret);
  assert.deepEqual([...again.frames.find((f) => f.id === 'mole_base_damaged').rgba], [...damaged.rgba]);
});

test('机械：附件点存在且炮管口在管身右侧', () => {
  const b = byId.get('mole_barrel_flat');
  assert.ok(b.attachments.muzzle.x > b.anchor.x);
  const base = byId.get('mole_base');
  assert.ok(base.attachments.barrel);
});
