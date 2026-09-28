#!/usr/bin/env node
// Negative controls for the v1.1 adapter, without changing project source files.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { args, writeJson } from '../runner/common.mjs';
import { checkCrashRetry } from './crash-retry-v1_1.mjs';
const o = args();
if (!o.repo || !o.out) throw Error('Usage: --repo PROJECT --out NEW_OUTPUT_DIR');
const root = resolve(o.repo), out = resolve(o.out);
await mkdir(out, { recursive: true });
const { StudioStore } = await import(pathToFileURL(join(root, 'src/adapters/studio-store.js')).href);
const document = JSON.parse(await readFile(join(root, 'examples/studio/terminal.studio.json'), 'utf8'));
const options = { generator: 'adapter-negative-control', toolVersion: 'preflight/1' };
class BrokenRecovery extends StudioStore {
  static async open(dir, opts) {
    const store = await StudioStore.open(dir, opts);
    store._recover = async () => { const e = Error('Deliberately broken recovery'); e.code = 'STALE_REVISION'; throw e; };
    return store;
  }
}
class RewritesHistory extends StudioStore {
  static async open(dir, opts) {
    const store = await StudioStore.open(dir, opts);
    const original = store.commit.bind(store);
    store.commit = async (...argv) => {
      const result = await original(...argv);
      const file = join(dir, 'revisions/r1.json');
      await writeFile(file, (await readFile(file, 'utf8')) + '\n');
      return result;
    };
    return store;
  }
}
const results = [];
for (const [name, Klass] of [['broken-recovery', BrokenRecovery], ['history-rewrite', RewritesHistory]]) {
  const caseOut = join(out, name);
  await mkdir(caseOut, { recursive: true });
  const result = await checkCrashRetry({ StudioStore: Klass, document, options, root, out: caseOut });
  const fail = result.subcases.some(s => s.status === 'FAIL');
  results.push({ name, pass: !result.pass && fail, result });
}
const summary = { status: results.every(x => x.pass) ? 'PASS' : 'FAIL', tests: results.length, scope: 'Mutants affect only disposable workspace objects/files, not project source.', results };
await writeJson(join(out, 'adapter-self-test.json'), summary);
console.log(JSON.stringify({ status: summary.status, tests: summary.tests, cases: results.map(r => ({ name: r.name, pass: r.pass, subcases: r.result.subcases.map(s => ({ phase: s.phase, status: s.status, reason: s.reason })) })) }, null, 2));
process.exitCode = summary.status === 'PASS' ? 0 : 1;
