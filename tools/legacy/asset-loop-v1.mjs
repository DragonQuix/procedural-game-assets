#!/usr/bin/env node
// 保留 c759984 的 v1 校验语义；只读历史记录，不创建候选或迁移裁决。
import { lstat, readFile, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { sha256 } from '../release-manifest.mjs';

export const PROTOCOL = 'pga-loop/1';
const requireThat = (ok, message) => { if (!ok) throw new Error(message); };
const nonempty = (x) => typeof x === 'string' && x.trim().length > 0;
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const stable = (value) => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]])) : v);
const digest = (value) => sha256(Buffer.from(stable(value)));
const unique = (values) => new Set(values).size === values.length;

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
  requireThat(charter.protocol === PROTOCOL, '宪章协议不兼容');
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
  requireThat(Array.isArray(charter.comparisons) && charter.comparisons.length > 0 &&
    unique(charter.comparisons.map((c) => c.id)), '缺少或重复固定对照组');
  for (const comparison of charter.comparisons) {
    requireThat(nonempty(comparison.id), '对照组缺少编号');
    localPath('.', comparison.reference);
    localPath('.', comparison.candidate);
    requireThat(comparison.reference !== comparison.candidate, '两侧不得引用同一文件');
  }
  requireThat(stable(charter.requiredCritics) === stable(['visual', 'delivery']), '首版固定为 visual 与 delivery 两个独立席位');
  requireThat(Array.isArray(charter.requiredGates) && charter.requiredGates.length > 0 &&
    charter.requiredGates.every(nonempty) && unique(charter.requiredGates), '硬门禁名单缺失或重复');
  requireThat(Array.isArray(charter.pillars) && charter.pillars.length >= 2 &&
    unique(charter.pillars.map((p) => p.id)), '支柱缺失或重复');
  for (const p of charter.pillars) {
    requireThat(nonempty(p.id) && nonempty(p.criterion) && charter.requiredCritics.includes(p.critic) &&
      Number.isFinite(p.minimum) && p.minimum >= 0 && p.minimum <= 10, '支柱合同无效');
  }
  for (const role of charter.requiredCritics) requireThat(charter.pillars.some((p) => p.critic === role), `席位没有支柱：${role}`);
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
  requireThat(['A', 'B', 'unknown'].includes(report.sourceGuess) && Number.isFinite(report.confidence) &&
    report.confidence >= 0 && report.confidence <= 1, '来源判断格式无效');
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

export async function check(recordFile) {
  const record = await readJson(recordFile);
  const base = dirname(resolve(recordFile));
  const path = (p) => { requireThat(nonempty(p), '缺少材料路径'); return resolve(base, p); };
  requireThat(record.protocol === PROTOCOL && ['reviewing', 'completed'].includes(record.status), '协议不符或运行已停止');
  const charterFile = path(record.charterFile);
  requireThat(sha256(await readFile(charterFile)) === record.charterHash, '宪章已改变');
  const charter = await readJson(charterFile);
  validateCharter(charter);
  for (const kind of ['artifact', 'evidence']) {
    requireThat(stable(await fileHashes(path(record[`${kind}Root`]))) === stable(record[`${kind}Files`]), `${kind} 冻结材料已改变`);
  }
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
      const pillars = charter.pillars.filter((v) => v.critic === role);
      requireThat(Array.isArray(r.pillars) && r.pillars.length === pillars.length &&
        unique(r.pillars.map((v) => v.id)), '支柱评审缺失或重复');
      for (const pillar of pillars) {
        const score = r.pillars.find((v) => v.id === pillar.id);
        requireThat(score && Number.isFinite(score.score) && score.score >= pillar.minimum && score.score <= 10,
          `支柱未达标：${pillar.id}`);
        evidenceRefs(score.evidence, record.evidenceFiles, batch.evidenceFiles);
      }
      requireThat(Array.isArray(r.defects), '缺少缺陷清单');
      for (const d of r.defects) {
        requireThat(d.severity === 'MINOR', '仍有重大或无效缺陷');
        requireThat(['id', 'criterion', 'expected', 'actual', 'recheck'].every((key) => nonempty(d[key])), '缺陷记录不完整');
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
    limitation: '仅按 pga-loop/1 验证历史文件与记录，不代表满足 pga-loop/2；不证明审美、证据真实性、隔离权限或实际执行。' };
}

const HELP = `pga-loop/1 历史记录只读验证器
  check <record.json>
沿用旧标准，不证明满足 pga-loop/2；不创建、修改或迁移旧记录。`;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2);
    if (!command || command === '--help') console.log(HELP);
    else {
      requireThat(command === 'check' && args.length === 1, HELP);
      console.log(JSON.stringify(await check(args[0]), null, 2));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
