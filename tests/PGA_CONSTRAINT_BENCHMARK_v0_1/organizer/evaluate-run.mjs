#!/usr/bin/env node
// 单 run 机械评估器（解盲前可运行，只产出单 run 事实，不做两臂汇总）。
// 独立最终合同对两臂使用同一实现（sharedKit 的 protection-contract.js）。
// 用法：node evaluate-run.mjs --trial <runs/Txx> --trial-map <organizer/trial-map.json>
import { readFile, writeFile, readdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const self = dirname(fileURLToPath(import.meta.url));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const argOf = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const req = (n) => { const v = argOf(n); if (!v) { console.error(`缺少 --${n}`); process.exit(2); } return resolve(v); };

const trialDir = req('trial');
const trialMap = JSON.parse(await readFile(req('trial-map'), 'utf8'));
const trialId = trialDir.split(/[\\/]/).pop();
const arm = trialMap.trials[trialId]?.arm;
const task = trialMap.trials[trialId]?.task;
if (!arm || !task) { console.error(`trial-map 中没有 ${trialId}`); process.exit(2); }

const kitDir = resolve(trialMap.trials[trialId].kitDir ?? join(trialDir, 'kit'));
const sharedKit = resolve(trialMap.sharedKit);
const ws = join(trialDir, 'ws');
const submitDir = join(trialDir, 'submit');
const contract = JSON.parse(await readFile(join(trialDir, 'task-contract.json'), 'utf8'));

const load = async (file) => JSON.parse(await readFile(file, 'utf8'));
const readJsonDir = async (dir) => {
  if (!existsSync(dir)) return [];
  const names = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  return Promise.all(names.map(async (f) => {
    const full = join(dir, f);
    const mtime = (await stat(full)).mtimeMs;
    return { ...(await load(full)), __file: full, __mtime: mtime };
  }));
};

const armApi = await import(pathToFileURL(join(kitDir, 'src/studio/dispatch.js')));
const sharedCompiler = await import(pathToFileURL(join(sharedKit, 'src/studio/compiler.js')));
const { checkAssetProtection } = await import(pathToFileURL(join(sharedKit, 'src/studio/protection-contract.js')));

const GEOMETRY_TRANSFORMS = ['widen_about_center', 'squash_keep_base', 'resize_about_anchor'];
const operationId = (operation) => operation?.id ?? null;

// ── 提交与确定性 ─────────────────────────────────────────────
const submitFiles = existsSync(submitDir) ? await readdir(submitDir) : [];
const submitStudio = submitFiles.find((f) => f.endsWith('.studio.json'));
const submitPng = submitFiles.find((f) => f.endsWith('.page0.png'));
const submitManifest = submitFiles.includes('ore-pressure-unit.manifest.json') || submitFiles.some((f) => f.endsWith('.manifest.json'));
const submitSuccess = Boolean(submitStudio && submitPng && submitManifest);

let deterministic = null;
if (submitSuccess) {
  const tmp = await mkdtemp(join(os.tmpdir(), 'pga-eval-'));
  try {
    execFileSync(process.execPath, [join(kitDir, 'bin/pga-studio.mjs'), 'export', '--ws', ws, '--out', tmp], { stdio: ['ignore', 'ignore', 'ignore'] });
    const rePng = (await readdir(tmp)).find((f) => f.endsWith('.page0.png'));
    deterministic = rePng ? sha256(await readFile(join(tmp, rePng))) === sha256(await readFile(join(submitDir, submitPng))) : false;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

// ── 最终文档：几何与保护 ─────────────────────────────────────
let geometry = null, finalProtection = null, ownProtection = null;
if (submitSuccess) {
  const finalDoc = await load(join(submitDir, submitStudio));
  const after = armApi.compileAny(finalDoc);
  const objectives = contract.objectives;
  // objectives 是文档坐标（基线节点即满足 centerX/bottomY）；frameRect 是最终帧坐标（含边距偏移），不用于几何判定。
  const nodeDoc = (after.document?.nodes ?? after.sceneMap?.nodes ?? []).find((n) => n.id === objectives.target);
  if (nodeDoc) {
    const r = { x: nodeDoc.x, y: nodeDoc.y, w: nodeDoc.w, h: nodeDoc.h };
    geometry = {
      pass: r.w >= objectives.minWidth && r.h <= objectives.maxHeight && r.x + r.w / 2 === objectives.centerX && r.y + r.h === objectives.bottomY,
      actual: { ...r, centerX: r.x + r.w / 2, bottomY: r.y + r.h },
      objectives,
    };
  }
  const contractBaseline = sharedCompiler.compileStudioDocument(contract.protection.baseline);
  const patched = { ...after, document: { ...after.document, protection: contract.protection } };
  const check = checkAssetProtection(contract.protection, contractBaseline, patched);
  finalProtection = { status: check.status, conflicts: check.conflicts ?? check.details ?? null };
  if (after.protection) ownProtection = { status: after.protection.status };
}

// ── 工作区台账：候选 / 请求 / 修订 ───────────────────────────
const candidates = await readJsonDir(join(ws, 'candidates'));
const requests = await readJsonDir(join(ws, 'requests'));
const revisions = await readJsonDir(join(ws, 'revisions'));
const headInfo = existsSync(join(ws, 'head.json')) ? await load(join(ws, 'head.json')) : null;
const baseRevision = revisions.find((r) => r.revision === 'r1');
const baselineRenderHash = baseRevision?.hashes?.renderHash ?? null;

const materialized = candidates.filter((c) => c.checks?.status === 'OK' && c.hashes?.renderHash);
const distinctRenderHashes = new Set(materialized.map((c) => c.hashes.renderHash));
if (baselineRenderHash) distinctRenderHashes.delete(baselineRenderHash);
const candidateCount = distinctRenderHashes.size;
const budgetPass = candidateCount <= 6;

const rejectedRequests = requests.filter((r) => typeof r.result?.status === 'string' && r.result.status.startsWith('REJECTED'));
const rejectedBeforeMaterialization = rejectedRequests.map((r) => ({
  requestId: r.requestId,
  status: r.result.status,
  operation: r.result.safeDomain?.operator ?? r.result.operation?.id ?? null,
  target: r.result.safeDomain?.target ?? r.result.operation?.target ?? null,
  upfront: Array.isArray(r.result.conflicts) ? r.result.conflicts.some((c) => c.upfront) : null,
}));

const invalidCandidates = [];
for (const c of materialized) {
  const after = armApi.compileAny(c.doc);
  const contractBaseline = sharedCompiler.compileStudioDocument(contract.protection.baseline);
  const patched = { ...after, document: { ...after.document, protection: contract.protection } };
  const check = checkAssetProtection(contract.protection, contractBaseline, patched);
  if (check.status !== 'PASS') invalidCandidates.push({ candidateId: c.candidateId, status: check.status });
}

let validationProbeCount = 0, probeSources = [];
for (const c of candidates) {
  if (Number.isFinite(c.validationProbeCount)) { validationProbeCount += c.validationProbeCount; probeSources.push(c.candidateId); }
}
for (const r of rejectedRequests) {
  const tested = r.result?.safeDomain?.validation?.tested;
  if (Number.isFinite(tested)) { validationProbeCount += tested; probeSources.push(r.requestId); }
}

// ── 几何请求序列：手工坐标修复 / 语义变换 ────────────────────
const geometryEvents = [];
for (const c of candidates) {
  const id = operationId(c.operation);
  if (id === 'geometry.set' || GEOMETRY_TRANSFORMS.includes(id)) {
    geometryEvents.push({ at: c.__mtime, source: `candidate:${c.candidateId}`, id, target: c.operation?.target, params: c.operation?.params ?? null, doc: c.doc });
  }
}
for (const r of rejectedRequests) {
  const id = r.result?.safeDomain?.operator ?? null;
  if (!id) continue;
  geometryEvents.push({
    at: r.__mtime, source: `request:${r.requestId}`, id,
    target: r.result.safeDomain.target,
    params: r.result.safeDomain.fixedParams ?? (r.result.safeDomain.field ? { [r.result.safeDomain.field]: r.result.requestedValue } : null),
    doc: null,
  });
}
geometryEvents.sort((a, b) => a.at - b.at);
const repairItems = [];
const lastGeometryByTarget = new Map();
for (const e of geometryEvents) {
  if (e.id !== 'geometry.set') continue;
  const p = e.params ?? {};
  const hasX = p.x !== undefined, hasY = p.y !== undefined, hasW = p.w !== undefined, hasH = p.h !== undefined;
  const absolutePair = (hasX && hasW) || (hasY && hasH);
  const coordOnly = (hasX || hasY) && !hasW && !hasH;
  let repair = false;
  if (absolutePair) {
    repair = true;
  } else if (coordOnly) {
    const prev = lastGeometryByTarget.get(e.target);
    const node = e.doc?.nodes?.find((n) => n.id === e.target);
    if (prev && node) {
      const centerX = node.x + node.w / 2, bottomY = node.y + node.h;
      if (centerX === prev.centerX && bottomY === prev.bottomY) repair = true;
    }
  }
  if (e.doc) {
    const node = e.doc.nodes?.find((n) => n.id === e.target);
    if (node) lastGeometryByTarget.set(e.target, { centerX: node.x + node.w / 2, bottomY: node.y + node.h });
  }
  if (repair) repairItems.push({ source: e.source, params: e.params });
}
const semanticEvents = geometryEvents.filter((e) => GEOMETRY_TRANSFORMS.includes(e.id));

// ── 协议：kit/材料未被改动、命令面合法 ───────────────────────
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
const manifest = JSON.parse(await readFile(resolve(sharedKit, '..', '..', 'preparation-manifest.json'), 'utf8'));
const expectedKitFiles = manifest.toolkits[arm].files;
const actualKitFiles = await hashTree(kitDir);
let kitTreeUnchanged = Object.keys(actualKitFiles).length >= Object.keys(expectedKitFiles).length;
for (const [file, hash] of Object.entries(expectedKitFiles)) {
  if (actualKitFiles[file] !== hash) { kitTreeUnchanged = false; break; }
}
const materialsUnchanged = sha256(await readFile(join(trialDir, 'task-contract.json'))) === manifest.materials[`${task}/task-contract.json`]
  && sha256(await readFile(join(trialDir, 'baseline.native.png'))) === manifest.materials[`${task}/baseline.native.png`]
  && sha256(await readFile(join(trialDir, 'start.studio.json'))) === manifest.materials[`${task}/${arm}.studio.json`];
const protocolPass = kitTreeUnchanged && materialsUnchanged;

// ── 汇总 ────────────────────────────────────────────────────
const evaluation = {
  schema: 'pga-run-evaluation/1',
  trialId, task, arm,
  evaluatedAt: new Date().toISOString(),
  submit: { success: submitSuccess, files: submitFiles, head: headInfo?.head ?? null },
  deterministic,
  geometry,
  finalProtection,
  ownProtection,
  budget: { candidateCount, materializedCount: materialized.length, baselineRenderHash, budgetPass },
  invalidMaterializedCandidate: { count: invalidCandidates.length, items: invalidCandidates },
  rejectedBeforeMaterialization: { count: rejectedBeforeMaterialization.length, items: rejectedBeforeMaterialization },
  validationProbeCount: { count: validationProbeCount, sources: probeSources, note: arm === 'D12' ? 'v1.2 无探针概念，explore 试编译即候选' : 'D13 candidate.validationProbeCount 与被拒请求 safeDomain.validation.tested 之和' },
  manualCoordinateRepair: { count: repairItems.length, items: repairItems },
  semanticTransform: { count: semanticEvents.length, items: semanticEvents.map((e) => ({ source: e.source, id: e.id, target: e.target })) },
  retriesErrors: {
    count: requests.filter((r) => r.result && r.result.ok === false).length,
    idempotentReplays: requests.filter((r) => r.idempotentReplay === true).length,
  },
  protocol: { kitTreeUnchanged, materialsUnchanged, pass: protocolPass },
};
await writeFile(join(trialDir, 'evaluate.json'), JSON.stringify(evaluation, null, 2) + '\n');
console.log(JSON.stringify({
  trialId, arm, task,
  submitSuccess, deterministic, geometryPass: geometry?.pass ?? null,
  finalProtection: finalProtection?.status ?? null, candidateCount, budgetPass,
  invalid: invalidCandidates.length, rejected: rejectedBeforeMaterialization.length,
  probes: validationProbeCount, repairs: repairItems.length, semantics: semanticEvents.length,
  protocolPass,
}, null, 1));
