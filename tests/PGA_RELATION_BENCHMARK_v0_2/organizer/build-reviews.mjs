#!/usr/bin/env node
/** 构建 6 对盲评包：冻结 X/Y→run 映射；key 只写 results/blind-keys/；记录逐文件哈希供隔离校验。 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { buildSymbolicBlindPackage } from '../../../tools/benchmark/symbolic-blind.mjs';
import { hashTree, treeHash, sha256 } from '../../../tools/benchmark/payload-gate.mjs';

const bench = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const protocol = JSON.parse(await readFile(join(bench, 'protocol-frozen.json'), 'utf8'));
await mkdir(join(bench, 'results', 'blind-keys'), { recursive: true });
await mkdir(join(bench, 'reviews'), { recursive: true });

async function candidateAsset(runId) {
  const [task, arm] = runId.split('-');
  const staged = join(bench, 'runs', runId, 'trial', 'staged');
  const kit = await import(pathToFileURL(join(staged, 'kit', 'src', 'studio', 'compiler.js')).href);
  const submitFiles = (await readdir(join(staged, 'submit'))).filter((f) => f.endsWith('.studio.json'));
  if (submitFiles.length !== 1) throw new Error(`${runId} submit 不唯一`);
  const doc = JSON.parse(await readFile(join(staged, 'submit', submitFiles[0]), 'utf8'));
  return { runId, asset: kit.compileStudioDocument(doc).asset };
}
async function readDirSafe(dir) { try { return await hashTree(dir); } catch { return null; } }

const record = {};
for (const [pairId, pair] of Object.entries(protocol.pairs)) {
  const taskText = await readFile(join(bench, 'materials', pair.task, 'common', 'TASK.md'), 'utf8');
  const runX = pair.runA, runY = pair.runB; // runA 即协议中的 X 臂 run
  const { createHash: ch } = await import('node:crypto');
  const flip = ch('sha256').update(`${protocol.mappingSeed}|${pair.task}|${pair.repeat}`).digest()[0] & 1;
  const assetX = await candidateAsset(runX), assetY = await candidateAsset(runY);
  // buildSymbolicBlindPackage 内部按 seed|task|repeat 的 flip 决定 X=A 还是 X=B；此处按同一 flip 摆放使 X=runX
  const candidateA = flip === 0 ? assetX : assetY;
  const candidateB = flip === 0 ? assetY : assetX;
  const outDir = join(bench, 'reviews', pairId);
  await mkdir(dirname(outDir), { recursive: true });
  const key = await buildSymbolicBlindPackage(outDir, { task: pair.task, repeat: pair.repeat, seed: protocol.mappingSeed, candidateA, candidateB, taskText });
  if (key.identities.X !== runX || key.identities.Y !== runY) throw new Error(`${pairId} X/Y 映射与冻结协议不符`);
  await writeFile(join(bench, 'results', 'blind-keys', `${pairId}.key.json`), JSON.stringify(key, null, 2) + '\n');
  record[pairId] = { X: key.identities.X, Y: key.identities.Y,
    reviewerInputs: { 'reviewer-1': await readDirSafe(join(outDir, 'reviewer-1')), 'reviewer-2': await readDirSafe(join(outDir, 'reviewer-2')) } };
}
await writeFile(join(bench, 'reviews', 'package-manifest.json'), JSON.stringify({ builtAt: new Date().toISOString(), mappingSeed: protocol.mappingSeed, pairs: record }, null, 2) + '\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(record).map(([k, v]) => [k, { X: v.X, Y: v.Y }])), null, 2));
