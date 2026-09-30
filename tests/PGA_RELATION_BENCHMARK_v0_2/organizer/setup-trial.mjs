#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareTrial } from '../../../tools/benchmark/payload-gate.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = n => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? undefined : process.argv[i + 1]; };
if (!arg('out') || !arg('arm') || !arg('task')) throw new Error('需要 --out <全新协调器试次目录> --arm D13|D14 --task C|R');
const manifestPath = arg('manifest') ? resolve(arg('manifest')) : join(root, 'preparation-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const result = await prepareTrial({ trialRoot: resolve(arg('out')), materialRoot: root, manifest, expectedArm: arg('arm'), taskId: arg('task') });
console.log(JSON.stringify(result, null, 2));
if (result.status !== 'PASS') process.exitCode = 3;
