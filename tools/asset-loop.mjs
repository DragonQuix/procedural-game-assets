#!/usr/bin/env node
import { randomInt, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { sha256 } from './release-manifest.mjs';

export const PROTOCOL = 'pga-loop/2';
const requireThat = (ok, message) => { if (!ok) throw new Error(message); };
const nonempty = (x) => typeof x === 'string' && x.trim().length > 0;
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const writeJson = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const stable = (value) => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]])) : v);
const digest = (value) => sha256(Buffer.from(stable(value)));
const unique = (values) => new Set(values).size === values.length;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const strings = (values, allowEmpty = false) => Array.isArray(values) && (allowEmpty || values.length > 0) && values.every(nonempty);
const CORE_DIMENSIONS = ['design', 'hierarchy', 'finish', 'usability'];
const EXTRA_DIMENSION = { series: 'cohesion', animation: 'motion', effect: 'motion', tilemap: 'tiling' };
const EXTRA_VIEW = { series: 'overview', animation: 'playback', effect: 'playback', tilemap: 'assembly' };
const DIMENSION_VIEW = { design: 'display', hierarchy: 'display', finish: 'native', usability: 'display',
  cohesion: 'overview', motion: 'playback', tiling: 'assembly' };
const protocolError = '协议不兼容：要求 pga-loop/2；旧记录请用 tools/legacy/asset-loop-v1.mjs check 只读验证，不自动迁移 WOW';

function namedList(values, label, allowEmpty = false) {
  requireThat(Array.isArray(values) && (allowEmpty || values.length > 0) &&
    values.every((v) => object(v) && nonempty(v.id)) && unique(values.map((v) => v.id)), `${label}缺失或编号重复`);
}

function localPath(root, path) {
  requireThat(nonempty(path) && !isAbsolute(path) && !path.includes('\\') &&
    !path.includes(':') && path.split('/').every((p) => p && p !== '.' && p !== '..'), '证据路径必须是根内相对路径');
  return join(root, path);
}

// 不跟随链接；普通哈希清单不是访问控制，也不证明证据的语义。
export async function fileHashes(root) {
  const result = {};
  async function walk(dir) {
    const info = await lstat(dir);
    requireThat(info.isDirectory() && !info.isSymbolicLink(), '材料根不能是链接或普通文件');
    for (const entry of (await readdir(dir)).sort()) {
      const path = join(dir, entry);
      const info = await lstat(path);
      requireThat(!info.isSymbolicLink(), `材料不能包含链接：${entry}`);
      if (info.isDirectory()) await walk(path);
      else {
        requireThat(info.isFile(), `不支持的材料类型：${entry}`);
        const rel = relative(root, path).replaceAll('\\', '/');
        localPath(root, rel);
        result[rel] = sha256(await readFile(path));
      }
    }
  }
  await walk(root);
  requireThat(Object.keys(result).length > 0, '材料目录不能为空');
  return result;
}

