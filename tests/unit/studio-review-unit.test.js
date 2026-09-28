/**
 * tests/unit/studio-review-unit.test.js — 审查修复轮（R1–R8）单元级回归
 * 依据 docs/PGA_STUDIO_REVIEW.md §4/§5：每项断言正确行为，不是"有返回值"。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyOperation, exploreOperation, operationFromExplore } from '../../src/studio/operators.js';
import { operationFromExplore as characterOperationFromExplore, applyCharacterOperation } from '../../src/studio/character-ops.js';
import { operationFromAnyExplore } from '../../src/studio/dispatch.js';
import { compileStudioDocument } from '../../src/studio/compiler.js';
import { compileCharacterDocument, checkCharacterCandidate } from '../../src/studio/character-compiler.js';
import { validateCharacterDocument, normalizeCharacterDocument } from '../../src/studio/character-doc.js';
import { stableStringify } from '../../src/studio/document.js';

const here = dirname(fileURLToPath(import.meta.url));
const terminal = JSON.parse(readFileSync(join(here, '../../examples/studio/terminal.studio.json'), 'utf8'));
const rustclaw = JSON.parse(readFileSync(join(here, '../../examples/studio/rustclaw.studio.json'), 'utf8'));

const compileProp = (doc) => compileStudioDocument(doc, { toolVersion: 'test' });
const compileChar = (doc) => compileCharacterDocument(doc, { toolVersion: 'test' });

function runCharOp(op, doc = rustclaw, preserve = []) {
  const base = compileChar(doc);
  const { doc: candDoc, plan } = applyCharacterOperation(base.document, op);
  return { checks: checkCharacterCandidate({ baseCompiled: base, candidateCompiled: compileChar(candDoc), plan, preserve }), base, plan, candDoc };
}

/* ---------- R3：探索项 → 标准 operation 统一转换 ---------- */

test('R3：operationFromExplore 按操作产出标准 operation（material/ramp 不再落进 params）', () => {
  assert.deepEqual(operationFromExplore({ id: 'geometry.set', target: 'terminal.shell', field: 'w' }, 28), { id: 'geometry.set', target: 'terminal.shell', params: { w: 28 } });
  assert.deepEqual(operationFromExplore({ id: 'material.set', target: 'terminal.shell', field: 'material' }, 'flat'), { id: 'material.set', target: 'terminal.shell', material: 'flat' });
  assert.deepEqual(operationFromExplore({ id: 'ramp.set', target: 'terminal.shell', field: 'ramp' }, 'amber'), { id: 'ramp.set', target: 'terminal.shell', ramp: 'amber' });
  const shades = { shades: ['#000000', '#444444', '#888888', '#cccccc'] };
  assert.deepEqual(operationFromExplore({ id: 'ramp.set', target: 'terminal.shell', field: 'ramp' }, shades), { id: 'ramp.set', target: 'terminal.shell', ramp: shades });
  assert.throws(() => operationFromExplore({ id: 'bogus.set', target: 'x', field: 'y' }, 1), (e) => e.code === 'UNSUPPORTED_OPERATION');
  // 角色三操作：统一 { id, target, value }
  assert.deepEqual(characterOperationFromExplore({ id: 'palette.set', target: 'V' }, '#ffd23d'), { id: 'palette.set', target: 'V', value: '#ffd23d' });
  assert.deepEqual(characterOperationFromExplore({ id: 'rig.set', target: 'thigh' }, 6), { id: 'rig.set', target: 'thigh', value: 6 });
  assert.deepEqual(characterOperationFromExplore({ id: 'art.set', target: 'head' }, ['AA']), { id: 'art.set', target: 'head', value: ['AA'] });
  assert.throws(() => characterOperationFromExplore({ id: 'material.set', target: 'x' }, 1), (e) => e.code === 'UNSUPPORTED_OPERATION');
});

