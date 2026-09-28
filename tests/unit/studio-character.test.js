/**
 * tests/unit/studio-character.test.js — 角色编译等价性、跨帧检查与操作
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileCharacterDocument, checkCharacterCandidate } from '../../src/studio/character-compiler.js';
import { applyCharacterOperation, exploreCharacterOperation } from '../../src/studio/character-ops.js';
import { bakeHumanoid } from '../../src/recipes/humanoid.js';
import rustclaw from '../../examples/recipes/rustclaw.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(readFileSync(join(here, '../../examples/studio/rustclaw.studio.json'), 'utf8'));

const compile = (doc) => compileCharacterDocument(doc, { toolVersion: 'test' });

function run(op, doc = sample, preserve = [{ kind: 'metadata', target: 'anchor' }]) {
  const base = compile(doc);
  const { doc: candDoc, plan } = applyCharacterOperation(base.document, op);
  return { checks: checkCharacterCandidate({ baseCompiled: base, candidateCompiled: compile(candDoc), plan, preserve }), plan, candDoc };
}

test('与既有 bakeHumanoid 逐帧逐字节等价（几何/绘制/附件点同源）', () => {
  const { asset, hashes } = compile(sample);
  const legacy = bakeHumanoid(rustclaw);
  assert.equal(hashes.renderHash, '11c587dd:d890d15f', '角色 renderHash 回归锚点');
  for (const f of asset.frames) {
    const l = legacy.frames.find((x) => x.id === f.id);
    assert.ok(l, `缺帧 ${f.id}`);
    assert.deepEqual([...f.rgba], [...l.rgba], f.id);
    assert.deepEqual(f.anchor, l.anchor, f.id);
    assert.deepEqual(f.attachments, l.attachments, f.id);
  }
  assert.deepEqual(asset.clips, legacy.clips);
});

test('确定性与 notCovered 标记', () => {
  const a = compile(sample);
  const b = compile(sample);
  assert.equal(a.hashes.renderHash, b.hashes.renderHash);
  assert.deepEqual([...a.asset.frames[5].rgba], [...b.asset.frames[5].rgba]);
  assert.deepEqual(a.diagnostics.notCoveredFrames, ['dead_ground']);
});

test('palette.set：全部 12 rig 帧 + notCovered 帧一致传播；接地与锚点保持', () => {
  const { checks } = run({ id: 'palette.set', target: 'V', value: '#ffd23d' });
  assert.equal(checks.status, 'OK', JSON.stringify(checks.conflicts));
  assert.equal(checks.affectedFrames.length, 12);
  assert.equal(checks.notCoveredChanges.length, 1);
  assert.equal(checks.notCoveredChanges[0].id, 'dead_ground');
  assert.equal(checks.affectedClips.length, 4);
  for (const f of checks.affectedFrames) {
    assert.equal(f.groundingChanged, false, f.id);
    assert.deepEqual(f.anchorDelta, { dx: 0, dy: 0 }, f.id);
  }
});

test('palette.set 同值 → UNCHANGED，不冒充已改好', () => {
  const { checks } = run({ id: 'palette.set', target: 'V', value: '#39d0c4' });
  assert.equal(checks.status, 'UNCHANGED');
  assert.equal(checks.totalDiffPixels, 0);
});

test('rig.set thigh：solvePose 重解后接地（包围盒底缘）保持，顶缘可合法变化', () => {
  const { checks } = run({ id: 'rig.set', target: 'thigh', value: 6 });
  assert.equal(checks.status, 'OK', JSON.stringify(checks.conflicts));
  assert.equal(checks.affectedFrames.length, 12);
  for (const f of checks.affectedFrames) assert.equal(f.groundingChanged, false, f.id);
});

test('rig.set guns.fwd.len：仅 fwd 帧受影响，枪口附件点一致联动 ≈(+2,0)', () => {
  const { checks } = run({ id: 'rig.set', target: 'guns.fwd.len', value: 9 });
  assert.equal(checks.status, 'OK', JSON.stringify(checks.conflicts));
  const ids = checks.affectedFrames.map((f) => f.id).sort();
  assert.deepEqual(ids, ['fall_fwd', 'run0_fwd', 'run1_fwd', 'run2_fwd', 'run3_fwd', 'run4_fwd', 'run5_fwd', 'stand_fwd'].sort());
  for (const f of checks.affectedFrames) {
    const d = f.attachmentDeltas.muzzle;
    assert.ok(d && Math.abs(d.dx - 2) <= 1 && Math.abs(d.dy) <= 1, `${f.id}: ${JSON.stringify(d)}`);
  }
});

test('art.set head：全部 rig 帧变化；同尺寸部件的头部附件点位置由求解器保持不动', () => {
  const newHead = sample.art.head.map((row, i) => (i === 3 ? 'AAEEVVVk' : row)); // 目镜带形状调整，尺寸不变
  const { checks } = run({ id: 'art.set', target: 'head', value: newHead });
  assert.equal(checks.status, 'OK', JSON.stringify(checks.conflicts));
  assert.equal(checks.affectedFrames.length, 12);
  for (const f of checks.affectedFrames) assert.ok(!('head' in f.attachmentDeltas), f.id);
  // 尺寸变化的部件替换会合法移动头部附件点（求解器按部件尺寸定位），报告须如实呈现
  const taller = [...sample.art.head.slice(0, 3), 'AAAAAAAA', ...sample.art.head.slice(3)];
  const tallerRun = run({ id: 'art.set', target: 'head', value: taller });
  assert.equal(tallerRun.checks.status, 'OK');
  assert.ok(tallerRun.checks.affectedFrames.some((f) => 'head' in f.attachmentDeltas), '加高头部应在附件点报告中体现位移');
});

test('metadata 保护：声明 attachments.muzzle 后改枪长被命中', () => {
  const { checks } = run({ id: 'rig.set', target: 'guns.fwd.len', value: 9 }, sample, [
    { kind: 'metadata', target: 'anchor' },
    { kind: 'metadata', target: 'attachments.muzzle' },
  ]);
  assert.equal(checks.status, 'REJECTED');
  assert.ok(checks.conflicts.some((c) => c.kind === 'metadata' && c.target === 'attachments.muzzle'));
});

test('篡改检测：候选中 clips/poses 被改动 → 结构冲突', () => {
  const base = compile(sample);
  const { doc: candDoc, plan } = applyCharacterOperation(base.document, { id: 'palette.set', target: 'V', value: '#ffd23d' });
  const forged = structuredClone(candDoc);
  forged.clips.run_fwd.ms = 999;
  const checks = checkCharacterCandidate({ baseCompiled: base, candidateCompiled: compile(forged), plan, preserve: [] });
  assert.equal(checks.status, 'REJECTED');
  assert.ok(checks.conflicts.some((c) => c.kind === 'structure' && c.target.startsWith('clips')));
});

test('exploreCharacterOperation：逐值派生，非法取值不中断', () => {
  const entries = exploreCharacterOperation(sample, { id: 'rig.set', target: 'thigh', values: [3, 4, 99] });
  assert.equal(entries.length, 3);
  assert.equal(entries[1].plan.changedFields['rig.thigh'].to, 4);
  assert.equal(entries[2].error.code, 'CANDIDATE_INVALID');
  assert.throws(() => exploreCharacterOperation(sample, { id: 'rig.set', target: 'thigh', values: [], extra: 1 }), (e) => e.code === 'INVALID_DOCUMENT');
});
