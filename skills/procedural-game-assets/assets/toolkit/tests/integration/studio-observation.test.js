import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioStore } from '../../src/adapters/studio-store.js';
import { observeWorkspace, exportWorkspace } from '../../src/adapters/studio-files.js';
import { assetFromJSON } from '../../src/adapters/asset-file.js';
import { borderFixture } from '../fixtures/studio-v13.js';

test('观察只读取已有候选；PNG/标签可复查，overlay 不进入最终 export', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'pga-observe-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { store } = await StudioStore.create(join(root, 'ws'), borderFixture());
  const c = await store.edit({ baseRevision: 'r1', operation: { id: 'widen_about_center', target: 'beacon.base', params: { deltaWidth: 2 } } });
  const state = await store.state();
  const observation = await observeWorkspace(store.dir, join(root, 'views'), { revision: 'r1', candidateIds: [c.candidateId], node: 'beacon.base' });
  assert.deepEqual(await store.state(), state);
  assert.equal(observation.observations.length, 4);
  assert.equal(observation.observations[0].cells[1].candidateId, c.candidateId);
  assert.ok((await readFile(join(root, 'views', 'diff-1.display.png'))).length > 0);
  await store.commit({ action: 'accept', candidateId: c.candidateId, expectedHead: 'r1' });
  const result = await exportWorkspace(store.dir, join(root, 'export'));
  const asset = assetFromJSON(JSON.parse(await readFile(join(root, 'export', result.files.asset))));
  assert.deepEqual(asset.frames[0].rgba, (await store._getCompiled('r2')).asset.frames[0].rgba);
  assert.ok(!JSON.stringify(result.files).includes('overlay'));
});
