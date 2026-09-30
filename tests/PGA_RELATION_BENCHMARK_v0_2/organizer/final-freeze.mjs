#!/usr/bin/env node
/**
 * D14 FINAL 冻结（协调器专用，append-only；不覆盖旧 candidate snapshot）。
 * 从 merge/tag provenance 建立新快照，记录 per-file/aggregate hash，
 * 校验与 candidate 的关系及 D13 来源，并把 preparation-manifest 的 D14 指向 FINAL。
 */
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { hashTree, treeHash, sha256 } from '../../../tools/benchmark/payload-gate.mjs';

const kit = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(kit, '../..');
const git = (...args) => execFileSync('git', args, { cwd: root });
const mergeSha = git('rev-parse', 'v0.8.0^{commit}').toString().trim();
const short = mergeSha.slice(0, 7);
const dir = `frozen/D14-FINAL-0.8.0-${short}`;
const candidateDir = 'frozen/D14-0.8.0-20b81c1';
const d13Dir = 'frozen/D13-0.7.0-37317b5';

let exists = false;
try { await readdir(join(kit, dir)); exists = true; } catch { /* 不存在 → 可建立 */ }
if (exists) { console.log(JSON.stringify({ status: 'ALREADY_PRESENT', dir })); process.exit(0); }

// 1) 与 prepare-materials.mjs 同一文件集：开发源 ref + v0.7.0 的 pngjs 依赖字节
await mkdir(join(kit, dir), { recursive: true });
const names = git('ls-tree', '-r', '--name-only', mergeSha, '--', 'src', 'bin', 'package.json', 'package-lock.json', 'docs/studio-cli.md').toString().trim().split(/\r?\n/);
for (const name of names) {
  const dst = join(kit, dir, name);
  await mkdir(dirname(dst), { recursive: true });
  await writeFile(dst, git('show', `${mergeSha}:${name}`));
}
const prefix = 'skills/procedural-game-assets/assets/toolkit/';
const deps = git('ls-tree', '-r', '--name-only', 'v0.7.0', '--', `${prefix}node_modules/pngjs`).toString().trim().split(/\r?\n/);
for (const name of deps) {
  const dst = join(kit, dir, name.slice(prefix.length));
  await mkdir(dirname(dst), { recursive: true });
  await writeFile(dst, git('show', `v0.7.0:${name}`));
}
const pkg = JSON.parse(await readFile(join(kit, dir, 'package.json'), 'utf8'));
assert.equal(pkg.version, '0.8.0');

// 2) 哈希清单
const descriptor = { path: dir, files: await hashTree(join(kit, dir)), sha256: treeHash((await hashTree(join(kit, dir)))) };
const fileCount = Object.keys(descriptor.files).length;

// 3) 与 candidate 的关系：逐文件比较共享文件集
const candidateFiles = Object.keys(await hashTree(join(kit, candidateDir)));
const finalFiles = Object.keys(descriptor.files);
const shared = candidateFiles.filter((f) => finalFiles.includes(f));
let identical = 0, differing = [];
for (const f of shared) {
  const a = await readFile(join(kit, candidateDir, f));
  const b = await readFile(join(kit, dir, f));
  if (a.equals(b)) identical++; else differing.push(f);
}
const onlyInFinal = finalFiles.filter((f) => !candidateFiles.includes(f));
const onlyInCandidate = candidateFiles.filter((f) => !finalFiles.includes(f));

// 4) D13 来源复核：快照与 v0.7.0 tag 的 src/bin 逐字节一致（真实 v1.3，非 feature-off）
const d13Names = git('ls-tree', '-r', '--name-only', 'v0.7.0', '--', 'src', 'bin').toString().trim().split(/\r?\n/);
let d13Verified = 0;
for (const name of d13Names) {
  const fromTag = git('show', `v0.7.0:${name}`);
  const onDisk = await readFile(join(kit, d13Dir, name));
  assert.ok(fromTag.equals(onDisk), `D13 快照与 v0.7.0 不一致：${name}`);
  d13Verified++;
}

// 5) provenance 记录
const provenance = {
  schema: 'pga-d14-final-provenance/1',
  arm: 'D14', status: 'FROZEN_FINAL',
  sourceTag: 'v0.8.0', sourceMergeCommit: mergeSha,
  candidateSnapshot: candidateDir, candidateStatus: 'PRESERVED_NOT_OVERWRITTEN',
  relationToCandidate: differing.length === 0 && onlyInCandidate.length === 0
    ? { kind: differing.length === 0 ? 'SHARED_FILES_BYTE_IDENTICAL' : 'DIFFERS', sharedFiles: shared.length, identical, differing, onlyInFinal, onlyInCandidate }
    : { kind: 'DIFFERS', sharedFiles: shared.length, identical, differing, onlyInFinal, onlyInCandidate },
  d13Verification: { snapshot: d13Dir, sourceTag: 'v0.7.0', filesVerified: d13Verified, result: 'BYTE_IDENTICAL_TO_TAG' },
  fileCount, aggregateSha256: descriptor.sha256, files: descriptor.files,
};
await writeFile(join(kit, `${dir}.provenance.json`), JSON.stringify(provenance, null, 2) + '\n');

// 6) preparation-manifest 的 D14 指向 FINAL（保留其余哈希；整体状态冻结另行翻转）
const manifestPath = join(kit, 'preparation-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.toolkits.D14 = { ...descriptor, arm: 'D14', version: '0.8.0', sourceCommit: mergeSha, sourceTag: 'v0.8.0', status: 'FROZEN_FINAL', provenance: `${dir}.provenance.json` };
manifest.finalFreeze = 'D14_FINAL_SNAPSHOT_BUILT_PROTOCOL_FREEZE_PENDING';
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(JSON.stringify({ status: 'D14_FINAL_BUILT', dir, fileCount, aggregateSha256: descriptor.sha256,
  relationToCandidate: provenance.relationToCandidate, d13Verification: provenance.d13Verification,
  manifestD14: { path: manifest.toolkits.D14.path, status: manifest.toolkits.D14.status } }, null, 2));
