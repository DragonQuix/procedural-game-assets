import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildBlindPackage } from '../../tools/benchmark/blind.mjs';
import { compileStudioDocument } from '../../src/studio/compiler.js';
import { borderFixture } from '../fixtures/studio-v13.js';

test('新 harness reviewer 目录隔离、无 key/arm 泄漏、镜像确定性', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'pga-blind-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const asset = compileStudioDocument(borderFixture()).asset;
  const input = { task: 'G', repeat: 1, seed: 'frozen', left: { runId: 'private-D12', asset }, right: { runId: 'private-D13', asset }, taskText: '保持底座不变，主体变宽。' };
  const key = await buildBlindPackage(join(root, 'pair'), input);
  assert.deepEqual(key, await buildBlindPackage(join(root, 'repeat'), input));
  assert.equal(key.reviewers[0].X, key.reviewers[1].Y);
  const snapshots = async (slot) => Object.fromEntries(await Promise.all((await readdir(join(root, 'pair', slot))).sort().map(async (name) => [name, (await readFile(join(root, 'pair', slot, name))).toString('base64')])));
  const r2 = await snapshots('reviewer-2');
  await writeFile(join(root, 'pair', 'reviewer-1', 'review.json'), '{}');
  assert.deepEqual(await snapshots('reviewer-2'), r2);
  for (const slot of ['reviewer-1', 'reviewer-2']) for (const name of await readdir(join(root, 'pair', slot))) {
    assert.notEqual(name, 'key.json');
    if (/\.(md|json)$/.test(name)) assert.doesNotMatch(await readFile(join(root, 'pair', slot, name), 'utf8'), /private-D12|private-D13|reviewer-[12]|frozen/);
  }
});