export function validateCharter(charter) {
  requireThat(charter?.protocol === PROTOCOL, protocolError);
  requireThat(nonempty(charter.approval) && nonempty(charter.intent), '缺少对齐授权或交付意图');
  requireThat(charter.captureProfile && typeof charter.captureProfile === 'object' &&
    !Array.isArray(charter.captureProfile) && Object.keys(charter.captureProfile).length > 0, '缺少固定采集 profile');
  const profile = charter.captureProfile;
  for (const key of ['nativeSize', 'displaySize']) {
    requireThat(Array.isArray(profile[key]) && profile[key].length === 2 &&
      profile[key].every((n) => Number.isSafeInteger(n) && n > 0), `采集尺寸未确定：${key}`);
  }
  requireThat(['background', 'sampling', 'command'].every((key) => nonempty(profile[key])) &&
    (nonempty(profile.seed) || Number.isFinite(profile.seed)), '采集条件尚未确定');
  const policy = charter.visualPolicy;
  requireThat(object(policy) && policy.goal === 'quality_parity', '视觉目标必须明确为质量同级，不是复制');
  requireThat(object(policy.referenceProfile) && nonempty(policy.referenceProfile.summary) &&
    strings(policy.referenceProfile.evidence) && unique(policy.referenceProfile.evidence) &&
    strings(policy.referenceProfile.limitations, true), '缺少标杆质量依据或参考盲区记录');
  for (const path of policy.referenceProfile.evidence) localPath('.', path);
  requireThat(strings(policy.creativeFreedom), '缺少明确的原创空间');
  namedList(policy.scopes, '视觉范围');
  for (const scope of policy.scopes) {
    requireThat(['asset', 'series', 'animation', 'effect', 'tilemap'].includes(scope.kind) && nonempty(scope.criterion), '视觉范围类型或要求无效');
    namedList(scope.views, `范围 ${scope.id} 的视图`);
    for (const view of scope.views) {
      requireThat(['native', 'display', 'context', 'detail', 'overview', 'playback', 'assembly'].includes(view.kind), '视图类型无效');
      localPath('.', view.path);
    }
    for (const kind of ['native', 'display', EXTRA_VIEW[scope.kind]].filter(Boolean)) {
      requireThat(scope.views.some((v) => v.kind === kind), `范围 ${scope.id} 缺少必需视图：${kind}`);
    }
  }
  namedList(policy.designConstraints, '明确设计约束', true);
  for (const constraint of policy.designConstraints) {
    requireThat(nonempty(constraint.criterion) && strings(constraint.scopeIds) && unique(constraint.scopeIds) &&
      constraint.scopeIds.every((id) => policy.scopes.some((s) => s.id === id)), '设计约束缺少要求或引用了未知范围');
  }
  namedList(charter.comparisons, '固定对照组');
  for (const comparison of charter.comparisons) {
    const scope = policy.scopes.find((s) => s.id === comparison.scopeId);
    requireThat(scope && scope.views.some((v) => v.path === comparison.candidate), '对照组未绑定范围内的候选视图');
    localPath('.', comparison.reference);
    localPath('.', comparison.candidate);
    requireThat(comparison.reference !== comparison.candidate, '两侧不得引用同一文件');
    requireThat(policy.referenceProfile.evidence.includes(comparison.reference), '对照参考未纳入标杆质量依据');
  }
  requireThat(stable(charter.requiredCritics) === stable(['visual', 'delivery']), '固定为 visual 与 delivery 两个独立席位');
  requireThat(Array.isArray(charter.requiredGates) && charter.requiredGates.length > 0 &&
    charter.requiredGates.every(nonempty) && unique(charter.requiredGates), '硬门禁名单缺失或重复');
  namedList(charter.pillars, '支柱');
  for (const p of charter.pillars) {
    requireThat(nonempty(p.criterion) && charter.requiredCritics.includes(p.critic), '支柱合同无效');
    if (p.critic === 'delivery') {
      requireThat(Number.isFinite(p.minimum) && p.minimum >= 0 && p.minimum <= 10, '交付支柱分数门槛无效');
      continue;
    }
    const scope = policy.scopes.find((s) => s.id === p.scopeId);
    requireThat(scope && [...CORE_DIMENSIONS, ...Object.values(EXTRA_DIMENSION)].includes(p.dimension) &&
      ['reference', 'requirement'].includes(p.basis) && p.minimum === undefined, '视觉支柱须绑定范围、维度和判据来源，不设分数门槛');
    requireThat(scope.views.some((v) => v.kind === DIMENSION_VIEW[p.dimension]), `支柱 ${p.id} 缺少对应视图`);
    if (p.basis === 'reference') {
      requireThat(strings(p.comparisonIds) && unique(p.comparisonIds) && p.comparisonIds.every((id) =>
        charter.comparisons.some((c) => c.id === id && c.scopeId === p.scopeId)), '参考支柱未绑定同范围的对照组');
    } else requireThat(p.comparisonIds === undefined, '独立要求不得冒充标杆比较');
  }
  for (const role of charter.requiredCritics) requireThat(charter.pillars.some((p) => p.critic === role), `席位没有支柱：${role}`);
  const visual = charter.pillars.filter((p) => p.critic === 'visual');
  requireThat(unique(visual.map((p) => `${p.scopeId}:${p.dimension}`)), '同一范围的视觉维度重复');
  for (const scope of policy.scopes) {
    for (const dimension of [...CORE_DIMENSIONS, EXTRA_DIMENSION[scope.kind]].filter(Boolean)) {
      requireThat(visual.some((p) => p.scopeId === scope.id && p.dimension === dimension), `范围 ${scope.id} 缺少必需视觉维度：${dimension}`);
    }
  }
  for (const comparison of charter.comparisons) {
    requireThat(visual.some((p) => p.basis === 'reference' && p.comparisonIds.includes(comparison.id)), '对照组未用于任何同级判断');
  }
}

