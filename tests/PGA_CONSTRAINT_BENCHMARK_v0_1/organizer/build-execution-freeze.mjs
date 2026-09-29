#!/usr/bin/env node
// 12 run 全部完成后构建 execution-freeze-manifest.json（§23）。
//   node build-execution-freeze.mjs --runs-dir <runsDir> --trial-map <trial-map.json> --out <kitRoot>
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const self = dirname(fileURLToPath(import.meta.url));
const kit = resolve(self, '..');
const argOf = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const req = (n) => { const v = argOf(n); if (!v) { console.error(`缺少 --${n}`); process.exit(2); } return resolve(v); };

const runsDir = req('runs-dir');
const map = JSON.parse(await readFile(req('trial-map'), 'utf8'));
const outDir = req('out');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

const KIT_ANON = { D12: 'kit-A', D13: 'kit-B' }; // 匿名臂标签；明文映射只在 organizer/trial-map.json（不入库）

const records = [];
for (const trialId of Object.keys(map.trials).sort()) {
  const info = map.trials[trialId];
  const trialDir = join(runsDir, trialId);
  const ws = join(trialDir, 'ws');
  const submitDir = join(trialDir, 'submit');
  const trial = JSON.parse(await readFile(join(trialDir, 'trial.json'), 'utf8'));

  const readJsonDir = async (dir) => {
    if (!existsSync(dir)) return [];
    return Promise.all((await readdir(dir)).filter((f) => f.endsWith('.json')).map(async (f) => ({
      name: f, bytes: await readFile(join(dir, f)),
    })));
  };
  const candidates = await readJsonDir(join(ws, 'candidates'));
  const requests = await readJsonDir(join(ws, 'requests'));
  const revisions = await readJsonDir(join(ws, 'revisions'));
  const ledgerBytes = [...candidates, ...requests, ...revisions]
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((f) => [Buffer.from(f.name + '\n'), f.bytes]);
  const ledgerHash = sha256(Buffer.concat(ledgerBytes));

  let submitState = 'MISSING', finalRenderHash = null, finalSourceHash = null;
  if (existsSync(submitDir)) {
    const files = await readdir(submitDir);
    const png = files.find((f) => f.endsWith('.page0.png'));
    const studio = files.find((f) => f.endsWith('.studio.json'));
    if (png && studio) {
      submitState = 'SUBMITTED';
      finalRenderHash = sha256(await readFile(join(submitDir, png)));
      finalSourceHash = sha256(await readFile(join(submitDir, studio)));
    }
  }

  const candidateOk = candidates.filter((c) => JSON.parse(c.bytes.toString('utf8')).checks?.status === 'OK');
  let candidateCount = 0;
  {
    const seen = new Set();
    for (const c of candidateOk) {
      const hashes = JSON.parse(c.bytes.toString('utf8')).hashes?.renderHash;
      if (hashes) seen.add(hashes);
    }
    const base = revisions.find((r) => r.name === 'r1.json');
    if (base) {
      const baseHash = JSON.parse(base.bytes.toString('utf8')).hashes?.renderHash;
      if (baseHash) seen.delete(baseHash);
    }
    candidateCount = seen.size;
  }
  let validationProbeCount = 0;
  for (const c of candidates) {
    const v = JSON.parse(c.bytes.toString('utf8')).validationProbeCount;
    if (Number.isFinite(v)) validationProbeCount += v;
  }
  for (const r of requests) {
    const tested = JSON.parse(r.bytes.toString('utf8'))?.result?.safeDomain?.validation?.tested;
    if (Number.isFinite(tested)) validationProbeCount += tested;
  }

  let visionEvidence = 'UNTESTED';
  let sessionId = null;
  try {
    const s = JSON.parse(await readFile(join(trialDir, 'host-evidence', 'summary.json'), 'utf8'));
    visionEvidence = s.visionEvidence ?? 'UNTESTED';
    sessionId = s.rolloutSession ?? s.agentId ?? null;
  } catch {}

  let kitHashBinding = null;
  try {
    const report = JSON.parse(await readFile(join(kit, 'organizer', 'freeze-hash-report.json'), 'utf8'));
    const tree = report.trees[info.arm];
    kitHashBinding = { path: tree.path, source: tree.source, fileCount: tree.fileCount, perFileManifest: 'preparation-manifest.json' };
  } catch {}

  records.push({
    trialId,
    task: info.task,
    repeat: Math.floor((Number(trialId.slice(1)) - 1) / 4) + 1,
    anonymousArmId: KIT_ANON[info.arm],
    toolkit: kitHashBinding,
    finalSourceHash,
    finalRenderHash,
    submitState,
    candidateCount,
    validationProbeCount,
    operationLedgerHash: ledgerHash,
    visionEvidence,
    participantSessionId: sessionId,
  });
}

const manifest = {
  schema: 'pga-execution-freeze/1',
  createdAt: new Date().toISOString(),
  protocolSha256: sha256(await readFile(join(kit, 'protocol-frozen.json'))),
  runs: records,
};
const file = join(outDir, 'execution-freeze-manifest.json');
if (existsSync(file)) { console.error('execution-freeze-manifest.json 已存在，拒绝覆盖'); process.exit(4); }
await writeFile(file, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({
  created: file,
  manifestSha256: sha256(await readFile(file)),
  runs: records.map((r) => ({ trialId: r.trialId, submit: r.submitState, candidates: r.candidateCount, vision: r.visionEvidence })),
}, null, 1));
