import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { benchmark, repo, checkMaterials } from './prepare-materials.mjs';
import { json } from '../shared/files.mjs';
import { leakageScan } from './leakage.mjs';

const materialRoot = join(benchmark, 'candidate-materials');
const hashes = await checkMaterials(materialRoot);
const command = ['--test', '--test-reporter=tap', 'tests/integration/benchmark-e2e-v03.test.js'];
const result = spawnSync(process.execPath, command, { cwd: repo, env: { ...process.env, PGA_E2E_MATERIALS: materialRoot }, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
const count = name => Number(result.stdout?.match(new RegExp(`^# ${name} (\\d+)$`, 'm'))?.[1] ?? 0);
const leakage = await leakageScan(materialRoot);
const report = { schema: 'pga-e2e-developer-checks/0.3', status: result.status === 0 && count('tests') > 1 && count('skipped') === 0 && leakage.status === 'PASS' ? 'PASS' : 'FAIL',
  node: process.version, command: [process.execPath, ...command], tests: count('tests'), passed: count('pass'), failed: count('fail'), skipped: count('skipped'),
  exitCode: result.status, hashes, leakage, evidenceType: 'SYNTHETIC_MECHANICAL_ONLY',
  participantRuns: 0, reviews: 0, scoredModelCalls: 0, formalModelFreeze: false, formalHostFreeze: false,
  note: '合成 review/host callback 只在临时目录测试并清理，不是模型裁决或正式 run。' };
await json(join(benchmark, 'evidence/developer-self-tests.json'), report);
console.log(result.stdout ?? ''); if (result.stderr) console.error(result.stderr);
console.log(JSON.stringify(report, null, 2)); if (report.status !== 'PASS') process.exitCode = 1;
