#!/usr/bin/env node
/** 12 participant 完成后的执行冻结；随后 participant 数据只读。 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { sha256 } from '../../../tools/benchmark/payload-gate.mjs';

const bench = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const protocol = JSON.parse(await readFile(join(bench, 'protocol-frozen.json'), 'utf8'));
const files = {};
for (const runId of protocol.runOrder) {
  files[`results/evaluate/${runId}.json`] = sha256(await readFile(join(bench, 'results', 'evaluate', `${runId}.json`)));
  files[`runs/${runId}/trial/launch-gate.json`] = sha256(await readFile(join(bench, 'runs', runId, 'trial', 'launch-gate.json')));
  const staged = join(bench, 'runs', runId, 'trial', 'staged');
  files[`runs/${runId}/metadata.json`] = sha256(await readFile(join(staged, 'metadata.json')));
  files[`runs/${runId}/participant-report.md`] = sha256(await readFile(join(staged, 'participant-report.md')));
  files[`runs/${runId}/submit-count`] = createHash('sha256').update(String((await readdir(join(staged, 'submit'))).filter((f) => f.endsWith('.studio.json')).length)).digest('hex');
}
const executionFreeze = { schema: 'pga-relation-execution-freeze/1', frozenAt: new Date().toISOString(),
  protocolSha256: sha256(await readFile(join(bench, 'protocol-frozen.json'))),
  participantRunsCompleted: protocol.runOrder.length, reviewsCompleted: 0,
  note: '12 participant runs 冻结；此后 participant 数据只读。盲评与解盲另行记录。',
  files };
await writeFile(join(bench, 'execution-freeze-manifest.json'), JSON.stringify(executionFreeze, null, 2) + '\n');
console.log(JSON.stringify({ frozenAt: executionFreeze.frozenAt, files: Object.keys(files).length, executionFreezeSha256: sha256(Buffer.from(JSON.stringify(executionFreeze, null, 2) + '\n')) }));
