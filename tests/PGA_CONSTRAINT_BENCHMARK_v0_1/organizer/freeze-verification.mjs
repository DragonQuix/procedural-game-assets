#!/usr/bin/env node
// 冻结校验与协议冻结：
//   node freeze-verification.mjs            → 独立重算全部树/材料/文件哈希，写 freeze-hash-report.json
//   node freeze-verification.mjs --freeze   → 校验通过后，从 protocol-draft.json + freeze-inputs.json
//                                             生成 protocol-frozen.json 与 freeze-manifest.json
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const self = dirname(fileURLToPath(import.meta.url));
const kit = resolve(self, '..');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function hashTree(dir) {
  const files = {};
  const walk = async (current) => {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const p = join(current, entry.name);
      if (entry.isDirectory()) await walk(p);
      else files[p.slice(dir.length + 1).replaceAll('\\', '/')] = sha256(await readFile(p));
    }
  };
  await walk(dir);
  return files;
}
function aggregateCandidates(files) {
  const paths = Object.keys(files).sort();
  const lines = {
    tab: paths.map((p) => `${p}\t${files[p]}\n`).join(''),
    spaces: paths.map((p) => `${p}  ${files[p]}\n`).join(''),
    colon: paths.map((p) => `${p}:${files[p]}\n`).join(''),
    hashFirst: paths.map((p) => `${files[p]}  ${p}\n`).join(''),
    jsonCompact: JSON.stringify(Object.fromEntries(paths.map((p) => [p, files[p]]))),
    jsonPretty: JSON.stringify(Object.fromEntries(paths.map((p) => [p, files[p]])), null, 2) + '\n',
    rawBytesConcat: null, // 单独处理
  };
  return Object.fromEntries(Object.entries(lines).map(([k, v]) => [k, v === null ? null : sha256(Buffer.from(v, 'utf8'))]));
}

const manifest = JSON.parse(await readFile(join(kit, 'preparation-manifest.json'), 'utf8'));
const report = { generatedAt: new Date().toISOString(), trees: {}, materials: {}, aggregates: {}, files: {}, mismatches: [] };

for (const arm of ['D12', 'D13']) {
  const dir = join(kit, 'frozen', manifest.toolkits[arm].path ?? arm);
  const actual = await hashTree(dir);
  const expected = manifest.toolkits[arm].files;
  for (const [file, hash] of Object.entries(expected)) {
    if (actual[file] !== hash) report.mismatches.push({ kind: 'toolkit', arm, file, expected: hash, actual: actual[file] ?? 'MISSING' });
  }
  for (const file of Object.keys(actual)) {
    if (!(file in expected)) report.mismatches.push({ kind: 'toolkit-extra', arm, file });
  }
  report.trees[arm] = { fileCount: Object.keys(actual).length, source: manifest.toolkits[arm].source, path: manifest.toolkits[arm].path ?? arm };
  report.aggregates[arm] = aggregateCandidates(actual);
  // raw bytes 聚合
  const { createHash: ch } = await import('node:crypto');
  const h = ch('sha256');
  for (const p of Object.keys(actual).sort()) h.update(await readFile(join(dir, p)));
  report.aggregates[arm].rawBytesConcat = h.digest('hex');
}

report.materials = await hashTree(join(kit, 'materials'));
for (const [file, hash] of Object.entries(manifest.materials)) {
  if (report.materials[file] !== hash) report.mismatches.push({ kind: 'material', file, expected: hash, actual: report.materials[file] ?? 'MISSING' });
}
for (const [file, hash] of Object.entries(manifest.sharedObservationFiles ?? {})) {
  const expectedInD13 = manifest.toolkits.D13.files[file];
  if (expectedInD13 !== hash) report.mismatches.push({ kind: 'shared-observation', file, expected: hash, actual: expectedInD13 ?? 'MISSING' });
}
const protocolBytes = await readFile(join(kit, 'protocol-draft.json'));
report.files['protocol-draft.json'] = sha256(protocolBytes);
if (manifest.protocolSha256 && report.files['protocol-draft.json'] !== manifest.protocolSha256) {
  report.mismatches.push({ kind: 'protocol', expected: manifest.protocolSha256, actual: report.files['protocol-draft.json'] });
}
for (const [base, rel] of [
  [kit, 'prompts/participant.md'], [kit, 'prompts/participant-frozen-template.md'], [kit, 'prompts/reviewer-frozen-template.md'],
  [kit, 'organizer/materials.mjs'], [kit, 'organizer/trial-observe.mjs'], [kit, 'organizer/evaluate-run.mjs'], [kit, 'organizer/setup-trial.mjs'],
  [kit, 'organizer/freeze-verification.mjs'], [kit, 'prepare-materials.mjs'], [kit, 'README.md'],
  [resolve(kit, '../..'), 'tools/benchmark/README.md'], [resolve(kit, '../..'), 'tools/benchmark/blind.mjs'],
  [resolve(kit, '../..'), 'tools/benchmark/review.mjs'], [resolve(kit, '../..'), 'tools/benchmark/unblind.mjs'],
]) {
  try { report.files[rel] = sha256(await readFile(join(base, rel))); } catch { report.files[rel] = null; }
}
for (const rel of ['organizer/freeze-inputs.json']) {
  try { report.files[rel] = sha256(await readFile(join(kit, rel))); } catch { report.files[rel] = null; }
}

