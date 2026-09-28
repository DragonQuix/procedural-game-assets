/**
 * tests/integration/compat-characters.test.js — 兼容样本逐像素回归
 *
 * 用 tests/fixtures/baseline/sprites.json（原项目生成器在 bd1cf1a 采集，
 * 见 docs/provenance.md）校验新库烘焙的英雄与军团 60 帧：
 * 尺寸、锚点、RGBA 哈希逐帧一致；头部附件点相对偏移与原 marks 一致。
 * 像素差异必须区分：算法回归 / 坐标契约修正 / 有意改美术——本测试不允许任何差异。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bakeHumanoid } from '../../src/recipes/humanoid.js';
import ember from '../../examples/recipes/ember.mjs';
import legionFamily from '../../examples/recipes/legion.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(resolve(here, '../fixtures/baseline/sprites.json'), 'utf8'));

const frames = new Map();
for (const asset of [bakeHumanoid(ember), ...legionFamily.map(bakeHumanoid)]) {
  for (const f of asset.frames) frames.set(f.id, f);
}

const sha1 = (bytes) => createHash('sha1').update(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)).digest('hex');

const COVERED = /^(p_|trooper_|rifleman_|sniper_|mortar_crew|heavy_|legion_dead)/;
const expected = baseline.sprites.filter((s) => COVERED.test(s.name));

test('基线覆盖核对：兼容样本应覆盖 60 个原版精灵', () => {
  assert.equal(expected.length, 60);
  for (const s of expected) assert.ok(frames.has(s.name), `缺少帧 '${s.name}'`);
});

test('逐帧逐像素回归：尺寸、锚点、RGBA 哈希一致', () => {
  const diffs = [];
  for (const s of expected) {
    const f = frames.get(s.name);
    if (!f) continue;
    if (f.width !== s.w || f.height !== s.h) diffs.push(`${s.name}: 尺寸 ${f.width}×${f.height} ≠ 基线 ${s.w}×${s.h}`);
    if (f.anchor.x !== s.ax || f.anchor.y !== s.ay) diffs.push(`${s.name}: 锚点 (${f.anchor.x},${f.anchor.y}) ≠ (${s.ax},${s.ay})`);
    if (sha1(f.rgba) !== s.hash) diffs.push(`${s.name}: RGBA 哈希不一致`);
  }
  assert.deepEqual(diffs, []);
});

test('头部附件点相对偏移与原 marks.head 一致（rig 姿态）', () => {
  const diffs = [];
  for (const s of expected) {
    if (!s.marks || !s.marks.head) continue;
    const f = frames.get(s.name);
    const rel = [f.attachments.head.x - f.anchor.x, f.attachments.head.y - f.anchor.y];
    if (rel[0] !== s.marks.head[0] || rel[1] !== s.marks.head[1]) {
      diffs.push(`${s.name}: head 相对偏移 (${rel}) ≠ 基线 (${s.marks.head})`);
    }
  }
  assert.deepEqual(diffs, []);
});

test('枪口附件点在新帧中存在且朝右（新增能力，原版无基线）', () => {
  for (const name of ['p_stand_fwd', 'trooper_aim', 'sniper_fwd', 'heavy_fire']) {
    const f = frames.get(name);
    assert.ok(f.attachments.muzzle, `${name} 缺 muzzle`);
    assert.ok(f.attachments.muzzle.x > f.anchor.x, `${name} 枪口应在锚点右侧`);
  }
});
