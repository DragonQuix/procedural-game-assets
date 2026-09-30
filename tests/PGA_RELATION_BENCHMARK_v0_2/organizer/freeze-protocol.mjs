#!/usr/bin/env node
/**
 * PGA_RELATION_BENCHMARK_v0_2 协议冻结（协调器专用；运行前一次性执行）。
 * 生成 protocol-frozen.json + freeze-manifest.json，翻转 preparation-manifest 为 FROZEN。
 * 冻结后第一个 participant 看到正式任务起禁止修改。
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { hashTree, treeHash, sha256 } from '../../../tools/benchmark/payload-gate.mjs';

const bench = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(bench, '../..');
const git = (...a) => execFileSync('git', a, { cwd: root });
const sha = (s) => createHash('sha256').update(s).digest('hex');
const readJson = async (p) => JSON.parse(await readFile(join(bench, p), 'utf8'));

const manifest = await readJson('preparation-manifest.json');
if (manifest.status !== 'DRAFT_NOT_RUN' || manifest.approvedToExecute !== false) throw new Error('协议冻结只允许从 DRAFT_NOT_RUN 进入');
if (manifest.toolkits.D14.status !== 'FROZEN_FINAL') throw new Error('D14 必须先完成 FINAL 快照冻结');
if (manifest.toolkits.D13.status !== 'FROZEN_RELEASE') throw new Error('D13 必须是 FROZEN_RELEASE');

// ---- 冻结输入哈希 ----
const d13 = manifest.toolkits.D13, d14 = manifest.toolkits.D14;
const obs = manifest.sharedObservation.sha256;
const taskHashes = Object.fromEntries(Object.entries(manifest.tasks).map(([t, v]) => [t, { common: v.common.sha256, documents: Object.fromEntries(Object.entries(v.documents).map(([a, d]) => [d.sha256])) }]));
const vision = manifest.visionGate.sha256;
const protocolDraftSha = sha256(await readFile(join(bench, 'protocol-draft.json')));

// ---- 映射种子与 run 顺序（确定性派生，冻结后不可改） ----
const mappingSeed = sha(['PGA_RELATION_BENCHMARK_v0_2/mapping/v1', d13.sha256, d14.sha256, obs, vision, taskHashes.C.common, taskHashes.R.common].join('|'));
const runIds = [];
for (const task of ['C', 'R']) for (const arm of ['D13', 'D14']) for (const rep of [1, 2, 3]) runIds.push(`${task}-${arm}-r${rep}`);
const runOrder = runIds.map((id) => ({ id, key: sha(`${mappingSeed}|run|${id}`) })).sort((a, b) => a.key < b.key ? -1 : 1).map((e) => e.id);

// ---- 盲评 pair 与 X/Y→arm 映射（每任务平衡 3/3；两 reviewer 同映射，展示顺序镜像） ----
const pairs = {};
for (const task of ['C', 'R']) {
  const reps = [1, 2, 3].map((n) => ({ n, key: sha(`${mappingSeed}|pair|${task}-r${n}`) })).sort((a, b) => a.key < b.key ? -1 : 1);
  // 每任务内 2/1，两任务起始相反 → 全局精确 3/3（X=D13 与 X=D14 各 3 对）
  const startWithD13X = (task === 'C') === (parseInt(sha(`${mappingSeed}|start|C`)[0], 16) % 2 === 0);
  reps.forEach(({ n }, i) => {
    const xIsD13 = startWithD13X ? i % 2 === 0 : i % 2 === 1;
    pairs[`${task}-r${n}`] = { task, repeat: n, X: xIsD13 ? 'D13' : 'D14', Y: xIsD13 ? 'D14' : 'D13', runA: `${task}-D${xIsD13 ? 13 : 14}-r${n}`, runB: `${task}-D${xIsD13 ? 14 : 13}-r${n}` };
  });
}

// ---- 冻结的计数口径与视觉规则（运行前文本化，不得按结果改） ----
const countingSchema = {
  source: 'organizer/classify-events.mjs（已验证：demo 台账 + 构造台账）',
  armNeutral: '两臂同一分类器，只消费 ws/ 台账；不由 participant 自报',
  manualCoordinateRepair: 'geometry.set 物化候选中：absolutePair（x+w 或 y+h 同设）计 1；coordOnly（x/y 无 w/h）且目标 centerX 与 bottomY 均等于 baseRevision 文档值计 1；语义变换与单尺寸字段不计',
  semanticTransform: '物化候选 operation.id ∈ {widen_about_center, squash_keep_base, resize_about_anchor}',
  relationAwareTransform: '物化候选 preserveRelations === true 或非空 ID 数组',
  relationRepairCount: 'Σ 候选 checks.relationRepairs.length',
  candidateCount: '唯一物化候选数（预算 6）',
  validationProbeCount: 'Σ 候选 validationProbeCount + Σ 被拒请求 safeDomain.validation.tested ?? safeDomain.search.tested',
  relationEvaluationProbeCount: '试次目录中可观察关系诊断产物计数（下界，两臂同口径，secondary）',
  rejectedOperationCount: 'result.status ∉ {OK, UNCHANGED} 且无 revision 的请求',
  retriesErrors: 'retries = idempotentReplay===true；errors = result.error 存在或 status=ERROR',
};
const visualNonRegression = {
  verdicts: 'candidate: MEETS|NOT_YET|UNVERIFIED；pairwise: X_PREFERRED|Y_PREFERRED|NO_MEANINGFUL_DIFFERENCE|BOTH_NOT_YET|UNVERIFIED',
  pairVerdict: '双 reviewer 同偏好→CONSENSUS_D13/CONSENSUS_D14；不同→MIXED；同 NO_MEANINGFUL_DIFFERENCE→NMD；同 BOTH_NOT_YET→BOTH_NOT_YET；任一 UNVERIFIED→UNVERIFIED',
  conditionA: 'MEETS_D14 ≥ MEETS_D13；MEETS_arm = 已验证 pair 中 (reviewer, 该臂候选) MEETS 判定总数；UNVERIFIED pair 不计入任何总数并单独报告',
  conditionB: 'CONSENSUS_D13 pair 数 ≤ 1',
  conditionC: '不存在「两 reviewer 均判 D14 候选 NOT_YET 或 pairwise BOTH_NOT_YET」的 pair',
  inconclusive: '已验证 pair < 4（即 >2 个 UNVERIFIED pair）→ 视觉条件 INCONCLUSIVE',
  pass: 'A ∧ B ∧ C 全真 → PASS；任一假 → FAIL；INCONCLUSIVE 见上',
  frozenBasis: 'v0.1 visualNonRegression 规则（MEETS 不降 + 旧臂一致偏好上限 1 + 无一致 NOT_YET）的 D13/D14 对应版本；UNVERIFIED/BOTH_NOT_YET 处理为本版新增，冻结于任何正式 run 之前',
};
const unverifiedPolicy = {
  taskSuccess: '任一组成 UNVERIFIED → taskSuccess=UNVERIFIED，不计入 taskSuccess ?/6，不满足 Go 条件 3',
  reviewer: 'candidate UNVERIFIED → 该 pair 视觉判定 UNVERIFIED，不参与 MEETS 总数、偏好上限与 NOT_YET 条件',
  technical: '技术失败（launch gate 拦截、宿主故障）在 participant 未读任务前可用全新试次目录重试并记录；participant 已读任务后的一切失败记 intervention，不得静默重试',
  noExtraRuns: '不得为达成 Go 新增 runs',
};
const interventionPolicy = '启动前 gate 拦截 = 可重试 launch failure（全新试次目录）；启动后失配/故障 = intervention 记录，不追认；不修改任务；不向 participant 提供额外帮助。';
const goNoGo = {
  conditions: [
    { id: 1, name: 'D14FinalRequiredRelationViolations', rule: 'D14 六次 finalRequiredRelationViolationCount 总和 = 0' },
    { id: 2, name: 'D14FinalProtectionViolations', rule: 'D14 六次 finalProtectionViolationCount 总和 = 0（硬约束）' },
    { id: 3, name: 'D14TaskSuccessMinimum', rule: 'D14 taskSuccess ≥ 5/6' },
    { id: 4, name: 'ManualCoordinateRepair', rule: 'D14 Σ manualCoordinateRepairCount < D13 Σ' },
    { id: 5, name: 'MedianCandidateCount', rule: 'D14 median(candidateCount) ≤ D13（固定 6 次分母，不删失败）' },
    { id: 6, name: 'VisualNonRegression', rule: visualNonRegression.pass },
  ],
  overall: '任一 FAIL → NO-GO；无 FAIL 且任一 INCONCLUSIVE → INCONCLUSIVE；全部 PASS → GO',
  interpretationCondition: 'relation-aware 能力至少在正式 runs 被自行调用且产生可验证行为（可验证 relationRepair 台账记录）方可作正面解释；不得为满足本条指导 participant 使用某 API',
};

// ---- 正式模型与宿主（按宿主实际暴露记录，不猜测） ----
const modelHost = {
  host: 'ZCode',
  modelRequestedByTaskBook: 'GLM-5.5-Flash',
  modelAsExposedByHostSession: 'GLM-5.3-Flash (account:bigmodel-individual-coding-plan)',
  modelDiscrepancy: '任务书标称 GLM-5.5-Flash，宿主会话暴露为 GLM-5.3-Flash；按「不得猜」原则记录宿主实际暴露值，每个 agent 的自报模型字符串逐个归档，12+12 必须一致否则 MODEL_CONSISTENCY gate FAIL',
  reasoning: null, version: 'UNKNOWN',
  participants: 12, reviewers: 12, sameModelAllAgents: true,
};

const protocol = {
  schema: 'pga-relation-protocol/0.2-frozen',
  experiment: 'PGA_RELATION_BENCHMARK_v0_2',
  status: 'FROZEN', approvedToExecute: true,
  frozenAt: new Date().toISOString(),
  source: { repo: 'DragonQuix/procedural-game-assets', branch: 'master', commit: git('rev-parse', 'HEAD').toString().trim(), tag: 'v0.8.0', prMergeCommit: '91aaa757bd910255f293c57f594cac06f9f169af' },
  toolkits: { D13: { path: d13.path, sha256: d13.sha256, version: d13.version, sourceTag: 'v0.7.0', status: 'FROZEN_RELEASE' }, D14: { path: d14.path, sha256: d14.sha256, version: d14.version, sourceTag: 'v0.8.0', sourceCommit: d14.sourceCommit, status: 'FROZEN_FINAL' } },
  sharedObservationSha256: obs,
  taskHashes, visionGateSha256: vision,
  protocolDraftSha256: protocolDraftSha,
  design: { tasks: ['C', 'R'], repeatsPerTaskPerArm: 3, plannedRuns: 12, candidateBudget: 6, reviewersPerPair: 2, balance: 'MIRRORED_BALANCE', stableReviewIdentities: ['X', 'Y'], independentFiles: true },
  mappingSeed, runOrder, pairs,
  modelHost,
  primary: ['taskSuccess', 'finalRequiredRelationViolationCount', 'manualCoordinateRepairCount'],
  hardConstraints: { finalProtectionViolationCount: 0 },
  secondary: ['candidateCount', 'rejectedOperationCount', 'semanticTransformCount', 'relationAwareTransformCount', 'validationProbeCount', 'relationEvaluationProbeCount', 'relationRepairCount', 'protectionRejectionCount', 'retries', 'errors', 'reviewerPreference'],
  countingSchema, visualNonRegression, unverifiedPolicy, interventionPolicy, goNoGo,
  gates: ['REPOSITORY', 'NOT_RUN', 'GLOBAL_IDENTITY_POLICY', 'VISION', 'AGENT_ISOLATION', 'MODEL_CONSISTENCY', 'TOOLKIT_HASH', 'D14_FINAL_PROVENANCE', 'OBSERVATION_PARITY', 'RUNNER', 'PAYLOAD_BEFORE_AGENT', 'SYMBOLIC_IDENTITY_LINT', 'PRIMARY_METRIC_DEFINITION'],
  freezeOwner: 'ZCode 独立会话',
};
const protocolSha = sha256(Buffer.from(JSON.stringify(protocol, null, 2) + '\n'));

// ---- freeze-manifest：全部冻结工件的逐文件哈希 ----
const codeFiles = {};
for (const f of ['tools/benchmark/payload-gate.mjs', 'tools/benchmark/identity-lint.mjs', 'tools/benchmark/symbolic-blind.mjs', 'tests/PGA_RELATION_BENCHMARK_v0_2/organizer/evaluate.mjs', 'tests/PGA_RELATION_BENCHMARK_v0_2/organizer/classify-events.mjs', 'tests/PGA_RELATION_BENCHMARK_v0_2/organizer/setup-trial.mjs', 'tests/PGA_RELATION_BENCHMARK_v0_2/organizer/final-freeze.mjs', 'tests/PGA_RELATION_BENCHMARK_v0_2/organizer/materials.mjs', 'tests/PGA_RELATION_BENCHMARK_v0_2/prepare-materials.mjs', 'tests/PGA_RELATION_BENCHMARK_v0_2/shared/observe.mjs']) {
  codeFiles[f] = sha256(await readFile(join(root, f)));
}
const freezeManifest = {
  schema: 'pga-relation-freeze-manifest/1',
  frozenAt: protocol.frozenAt,
  protocolSha256: protocolSha,
  artifacts: { codeFiles,
    preparationManifest: { path: 'preparation-manifest.json', sha256: sha256(await readFile(join(bench, 'preparation-manifest.json'))) },
    visionEvidence: {
      vision_A_png_sha256: '520e5b2fbc79a75aa58c1aa66da1be97421ba2938a48f8a39b5b3eae8f32ed65',
      vision_B_png_sha256: '5c4af46fcaf9c6c871ea63ecf9c68ebcb7ab136c0dd7586e65bab247384ce96f',
      gate: 'PASS — 2026-09-30 ZCode 会话真实 image input；A=金钥匙（深蓝底、环形孔、轴齿），B=绿树（双层绿冠、棕干、浅米底）；与 organizer/vision-control.json 一致',
    } },
};
await writeFile(join(bench, 'protocol-frozen.json'), JSON.stringify(protocol, null, 2) + '\n');
await writeFile(join(bench, 'freeze-manifest.json'), JSON.stringify(freezeManifest, null, 2) + '\n');
manifest.status = 'FROZEN'; manifest.approvedToExecute = true; manifest.finalFreeze = 'FROZEN';
await writeFile(join(bench, 'preparation-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ protocolSha256: protocolSha, freezeManifestSha256: sha256(Buffer.from(JSON.stringify(freezeManifest, null, 2) + '\n')), mappingSeed, runOrder, pairs: Object.fromEntries(Object.entries(pairs).map(([k, v]) => [k, `${v.X}=X`])) }, null, 2));
