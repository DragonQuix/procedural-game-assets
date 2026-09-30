import test from 'node:test';
import assert from 'node:assert/strict';
import { lintIdentityText, assertIdentityMaterials } from '../../tools/benchmark/identity-lint.mjs';
import { symbolicContactSheet } from '../../src/observe/symbolic-sheet.js';
import { compileStudioDocument } from '../../src/studio/compiler.js';
import { relationFixture } from '../fixtures/studio-v14.js';

test('agent-facing lint rejects spatial identity in all material categories, not geometric direction', () => {
  for (const phrase of ['left candidate', 'right candidate', 'left image', 'right image', 'left option', 'right option', 'candidate on the left', 'candidate on the right', '左图', '右图', '左候选', '右候选', '左边那个', '右边那个', '左侧候选', '右侧候选', 'leftCandidate', 'rightImage']) {
    for (const kind of ['participant', 'reviewer', 'vision', 'blind', 'task']) assert.ok(lintIdentityText(phrase, { kind }).length, `${kind}: ${phrase}`);
  }
  assert.equal(lintIdentityText('Node A faces right; Node B edge E2 at y=18.').length, 0);
  assert.equal(lintIdentityText('Image A 包含什么？Image B 包含什么？', { kind: 'vision' }).length, 0);
  assert.throws(() => assertIdentityMaterials([{ file: 'prompt.md', kind: 'reviewer', text: 'Compare the right candidate.' }]), { code: 'IDENTITY_LINT_FAILED' });
});

test('explicit directional allowlist requires exact line, phrase, rationale and stable object ID', () => {
  const text = 'Node A faces right.', options = { kind: 'vision', allow: [{ line: 1, phrase: 'right', objectId: 'Node A', reason: '该任务显式检查 Node A 的朝向' }] };
  assert.equal(lintIdentityText(text, options).length, 0);
  assert.ok(lintIdentityText('faces right.', options).length);
  assert.ok(lintIdentityText(text, { ...options, allow: [{ ...options.allow[0], reason: '' }] }).length);
});

test('symbolic contact sheet carries stable IDs and labels outside asset pixels under mirroring', () => {
  const frame = compileStudioDocument(relationFixture()).asset.frames[0];
  const entries = ['X', 'Y'].map(label => ({ label, frame }));
  for (const order of [entries, [...entries].reverse()]) {
    const sheet = symbolicContactSheet(order);
    assert.deepEqual(sheet.meta.cells.map(c => c.label), order.map(e => e.label));
    for (const c of sheet.meta.cells) assert.ok(c.labelRect.y + c.labelRect.h <= c.assetRect.y);
  }
  assert.throws(() => symbolicContactSheet([{ frame }, { frame }]));
});