await writeFile(join(self, 'freeze-hash-report.json'), JSON.stringify(report, null, 2) + '\n');
const summary = {
  ok: report.mismatches.length === 0,
  mismatches: report.mismatches,
  D12: { fileCount: report.trees.D12.fileCount, aggregates: report.aggregates.D12 },
  D13: { fileCount: report.trees.D13.fileCount, aggregates: report.aggregates.D13 },
};
console.log(JSON.stringify(summary, null, 1));
if (report.mismatches.length) process.exit(1);

if (process.argv.includes('--freeze')) {
  const draft = JSON.parse(protocolBytes);
  const inputs = JSON.parse(await readFile(join(self, 'freeze-inputs.json'), 'utf8'));
  const frozen = {
    schema: 'pga-constraint-benchmark/0.1-frozen',
    frozenAt: new Date().toISOString(),
    benchmark: { name: 'PGA_CONSTRAINT_BENCHMARK', version: '0.1' },
    repository: {
      url: inputs.repositoryUrl,
      masterHeadAtAuthorization: inputs.masterHead,
      tag: 'v0.7.0',
    },
    draftReference: { protocolDraftSha256: report.files['protocol-draft.json'], mappingSeed: draft.mappingSeed, runOrder: draft.runOrder },
    toolkits: {
      D12: { path: report.trees.D12.path, source: report.trees.D12.source, fileCount: report.trees.D12.fileCount, perFileManifest: 'preparation-manifest.json', aggregate: report.aggregates.D12 },
      D13: { path: report.trees.D13.path, source: report.trees.D13.source, fileCount: report.trees.D13.fileCount, perFileManifest: 'preparation-manifest.json', aggregate: report.aggregates.D13 },
    },
    materials: manifest.materials,
    prompts: {
      base: { file: 'prompts/participant.md', sha256: report.files['prompts/participant.md'] },
      participantTemplate: { file: 'prompts/participant-frozen-template.md', sha256: report.files['prompts/participant-frozen-template.md'] },
      reviewerTemplate: { file: 'prompts/reviewer-frozen-template.md', sha256: report.files['prompts/reviewer-frozen-template.md'] },
    },
    commonObservation: {
      moduleFiles: manifest.sharedObservationFiles,
      runner: { file: 'organizer/trial-observe.mjs', sha256: report.files['organizer/trial-observe.mjs'], schema: 'pga-trial-observation/1' },
      parityEvidence: 'prepare-materials --check: sharedObservationsEqual=true, baselinePixelsEqual=true；runner 对两臂使用同一共享模块与同一代码路径',
    },
    harness: {
      evaluator: { file: 'organizer/evaluate-run.mjs', sha256: report.files['organizer/evaluate-run.mjs'] },
      setup: { file: 'organizer/setup-trial.mjs', sha256: report.files['organizer/setup-trial.mjs'] },
      freezeVerification: { file: 'organizer/freeze-verification.mjs', sha256: report.files['organizer/freeze-verification.mjs'] },
      blind: { file: 'tools/benchmark/blind.mjs', sha256: report.files['tools/benchmark/blind.mjs'] },
      review: { file: 'tools/benchmark/review.mjs', sha256: report.files['tools/benchmark/review.mjs'] },
      unblind: { file: 'tools/benchmark/unblind.mjs', sha256: report.files['tools/benchmark/unblind.mjs'] },
      reviewSchema: 'pga-review/3',
    },
    candidateBudget: draft.candidateBudget,
    reviewersPerPair: draft.reviewersPerPair,
    reviewerPositionPolicy: draft.reviewerPositionPolicy,
    primary: draft.primary,
    secondary: draft.secondary,
    go: draft.go,
    model: inputs.model,
    gates: inputs.gates,
    policies: inputs.policies,
    execution: { started: false, participantRuns: 0, reviews: 0, results: null },
  };
  await writeFile(join(kit, 'protocol-frozen.json'), JSON.stringify(frozen, null, 2) + '\n');
  const freezeManifest = {
    schema: 'pga-freeze-manifest/1',
    createdAt: new Date().toISOString(),
    protocolSha256: sha256(Buffer.from(JSON.stringify(frozen, null, 2) + '\n', 'utf8')),
    protocolFile: 'protocol-frozen.json',
    hashReport: { file: 'organizer/freeze-hash-report.json', sha256: sha256(await readFile(join(self, 'freeze-hash-report.json'))) },
    frozenArtifacts: Object.fromEntries(Object.entries(report.files).map(([k, v]) => [k, v])),
    toolkitAggregates: report.aggregates,
    materials: manifest.materials,
    preparationManifestSha256: sha256(await readFile(join(kit, 'preparation-manifest.json'))),
  };
  await writeFile(join(kit, 'freeze-manifest.json'), JSON.stringify(freezeManifest, null, 2) + '\n');
  console.log(JSON.stringify({ frozen: true, protocolSha256: freezeManifest.protocolSha256 }));
}
