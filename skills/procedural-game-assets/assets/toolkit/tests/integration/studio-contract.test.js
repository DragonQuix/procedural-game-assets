import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioStore, candidateIdentity } from '../../src/adapters/studio-store.js';
import { exportWorkspace, exportFromFile, submitWorkspace } from '../../src/adapters/studio-files.js';
import { compileStudioDocument } from '../../src/studio/compiler.js';
import { applyOperation } from '../../src/studio/operators.js';
import { borderFixture, t05Operation } from '../fixtures/studio-v13.js';

async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'pga-contract-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { store } = await StudioStore.create(join(root, 'ws'), borderFixture());
  return { root, store };
}
const legal = { ...t05Operation, params: { x: 6, y: 32, w: 27, h: 4 } };

test('candidate 拒绝 27px 越界，commit 不允许接受', async (t) => {
  const { store } = await setup(t);
  const c = await store.edit({ baseRevision: 'r1', operation: t05Operation });
  assert.equal(c.status, 'REJECTED_UNSAFE');
  assert.equal(c.checks.taskContract.changedPixelCount, 27);
  assert.equal(c.candidateId, null);
  assert.equal((await store.state()).candidates.length, 0);
  await assert.rejects(store.commit({ action: 'accept', candidateId: 'c-00000000', expectedHead: 'r1' }), { code: 'CANDIDATE_INVALID' });
  assert.equal((await store.state()).head, 'r1');
});

test('commit 真实重编译，不信缓存和伪造 PASS；最终导出/submit/restore 保留合同', async (t) => {
  const { root, store } = await setup(t);
  // 模拟把旧的非法候选迁入，且伪造所有信息性状态/哈希；commit 仍须真实重验。
  const doc = applyOperation(borderFixture(), t05Operation).doc;
  const candidateId = candidateIdentity('r1', compileStudioDocument(borderFixture()), t05Operation, []);
  const path = join(store.dir, 'candidates', `${candidateId}.json`);
  const record = { candidateId, baseRevision: 'r1', operation: t05Operation, doc, hashes: compileStudioDocument(doc).hashes, preserveRequest: [], checks: { status: 'OK' } };
  await writeFile(path, JSON.stringify(record));
  await assert.rejects(store.commit({ action: 'accept', candidateId, expectedHead: 'r1' }), { code: 'CANDIDATE_INVALID' });
  const c = await store.edit({ baseRevision: 'r1', operation: legal });
  await store.commit({ action: 'accept', candidateId: c.candidateId, expectedHead: 'r1' });
  const accepted = await store._getCompiled('r2');
  assert.deepEqual(accepted.document.protection, borderFixture().protection);
  assert.notDeepEqual(accepted.document.nodes, accepted.document.protection.baseline.nodes);
  assert.equal((await exportWorkspace(store.dir, join(root, 'export'))).protection.status, 'PASS');
  assert.equal((await submitWorkspace(store.dir, join(root, 'submit'))).protection.status, 'PASS');
  await store.commit({ action: 'restore', targetRevision: 'r1', expectedHead: 'r2' });
  const restored = await store._getCompiled('r3');
  assert.deepEqual(restored.document.protection, borderFixture().protection);
  assert.equal(restored.protection.status, 'PASS');
});

test('最终文件编译独立校验，工作区非法修订无法 export/submit', async (t) => {
  const { root, store } = await setup(t);
  const doc = borderFixture(); Object.assign(doc.nodes[0], t05Operation.params);
  const file = join(root, 'bad.json'); await writeFile(file, JSON.stringify(doc));
  await assert.rejects(exportFromFile(file, join(root, 'invalid-file')), { code: 'PROTECTION_VIOLATION' });
  await assert.rejects(access(join(root, 'invalid-file')));
  const revisionPath = join(store.dir, 'revisions', 'r1.json');
  const revision = JSON.parse(await readFile(revisionPath));
  revision.doc = doc; revision.hashes = compileStudioDocument(doc).hashes;
  await writeFile(revisionPath, JSON.stringify(revision));
  await assert.rejects(exportWorkspace(store.dir, join(root, 'invalid-ws')), { code: 'PROTECTION_VIOLATION' });
  await assert.rejects(submitWorkspace(store.dir, join(root, 'invalid-submit')), { code: 'PROTECTION_VIOLATION' });
  await assert.rejects(store._getCompiled('r1'), { code: 'PROTECTION_VIOLATION' });
});