function charterEvidence(charter, files) {
  const paths = [...charter.visualPolicy.referenceProfile.evidence,
    ...charter.visualPolicy.scopes.flatMap((s) => s.views.map((v) => v.path)),
    ...charter.comparisons.flatMap((c) => [c.reference, c.candidate])];
  for (const path of paths) requireThat(Object.hasOwn(files, path), `宪章所需证据不存在：${path}`);
}

export async function snapshot(artifactRoot, evidenceRoot, charterFile, output) {
  const charter = await readJson(charterFile);
  validateCharter(charter);
  const artifactFiles = await fileHashes(artifactRoot);
  const evidenceFiles = await fileHashes(evidenceRoot);
  charterEvidence(charter, evidenceFiles);
  const charterHash = sha256(await readFile(charterFile));
  const base = dirname(resolve(output));
  // 记录文件不得进入被记录的树，否则会产生自引用清单。
  for (const root of [artifactRoot, evidenceRoot]) {
    const rel = relative(resolve(root), resolve(output));
    requireThat(rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel), '记录文件必须位于冻结材料目录之外');
  }
  const record = {
    protocol: PROTOCOL,
    candidateId: digest({ protocol: PROTOCOL, charterHash, artifactFiles, evidenceFiles }),
    charterFile: relative(base, resolve(charterFile)).replaceAll('\\', '/'), charterHash,
    artifactRoot: relative(base, resolve(artifactRoot)).replaceAll('\\', '/'), artifactFiles,
    evidenceRoot: relative(base, resolve(evidenceRoot)).replaceAll('\\', '/'), evidenceFiles,
    budget: { maxRounds: null, maxMinutes: null, maxCost: null },
    participants: { orchestrator: '', builders: [] },
    status: 'reviewing', batches: [],
  };
  await writeJson(output, record);
  return record;
}

export async function makePair(referenceFile, candidateFile, output) {
  const inputs = await Promise.all([referenceFile, candidateFile].map((p) => readFile(p)));
  const [a, b] = inputs.map((bytes) => PNG.sync.read(bytes));
  requireThat(a.width === b.width && a.height === b.height, '盲比必须使用同尺寸的已对齐 PNG，不自动缩放');
  requireThat(a.width * a.height <= 16_000_000, '单侧图像过大，请按宪章分为可观察面板');
  const swap = randomInt(2) === 1;
  const sides = swap ? [b, a] : [a, b];
  const sheet = new PNG({ width: a.width * 2, height: a.height });
  for (let y = 0; y < a.height; y++) {
    for (let side = 0; side < 2; side++) {
      sides[side].data.copy(sheet.data, (y * sheet.width + side * a.width) * 4,
        y * a.width * 4, (y + 1) * a.width * 4);
    }
  }
  const png = PNG.sync.write(sheet);
  const packet = { packetId: randomUUID(), image: 'comparison.png', sha256: sha256(png) };
  await mkdir(output); // 拒绝覆盖旧批次。
  await mkdir(join(output, 'blind'));
  await mkdir(join(output, 'private'));
  await writeFile(join(output, 'blind/comparison.png'), png, { flag: 'wx' });
  await writeJson(join(output, 'blind/packet.json'), packet);
  await writeJson(join(output, 'private/mapping.json'), {
    ...packet, referenceSide: swap ? 'B' : 'A',
    referenceHash: sha256(inputs[0]), candidateHash: sha256(inputs[1]),
  });
  return packet;
}

