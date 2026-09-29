#!/usr/bin/env node
// 从冻结模板实例化 participant 提示词到 trial 目录；记录 SHA-256。
//   node instantiate-prompt.mjs --trial-id T01 --runs-dir <runsDir>
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const self = dirname(fileURLToPath(import.meta.url));
const kit = resolve(self, '..');
const argOf = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const trialId = argOf('trial-id');
const runsDir = resolve(argOf('runs-dir'));
if (!trialId) { console.error('缺少 --trial-id'); process.exit(2); }

const trialDir = join(runsDir, trialId);
const trial = JSON.parse(await readFile(join(trialDir, 'trial.json'), 'utf8'));
const template = await readFile(join(kit, 'prompts', 'participant-frozen-template.md'), 'utf8');
const abs = (p) => resolve(p).replaceAll('\\', '/');
const prompt = template
  .replaceAll('{{TRIAL_ID}}', trialId)
  .replaceAll('{{TASK}}', trial.task)
  .replaceAll('{{ARM_KIT_ABS}}', abs(join(trialDir, 'kit')))
  .replaceAll('{{TRIAL_DIR_ABS}}', abs(trialDir));
const file = join(trialDir, 'participant-prompt.md');
await writeFile(file, prompt);
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
console.log(JSON.stringify({ trialId, promptFile: file, sha256: sha256(await readFile(file)) }));
