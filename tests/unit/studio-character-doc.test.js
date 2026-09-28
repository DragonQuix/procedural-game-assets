/**
 * tests/unit/studio-character-doc.test.js — character/1 校验与规范化
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCharacterDocument, normalizeCharacterDocument, describeCharacterCapabilities } from '../../src/studio/character-doc.js';

const here = dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(readFileSync(join(here, '../../examples/studio/rustclaw.studio.json'), 'utf8'));

const has = (doc, frag) => validateCharacterDocument(doc).some((i) => `${i.target}|${i.code}|${i.message}`.includes(frag));

test('样例合法；规范化保留数据并填默认值，不改动输入', () => {
  assert.deepEqual(validateCharacterDocument(sample), []);
  const before = JSON.stringify(sample);
  const norm = normalizeCharacterDocument(sample);
  assert.equal(JSON.stringify(sample), before);
  assert.equal(norm.schemaVersion, 'pga-studio/character/1');
  assert.equal(norm.poses.length, 13);
  assert.equal(norm.outline, '#120d16');
  assert.deepEqual(norm.template.checkedPoseKinds, ['rig']);
});

test('拒绝：未知版本 / 非法调色板（多字符键、非 hex、危险键）', () => {
  assert.ok(has({ ...structuredClone(sample), schemaVersion: 'pga-studio/character/2' }, 'schemaVersion'));
  const bad1 = structuredClone(sample);
  bad1.palette.AA = '#000000';
  assert.ok(has(bad1, 'palette.AA'));
  const bad2 = structuredClone(sample);
  bad2.palette.V = 'cyan';
  assert.ok(has(bad2, 'palette.V'));
  const bad3 = structuredClone(sample);
  bad3.palette = JSON.parse('{"__proto__":"#000000","V":"#39d0c4"}');
  assert.ok(validateCharacterDocument(bad3).some((i) => i.code === 'UNSAFE_PATH'));
});

test('拒绝：像素图含调色板外字符 / 行数超限', () => {
  const bad1 = structuredClone(sample);
  bad1.art.head = ['..ZZ..'];
  assert.ok(has(bad1, 'art.head'));
  const bad2 = structuredClone(sample);
  bad2.art.torso = Array.from({ length: 17 }, () => 'KK');
  assert.ok(has(bad2, 'art.torso'));
});

test('拒绝：骨架范围 / 非单位向量方向 / 姿态引用不存在的瞄准方向', () => {
  const bad1 = structuredClone(sample);
  bad1.rig.thigh = 99;
  assert.ok(has(bad1, 'rig.thigh'));
  const bad2 = structuredClone(sample);
  bad2.rig.guns.fwd.dir = [2, 0];
  assert.ok(has(bad2, 'rig.guns.fwd.dir'));
  const bad3 = structuredClone(sample);
  bad3.poses[0].aim = 'ghost';
  assert.ok(has(bad3, 'aim'));
  const bad4 = structuredClone(sample);
  bad4.rig.guns.fwd.len = 99;
  assert.ok(has(bad4, 'rig.guns.fwd.len'));
});

test('拒绝：重复姿态 ID / 剪辑引用缺失姿态 / 时长非法', () => {
  const bad1 = structuredClone(sample);
  bad1.poses[1].id = 'stand_fwd';
  assert.ok(has(bad1, '重复'));
  const bad2 = structuredClone(sample);
  bad2.clips.stand_fwd = { frames: ['ghost_pose'], ms: 100 };
  assert.ok(has(bad2, 'clips.stand_fwd'));
  const bad3 = structuredClone(sample);
  bad3.clips.run_fwd = { frames: sample.clips.run_fwd.frames, ms: -5 };
  assert.ok(has(bad3, 'ms'));
});

test('拒绝：pixels/structure 保护类别（M5 角色仅 metadata）与非法元数据目标', () => {
  const bad1 = structuredClone(sample);
  bad1.constraints = [{ kind: 'pixels', target: 'head' }];
  assert.ok(validateCharacterDocument(bad1).some((i) => i.code === 'UNSUPPORTED_SCOPE'));
  const bad2 = structuredClone(sample);
  bad2.constraints = [{ kind: 'metadata', target: 'mystery' }];
  assert.ok(has(bad2, 'constraints[0].target'));
});

test('能力声明：调色板当前值与用途、骨架范围、剪辑与未适配姿态', () => {
  const caps = describeCharacterCapabilities(sample);
  assert.equal(caps.operations['palette.set'].targets.V.current, '#39d0c4');
  assert.equal(caps.operations['rig.set'].targets.scalars.thigh.max, 9);
  assert.equal(caps.operations['rig.set'].targets.guns.fwd.len.current, 7);
  assert.deepEqual(caps.notCheckedPoseKinds, ['prone', 'dead', 'dive', 'ball']);
  assert.equal(caps.poses.filter((p) => !p.checked).map((p) => p.id).join(','), 'dead_ground');
});