async function inspectPair(root) {
  await fileHashes(join(root, 'private'));
  const packet = await readJson(join(root, 'blind/packet.json'));
  const mapping = await readJson(join(root, 'private/mapping.json'));
  requireThat(nonempty(packet.packetId) && packet.image === 'comparison.png', '盲比封套无效');
  const files = await fileHashes(join(root, 'blind'));
  requireThat(stable(Object.keys(files).sort()) === stable(['comparison.png', 'packet.json']), '盲比材料多出或缺失');
  requireThat(packet.sha256 === files['comparison.png'] && packet.packetId === mapping.packetId &&
    packet.sha256 === mapping.sha256 && ['A', 'B'].includes(mapping.referenceSide), '盲比图或映射已改变');
  PNG.sync.read(await readFile(join(root, 'blind/comparison.png')));
  return { packet, mapping };
}

function validateBlindReport(report, packet) {
  requireThat(report.packetId === packet.packetId && nonempty(report.contextId), '盲比报告身份不符');
  requireThat(['A', 'B', 'tie'].includes(report.preference) && nonempty(report.reason) &&
    Array.isArray(report.differences) && report.differences.length > 0 && report.differences.every(nonempty), '盲比缺少偏好、理由或可复核差异');
  requireThat(object(report.impressions) && nonempty(report.impressions.A) && nonempty(report.impressions.B), '盲比缺少两侧整体印象');
  requireThat(['A_HIGHER_TIER', 'B_HIGHER_TIER', 'SAME_TIER', 'UNCERTAIN'].includes(report.comparativeQuality) &&
    nonempty(report.qualityRationale), '盲比缺少独立于偏好的质量等级判断');
  if (report.sourceGuess !== undefined || report.confidence !== undefined) {
    requireThat(['A', 'B', 'unknown'].includes(report.sourceGuess) && Number.isFinite(report.confidence) &&
      report.confidence >= 0 && report.confidence <= 1, '可选来源判断格式无效');
  }
}

export async function seal(root, reportFile) {
  const { packet, mapping } = await inspectPair(root);
  const bytes = await readFile(reportFile);
  validateBlindReport(JSON.parse(bytes), packet);
  await writeFile(join(root, 'private/phase1.json'), bytes, { flag: 'wx' });
  const receipt = { packetId: packet.packetId, reportHash: sha256(bytes), mappingHash: digest(mapping) };
  await writeJson(join(root, 'private/seal.json'), receipt);
  return receipt;
}

async function sealedPair(root) {
  const { packet, mapping } = await inspectPair(root);
  const receipt = await readJson(join(root, 'private/seal.json'));
  const bytes = await readFile(join(root, 'private/phase1.json'));
  const report = JSON.parse(bytes);
  validateBlindReport(report, packet);
  requireThat(receipt.packetId === packet.packetId && receipt.reportHash === sha256(bytes) &&
    receipt.mappingHash === digest(mapping), '盲比封存后被改动');
  return { packet, mapping, receipt, report };
}

export async function reveal(root) {
  const { mapping, receipt } = await sealedPair(root);
  const disclosure = { ...mapping, phase1Hash: receipt.reportHash };
  await writeJson(join(root, 'private/disclosure.json'), disclosure);
  return disclosure;
}