test('R3：exploreOperation 内部与 operationFromExplore 同源（material.set 逐值可重执行）', () => {
  const doc = compileProp(terminal).document;
  const spec = { id: 'material.set', target: 'terminal.shell', field: 'material', values: ['flat', 'bevel-metal'] };
  const entries = exploreOperation(doc, spec);
  assert.equal(entries.length, 2);
  for (const entry of entries) {
    const rederived = applyOperation(doc, operationFromExplore(spec, entry.value));
    assert.equal(stableStringify(rederived.doc), stableStringify(entry.doc), `取值 ${entry.value} 的重执行结果必须与探索一致`);
  }
  // dispatch 按文档类型分派到同一份转换
  assert.deepEqual(operationFromAnyExplore(doc, spec, 'flat'), { id: 'material.set', target: 'terminal.shell', material: 'flat' });
  assert.deepEqual(operationFromAnyExplore(compileChar(rustclaw).document, { id: 'palette.set', target: 'V' }, '#ffd23d'), { id: 'palette.set', target: 'V', value: '#ffd23d' });
});

/* ---------- R8：角色 diffPixels 按像素计数 ---------- */

test('R8：diffPixels 按像素计（四字节一组），通道数另列 changedChannels', () => {
  const { checks, base } = runCharOp({ id: 'palette.set', target: 'V', value: '#ffd23d' });
  const { doc: candDoc } = applyCharacterOperation(base.document, { id: 'palette.set', target: 'V', value: '#ffd23d' });
  const cand = compileChar(candDoc);
  let manualPixels = 0;
  let manualChannels = 0;
  const a = base.asset.frames.find((f) => f.id === 'stand_fwd').rgba;
  const b = cand.asset.frames.find((f) => f.id === 'stand_fwd').rgba;
  for (let i = 0; i < a.length; i += 4) {
    let px = 0;
    for (let k = 0; k < 4; k++) {
      if (a[i + k] !== b[i + k]) {
        manualChannels++;
        px = 1;
      }
    }
    manualPixels += px;
  }
  const stand = checks.affectedFrames.find((f) => f.id === 'stand_fwd');
  assert.equal(stand.diffPixels, manualPixels, 'diffPixels 必须是变化像素数而不是 RGBA 通道数');
  assert.equal(stand.changedChannels, manualChannels, '通道级差异另列 changedChannels');
  assert.ok(manualPixels > 0 && manualChannels > manualPixels, '本例每像素 3 个颜色通道变化，计数必须可区分');
  const perFrameSum = checks.affectedFrames.reduce((n, f) => n + f.diffPixels, 0) + checks.notCoveredChanges.reduce((n, f) => n + f.diffPixels, 0);
  assert.equal(checks.totalDiffPixels, perFrameSum, 'totalDiffPixels 为逐帧像素数之和');
});

/* ---------- R2：元数据独立受保护 ---------- */

test('R2：像素不变但附件点移动——不再误报 UNCHANGED，受影响帧按像素/元数据分开标注', () => {
  const newHead = ['........', ...rustclaw.art.head]; // 顶部加一行同宽透明行：rig 帧像素不变，head 附件点上移
  const { checks } = runCharOp({ id: 'art.set', target: 'head', value: newHead });
  assert.equal(checks.status, 'OK', '输出元数据已改变的候选不得标为整体 UNCHANGED');
  assert.equal(checks.conflicts.length, 0, JSON.stringify(checks.conflicts));
  const stand = checks.affectedFrames.find((f) => f.id === 'stand_fwd');
  assert.ok(stand, '仅元数据变化的帧也必须列入受影响帧');
  assert.equal(stand.pixelChanged, false);
  assert.equal(stand.metadataChanged, true);
  assert.deepEqual(stand.attachmentDeltas.head, { dx: 0, dy: -1 });
  assert.ok(!checks.pixelChangedFrames.includes('stand_fwd'), '像素未变的帧不进 pixelChangedFrames');
  assert.ok(checks.metadataChangedFrames.includes('stand_fwd'));
  assert.equal(checks.metadataChangedFrames.length, 12, '12 个 rig 帧的 head 附件点一致移动');
});

test('R2：显式 metadata 保护对仅元数据变化的帧生效（修复保护漏检）', () => {
  const newHead = ['........', ...rustclaw.art.head];
  const { checks } = runCharOp({ id: 'art.set', target: 'head', value: newHead }, rustclaw, [{ kind: 'metadata', target: 'attachments.head' }]);
  assert.equal(checks.status, 'REJECTED');
  assert.ok(checks.conflicts.some((c) => c.kind === 'metadata' && c.target === 'attachments.head' && c.message.includes('stand_fwd')));
  assert.equal(checks.conflicts.length, 12, '保护遍历全部相关帧，不以像素变化为前提');
});

