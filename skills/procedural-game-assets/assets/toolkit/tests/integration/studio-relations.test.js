import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { StudioStore, candidateIdentity } from '../../src/adapters/studio-store.js';
import { exportWorkspace, exportFromFile, submitWorkspace, inspectFromFile, inspectWorkspace } from '../../src/adapters/studio-files.js';
import { compileStudioDocument as compile } from '../../src/studio/compiler.js';
import { applyOperation } from '../../src/studio/operators.js';
import { relationFixture, squash } from '../fixtures/studio-v14.js';

async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'pga-relations-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const doc = relationFixture(), { store } = await StudioStore.create(join(root, 'ws'), doc);
  return { root, store, doc };
}

test('candidate rejects gap without materialized PNG; repair + commit + submit + restore revalidate', async (t) => {
  const { root, store, doc } = await setup(t);
  const invalid = await store.edit({ baseRevision: 'r1', operation: squash(false) });
  assert.equal(invalid.status, 'REJECTED_UNSAFE'); assert.equal(invalid.candidateId, null);
  assert.equal((await store.state()).candidates.length, 0);
  const candidate = await store.edit({ baseRevision: 'r1', operation: squash() });
  assert.equal(candidate.checks.relationStatus, 'PASS'); assert.equal(candidate.checks.taskContractStatus, 'PASS');
  await store.commit({ action: 'accept', candidateId: candidate.candidateId, expectedHead: 'r1' });
  const result = await submitWorkspace(store.dir, join(root, 'submit'));
  assert.equal(result.relations.status, 'PASS'); assert.equal(result.protection.status, 'PASS');
  await assert.rejects(store.edit({ baseRevision: 'r1', operation: squash(true, -2), requestId: 'stale' }), { code: 'STALE_REVISION' });
  await store.commit({ action: 'restore', targetRevision: 'r1', expectedHead: 'r2' });
  assert.deepEqual((await store._getCompiled('r3')).document.relations, doc.relations);
  assert.equal((await exportWorkspace(store.dir, join(root, 'restored'))).relations.status, 'PASS');
});

test('tampered candidate PASS cannot override final relation contract or delete its definition', async (t) => {
  const { store, doc } = await setup(t), operation = squash(false);
  const c = compile(applyOperation(doc, operation).doc), base = compile(doc);
  const id = candidateIdentity('r1', base, operation, []);
  const record = { candidateId: id, baseRevision: 'r1', operation, preserveRequest: [], doc: c.document, hashes: c.hashes, checks: { status: 'OK' } };
  await writeFile(join(store.dir, 'candidates', `${id}.json`), JSON.stringify(record));
  await assert.rejects(store.commit({ action: 'accept', candidateId: id, expectedHead: 'r1' }), { code: 'CANDIDATE_INVALID' });
  record.doc.relations = []; record.hashes = compile(record.doc).hashes;
  await writeFile(join(store.dir, 'candidates', `${id}.json`), JSON.stringify(record));
  await assert.rejects(store.commit({ action: 'accept', candidateId: id, expectedHead: 'r1' }), { code: 'CANDIDATE_INVALID' });
  assert.equal((await store.state()).head, 'r1');
});

test('file export and tampered workspace export/submit/restore reject required GAP independently', async (t) => {
  const { root, store, doc } = await setup(t);
  const good = await store.edit({ baseRevision: 'r1', operation: squash() });
  await store.commit({ action: 'accept', candidateId: good.candidateId, expectedHead: 'r1' });
  doc.nodes[1].h--;
  const file = join(root, 'bad.json'); await writeFile(file, JSON.stringify(doc));
  await assert.rejects(exportFromFile(file, join(root, 'bad-export')), { code: 'RELATION_VIOLATION' });
  await assert.rejects(access(join(root, 'bad-export')));
  const path = join(store.dir, 'revisions', 'r1.json'), record = JSON.parse(await readFile(path));
  record.doc = doc; record.hashes = compile(doc).hashes; await writeFile(path, JSON.stringify(record));
  await assert.rejects(exportWorkspace(store.dir, join(root, 'bad-ws'), { revision: 'r1' }), { code: 'RELATION_VIOLATION' });
  await assert.rejects(submitWorkspace(store.dir, join(root, 'bad-submit'), { revision: 'r1' }), { code: 'RELATION_VIOLATION' });
  await assert.rejects(store.commit({ action: 'restore', targetRevision: 'r1', expectedHead: 'r2' }), { code: 'RELATION_VIOLATION' });
});

test('inspect reports SATISFIED, GAP, OVERLAP, repair policy and revision identity', async (t) => {
  const { root, store, doc } = await setup(t);
  const inspection = await inspectWorkspace(store.dir, { node: 'node.a', preserveRelations: true });
  assert.equal(inspection.relations.revision, 'r1'); assert.equal(inspection.relations.entries[0].status, 'SATISFIED');
  assert.equal(inspection.safeDomain.recommendedTransforms.squash_keep_base.preserveRelations, true);
  for (const [delta, status] of [[-1, 'GAP'], [1, 'OVERLAP']]) {
    const invalid = structuredClone(doc); invalid.nodes[1].h += delta;
    const path = join(root, `${status}.json`); await writeFile(path, JSON.stringify(invalid));
    const result = await inspectFromFile(path);
    assert.equal(result.relations.entries[0].status, status);
    assert.equal(result.relations.entries[0].repair.nodeId, 'node.b');
    assert.equal(result.relations.entries[0].repair.mode, 'resize-follower-edge');
  }
});

test('CLI exposes relation-aware edit/explore and relation diagnostics', async (t) => {
  const { root, store } = await setup(t), cli = resolve('bin/pga-studio.mjs');
  const run = (...args) => JSON.parse(execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8' }));
  const inspected = run('inspect', '--ws', store.dir, '--node', 'node.a', '--preserve-relations', 'true');
  assert.equal(inspected.result.relations.status, 'PASS');
  const edit = run('edit', '--ws', store.dir, '--base', 'r1', '--op', 'squash_keep_base', '--target', 'node.a', '--params', '{"deltaHeight":-1}', '--preserve-relations', '["R1"]');
  assert.equal(edit.result.checks.relationStatus, 'PASS');
  const explore = run('explore', '--ws', store.dir, '--base', 'r1', '--op', 'resize_about_anchor', '--target', 'node.a', '--field', 'targetHeight', '--values', '[10,8]', '--params', '{"anchor":"bottom-center"}', '--preserve-relations', 'true');
  assert.ok(explore.result.candidates.every(c => c.checks.relationStatus === 'PASS'));
  run('commit', '--ws', store.dir, '--accept', edit.result.candidateId, '--expected-head', 'r1');
  assert.equal(run('submit', '--ws', store.dir, '--out', join(root, 'cli-submit')).result.relations.status, 'PASS');
});