function evidenceRefs(refs, candidateFiles, reviewFiles = {}) {
  requireThat(Array.isArray(refs) && refs.length > 0, '缺少证据引用');
  for (const ref of refs) {
    requireThat(typeof ref === 'string', '证据引用必须是字符串');
    const [scope, path, ...extra] = ref.split(':');
    const files = scope === 'candidate' ? candidateFiles : scope === 'review' ? reviewFiles : {};
    requireThat(extra.length === 0 && Object.hasOwn(files, path), `证据不存在：${ref}`);
    localPath('.', path);
  }
}

function includesEvidence(refs, required, label) {
  requireThat(required.every((ref) => refs.includes(ref)), `${label}遗漏指定证据`);
}

function visualReport(report, charter, candidateFiles, reviewFiles) {
  const policy = charter.visualPolicy;
  const holistic = report.holistic;
  requireThat(object(holistic) && holistic.aestheticVerdict === 'WOW' &&
    ['ON_PAR', 'ABOVE'].includes(holistic.qualityRelation) && nonempty(holistic.rationale), '整体美学或整体质量同级未通过');
  evidenceRefs(holistic.evidence, candidateFiles, reviewFiles);
  includesEvidence(holistic.evidence, [...policy.referenceProfile.evidence.map((path) => `candidate:${path}`),
    ...charter.comparisons.flatMap((c) => [`candidate:${c.reference}`, `candidate:${c.candidate}`]),
    ...policy.scopes.flatMap((s) => s.views.filter((v) => v.kind === 'display').map((v) => `candidate:${v.path}`))], '整体评价');
  requireThat(nonempty(report.blindReconciliation), '缺少与封存盲比的结论核对说明');
  namedList(report.coverage, '视觉覆盖记录');
  requireThat(report.coverage.length === policy.scopes.length, '视觉覆盖范围数量不符');
  for (const scope of policy.scopes) {
    const result = report.coverage.find((v) => v.id === scope.id);
    requireThat(result?.status === 'REVIEWED' && nonempty(result.rationale), `范围尚未完整评审：${scope.id}`);
    evidenceRefs(result.evidence, candidateFiles, reviewFiles);
    includesEvidence(result.evidence, scope.views.map((v) => `candidate:${v.path}`), `范围 ${scope.id}`);
  }
  namedList(report.constraints, '设计约束核查', true);
  requireThat(report.constraints.length === policy.designConstraints.length, '设计约束核查数量不符');
  for (const constraint of policy.designConstraints) {
    const result = report.constraints.find((v) => v.id === constraint.id);
    requireThat(result?.status === 'PASS' && nonempty(result.rationale), `设计约束未通过：${constraint.id}`);
    evidenceRefs(result.evidence, candidateFiles, reviewFiles);
    for (const id of constraint.scopeIds) {
      const scope = policy.scopes.find((s) => s.id === id);
      requireThat(scope.views.some((v) => result.evidence.includes(`candidate:${v.path}`)), `设计约束未覆盖范围：${id}`);
    }
  }
}

function visualPillar(result, pillar, charter) {
  requireThat(nonempty(result.rationale), `视觉支柱缺少判断依据：${pillar.id}`);
  requireThat(result.score === undefined || (Number.isFinite(result.score) && result.score >= 0 && result.score <= 10), '视觉诊断分数必须为 0–10，不作为通过门槛');
  if (pillar.basis === 'reference') {
    requireThat(['ON_PAR', 'ABOVE'].includes(result.qualityRelation) && result.status === undefined, `视觉支柱未达到同级：${pillar.id}`);
    includesEvidence(result.evidence, pillar.comparisonIds.flatMap((id) => {
      const pair = charter.comparisons.find((c) => c.id === id);
      return [`candidate:${pair.reference}`, `candidate:${pair.candidate}`];
    }), `参考支柱 ${pillar.id}`);
  } else requireThat(result.status === 'PASS' && result.qualityRelation === undefined, `独立视觉要求未通过或被伪装为参考比较：${pillar.id}`);
  const scope = charter.visualPolicy.scopes.find((s) => s.id === pillar.scopeId);
  includesEvidence(result.evidence, scope.views.filter((v) => v.kind === DIMENSION_VIEW[pillar.dimension])
    .map((v) => `candidate:${v.path}`), `视觉支柱 ${pillar.id}`);
}

