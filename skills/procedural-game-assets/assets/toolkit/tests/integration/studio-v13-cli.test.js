import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { borderFixture } from '../fixtures/studio-v13.js';

test('v1.3 CLI inspect/语义edit/explore/observe/commit/submit 全链路', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'pga-v13-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cli = fileURLToPath(new URL('../../bin/pga-studio.mjs', import.meta.url));
  const doc = join(root, 'doc.json'), ws = join(root, 'ws');
  await writeFile(doc, JSON.stringify(borderFixture()));
  const run = (...args) => JSON.parse(execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })).result;
  run('create', '--doc', doc, '--out', ws);
  const inspect = run('inspect', '--ws', ws, '--node', 'beacon.base');
  assert.equal(inspect.safeDomain.revision, 'r1');
  const c = run('edit', '--ws', ws, '--base', 'r1', '--op', 'widen_about_center', '--target', 'beacon.base', '--params', '{"deltaWidth":2}');
  assert.equal(c.geometry.preservedInvariant, 'centerX');
  const e = run('explore', '--ws', ws, '--base', 'r1', '--op', 'resize_about_anchor', '--target', 'beacon.base', '--field', 'targetWidth', '--values', '25,26', '--params', '{"anchor":"bottom-center"}');
  assert.deepEqual(e.candidates.map((c) => c.status), ['OK', 'REJECTED_UNSAFE']);
  run('observe', '--ws', ws, '--revision', 'r1', '--candidates', JSON.stringify([c.candidateId]), '--out', join(root, 'observe'));
  run('commit', '--ws', ws, '--accept', c.candidateId, '--expected-head', 'r1');
  const result = run('submit', '--ws', ws, '--out', join(root, 'final'));
  assert.equal(result.protection.status, 'PASS');
  assert.ok((await readFile(join(root, 'final', result.files.asset))).length > 0);
});
