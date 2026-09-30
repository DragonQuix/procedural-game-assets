#!/usr/bin/env node
/** 按冻结顺序为 12 个正式 run 建 staging（协调器私有）；任何 FAIL 即整体中止。 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareTrial } from '../../../tools/benchmark/payload-gate.mjs';

const bench = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runsRoot = join(bench, 'runs');
await mkdir(runsRoot, { recursive: true });
const protocol = JSON.parse(await readFile(join(bench, 'protocol-frozen.json'), 'utf8'));
const manifest = JSON.parse(await readFile(join(bench, 'preparation-manifest.json'), 'utf8'));
if (manifest.status !== 'FROZEN' || manifest.approvedToExecute !== true) throw new Error('清单未冻结');

const results = [];
for (const runId of protocol.runOrder) {
  const [task, arm, rep] = runId.split('-');
  const trialRoot = join(runsRoot, runId, 'trial');
  await mkdir(dirname(trialRoot), { recursive: true });
  const gate = await prepareTrial({ trialRoot, materialRoot: bench, manifest, expectedArm: arm, taskId: task });
  results.push({ runId, status: gate.status, toolkitHash: (gate.toolkitHash ?? '').slice(0, 8), reason: gate.reason ?? null });
  if (gate.status !== 'PASS') { console.error('STAGING_FAIL', JSON.stringify(results, null, 2)); process.exit(3); }
}
await writeFile(join(runsRoot, 'staging-log.json'), JSON.stringify({ frozenAt: protocol.frozenAt, protocolSha256: protocol.mappingSeed && protocol.runOrder, results, at: new Date().toISOString() }, null, 2) + '\n');
console.log(JSON.stringify({ staged: results.length, all: 'PASS', order: protocol.runOrder }, null, 2));