export async function check(recordFile) {
  const record = await readJson(recordFile);
  const base = dirname(resolve(recordFile));
  const path = (p) => { requireThat(nonempty(p), '缺少材料路径'); return resolve(base, p); };
  requireThat(record.protocol === PROTOCOL, protocolError);
  requireThat(['reviewing', 'completed'].includes(record.status), '运行已停止');
  const charterFile = path(record.charterFile);
  requireThat(sha256(await readFile(charterFile)) === record.charterHash, '宪章已改变');
  const charter = await readJson(charterFile);
  validateCharter(charter);
  for (const kind of ['artifact', 'evidence']) {
    requireThat(stable(await fileHashes(path(record[`${kind}Root`]))) === stable(record[`${kind}Files`]), `${kind} 冻结材料已改变`);
  }
  charterEvidence(charter, record.evidenceFiles);
  requireThat(record.candidateId === digest({ protocol: PROTOCOL, charterHash: record.charterHash,
    artifactFiles: record.artifactFiles, evidenceFiles: record.evidenceFiles }), '候选身份不符');
  const p = record.participants;
  requireThat(p && nonempty(p.orchestrator) && Array.isArray(p.builders) && p.builders.length > 0 &&
    p.builders.every(nonempty) && unique([p.orchestrator, ...p.builders]), '总控和 builder 身份缺失或未分权');
  const contexts = new Set([p.orchestrator, ...p.builders]);
  const gates = await readJson(localPath(path(record.evidenceRoot), 'gates.json'));
  requireThat(Array.isArray(gates.checks) && unique(gates.checks.map((g) => g.id)), '硬门禁结果缺失或重复');
  for (const id of charter.requiredGates) {
    const gate = gates.checks.find((g) => g.id === id);
    requireThat(gate?.status === 'pass', `硬门禁未通过：${id}`);
    evidenceRefs(gate.evidence, record.evidenceFiles);
  }
  requireThat(Array.isArray(record.batches) && record.batches.length >= 2 &&
    record.batches.every((b) => nonempty(b.reviewId)) && unique(record.batches.map((b) => b.reviewId)), '需要两个不同的完整批次');
  for (const old of record.batches.slice(0, -2)) {
    requireThat(Array.isArray(old.reports), '历史批次缺少报告');
    for (const report of old.reports) contexts.add(report.contextId);
  }
  // 只接受最近连续两批；不能从一批失败之后挑出较早的 WOW 拼接。
  for (const batch of record.batches.slice(-2)) {
    requireThat(batch.kind === 'formal' && batch.candidateId === record.candidateId, '评审批次或候选不符');
    requireThat(stable(await fileHashes(path(batch.evidenceRoot))) === stable(batch.evidenceFiles), '批次证据已改变');
    requireThat(batch.isolation?.status === 'recorded' && ['instruction', 'enforced'].includes(batch.isolation.mode),
      '正式评审缺少材料约束记录或已经污染');
    evidenceRefs(batch.isolation.evidence, record.evidenceFiles, batch.evidenceFiles);
    requireThat(Array.isArray(batch.reports) && batch.reports.length === charter.requiredCritics.length &&
      unique(batch.reports.map((r) => r.criticId)), '缺少或重复 critic 裁决');
    for (const role of charter.requiredCritics) {
      const r = batch.reports.find((v) => v.criticId === role);
      requireThat(r?.reviewId === batch.reviewId && r.candidateId === record.candidateId, '裁决身份或批次不符');
      requireThat(nonempty(r.contextId) && !contexts.has(r.contextId), 'critic 必须使用未参与制作或其他批次的独立上下文');
      contexts.add(r.contextId);
      requireThat(r.verdict === 'WOW', `critic 尚未 WOW：${role}`);
      if (role === 'visual') visualReport(r, charter, record.evidenceFiles, batch.evidenceFiles);
      const pillars = charter.pillars.filter((v) => v.critic === role);
      requireThat(Array.isArray(r.pillars) && r.pillars.length === pillars.length &&
        unique(r.pillars.map((v) => v.id)), '支柱评审缺失或重复');
      for (const pillar of pillars) {
        const score = r.pillars.find((v) => v.id === pillar.id);
        requireThat(score, `支柱缺失：${pillar.id}`);
        evidenceRefs(score.evidence, record.evidenceFiles, batch.evidenceFiles);
        if (role === 'visual') visualPillar(score, pillar, charter);
        else requireThat(Number.isFinite(score.score) && score.score >= pillar.minimum && score.score <= 10,
          `支柱未达标：${pillar.id}`);
      }
      requireThat(Array.isArray(r.defects), '缺少缺陷清单');
      for (const d of r.defects) {
        requireThat(d.severity === 'MINOR', '仍有重大或无效缺陷');
        requireThat(['id', 'criterion', 'expected', 'actual', 'recheck', 'nonBlockingReason'].every((key) => nonempty(d[key])), '缺陷记录不完整或未说明为何不影响准出');
        evidenceRefs(d.evidence, record.evidenceFiles, batch.evidenceFiles);
      }
      if (role === 'visual') {
        requireThat(Array.isArray(batch.blind) && batch.blind.length === charter.comparisons.length &&
          unique(batch.blind.map((v) => v.id)), '缺少或重复盲比封存');
        for (const pair of batch.blind) {
          const planned = charter.comparisons.find((v) => v.id === pair.id);
          requireThat(planned && pair.reference === planned.reference && pair.candidate === planned.candidate, '盲比未覆盖固定对照组');
          const pairRoot = path(pair.directory);
          const { mapping, receipt, report } = await sealedPair(pairRoot);
          const disclosure = await readJson(join(pairRoot, 'private/disclosure.json'));
          requireThat(stable(disclosure) === stable({ ...mapping, phase1Hash: receipt.reportHash }), '揭盲记录不符');
          requireThat(report.contextId === r.contextId && receipt.reportHash === pair.phase1Hash, '盲比上下文或封存哈希不符');
          requireThat(Object.hasOwn(record.evidenceFiles, pair.reference) && Object.hasOwn(record.evidenceFiles, pair.candidate) &&
            mapping.referenceHash === record.evidenceFiles[pair.reference] && mapping.candidateHash === record.evidenceFiles[pair.candidate], '盲比不属于当前候选证据');
        }
      }
    }
  }
  return { protocol: PROTOCOL, status: 'RECORDS_VALID', candidateId: record.candidateId,
    reviewIds: record.batches.slice(-2).map((b) => b.reviewId),
    limitation: '仅验证文件与裁决记录一致；不证明审美、证据真实性、隔离权限或实际执行。' };
}

const HELP = `${PROTOCOL} 辅助工具（不是代理调度器）
  snapshot <artifact-dir> <evidence-dir> <charter.json> <new-record.json>
  pair <reference.png> <candidate.png> <new-pair-dir>
  seal <pair-dir> <phase1-report.json>
  reveal <pair-dir>
  check <record.json>
pair 只拼接同尺寸 PNG，不裁切、不缩放、不美化；private 目录不提供访问控制。
旧 pga-loop/1 仅用 tools/legacy/asset-loop-v1.mjs check 验证，不继承旧 WOW。`;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2);
    const commands = { snapshot: [snapshot, 4], pair: [makePair, 3], seal: [seal, 2], reveal: [reveal, 1], check: [check, 1] };
    if (!command || command === '--help') console.log(HELP);
    else {
      requireThat(commands[command] && args.length === commands[command][1], HELP);
      console.log(JSON.stringify(await commands[command][0](...args), null, 2));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