test('R2：显式 metadata 保护覆盖 notCovered 帧（不因未适配姿态而忽略元数据）', () => {
  // dead_ground 的 head 附件点不随合法操作移动，故直接在编译产物上构造纯元数据变化：
  // 这是检查器合同测试——旧实现只遍历像素变化帧，此类变化会漏检。
  const base = compileChar(rustclaw);
  const { doc: candDoc, plan } = applyCharacterOperation(base.document, { id: 'palette.set', target: 'V', value: '#39d0c4' }); // 同值：零像素变化
  const cand = compileChar(candDoc);
  const forged = structuredClone(cand);
  forged.frames = forged.frames.map((f) => (f.id === 'dead_ground' ? { ...f, attachments: { ...f.attachments, head: { x: f.attachments.head.x, y: f.attachments.head.y - 1 } } } : f));
  const checks = checkCharacterCandidate({ baseCompiled: base, candidateCompiled: forged, plan, preserve: [{ kind: 'metadata', target: 'attachments.head' }] });
  assert.equal(checks.status, 'REJECTED');
  assert.ok(checks.conflicts.some((c) => c.target === 'attachments.head' && c.message.includes('dead_ground')), 'notCovered 帧的显式保护必须命中');
});

test('R2：新增/丢失附件点属元数据冲突；UNCHANGED 仍要求双不变', () => {
  const base = compileChar(rustclaw);
  const { doc: candDoc, plan } = applyCharacterOperation(base.document, { id: 'palette.set', target: 'V', value: '#ffd23d' });
  const cand = compileChar(candDoc);
  const dropped = structuredClone(cand);
  dropped.frames = dropped.frames.map((f) => {
    if (f.id !== 'stand_fwd') return f;
    const attachments = { ...f.attachments };
    delete attachments.head;
    return { ...f, attachments };
  });
  const c1 = checkCharacterCandidate({ baseCompiled: base, candidateCompiled: dropped, plan, preserve: [] });
  assert.equal(c1.status, 'REJECTED');
  assert.ok(c1.conflicts.some((c) => c.target === 'attachments.head' && c.message.includes('丢失')));
  const added = structuredClone(cand);
  added.frames = added.frames.map((f) => (f.id === 'stand_fwd' ? { ...f, attachments: { ...f.attachments, cape: { x: 1, y: 2 } } } : f));
  const c2 = checkCharacterCandidate({ baseCompiled: base, candidateCompiled: added, plan, preserve: [] });
  assert.equal(c2.status, 'REJECTED');
  assert.ok(c2.conflicts.some((c) => c.target === 'attachments.cape' && c.message.includes('新增')));
  // 双不变仍是 UNCHANGED（同值改色）
  const same = runCharOp({ id: 'palette.set', target: 'V', value: '#39d0c4' });
  assert.equal(same.checks.status, 'UNCHANGED');
});

test('R2：checkedPoseKinds 由引擎能力决定——作者声明未适配种类按 UNSUPPORTED_SCOPE 拒绝', () => {
  const declared = structuredClone(rustclaw);
  declared.template.checkedPoseKinds = ['rig', 'dead'];
  const issues = validateCharacterDocument(declared);
  assert.ok(issues.some((i) => i.code === 'UNSUPPORTED_SCOPE' && i.message.includes("'dead'")), JSON.stringify(issues));
  assert.throws(() => normalizeCharacterDocument(declared), (e) => e.code === 'INVALID_DOCUMENT');
  const onlyDead = structuredClone(rustclaw);
  onlyDead.template.checkedPoseKinds = ['dead'];
  assert.ok(validateCharacterDocument(onlyDead).some((i) => i.code === 'UNSUPPORTED_SCOPE'));
  const bogus = structuredClone(rustclaw);
  bogus.template.checkedPoseKinds = ['fly'];
  assert.ok(validateCharacterDocument(bogus).some((i) => i.code === 'INVALID_DOCUMENT' && i.message.includes('未知姿态种类')));
  // 引擎实际支持的声明仍然合法
  assert.deepEqual(validateCharacterDocument(rustclaw), []);
});
