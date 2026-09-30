# PGA_RELATION_BENCHMARK_v0_2 正式实验报告

执行：ZCode 独立会话（总协调器）。协议冻结 `a9ee2f465635702a4d0ff83cb2fbfc84cf63430ffa636030036c4127cb77b3f7`，
freeze-manifest `c50e915bd150ce80c57506776195033930196b3a7141009293c891fe4490ec86`，
执行冻结 `90d31fd8ea42ee3da5d1777ad67c58bb6e65b1bd512b00b5dce23d425f78ec75`。

## 最终判定：GO（冻结协议六项条件全部 PASS）

## Primary

| 指标 | D13 (Studio v1.3 / v0.7.0) | D14 (Studio v1.4 / v0.8.0) |
|---|---|---|
| taskSuccess | 6/6 | 6/6 |
| finalRequiredRelationViolationCount | 0 | 0 |
| manualCoordinateRepairCount（冻结口径） | 2 | 0 |

硬约束 finalProtectionViolationCount：D13 = 0，D14 = 0。

## Secondary（两臂合计，12 runs）

- candidateCount：D13 = [2,2,2,2,2,2]（中位 2）；D14 = [1,1,1,1,1,1]（中位 1）
- semanticTransformCount：两臂各 6（每 run 首个操作均为 resize_about_anchor）
- relationAwareTransformCount / relationRepairCount：D14 = 6 / 6；D13 = 0 / 0
- rejectedOperationCount：两臂均 0（无被拒请求；D13 参与者报告的安全域内部 h=28..40 拒绝发生在单个 explore 请求内部，未物化、不占预算、不构成被拒请求）
- validationProbeCount：D13 = 184，D14 = 6（机制性差异：D14 开启关系后全域枚举的 pixelWork 上界触发 SEARCH_LIMIT → POINT_FALLBACK 单点验证；D13 做全域枚举。两臂均为未物化验证，不占候选预算）
- relationEvaluationProbeCount：两臂均为 0（下界口径：试次目录无可观察关系诊断产物文件）
- retries / errors：两臂均 0（观察入口 mkdir 非递归导致的各 run 一次 ENOENT 由参与者在 guest 侧自愈，未形成请求级重试）

## 6-pair 盲评（MIRRORED_BALANCE，双 reviewer，独立 X/Y 文件）

| pair | X | Y | 判定 | 运行对 |
|---|---|---|---|---|
| C-r1 | C-D14-r1 | C-D13-r1 | NO_MEANINGFUL_DIFFERENCE | both pass |
| C-r2 | C-D14-r2 | C-D13-r2 | NO_MEANINGFUL_DIFFERENCE | both pass |
| C-r3 | C-D13-r3 | C-D14-r3 | NO_MEANINGFUL_DIFFERENCE | both pass |
| R-r1 | R-D13-r1 | R-D14-r1 | MIXED（Y_PREFERRED + NMD） | both pass |
| R-r2 | R-D14-r2 | R-D13-r2 | MIXED（Y_PREFERRED + NMD） | both pass |
| R-r3 | R-D13-r3 | R-D14-r3 | MIXED（Y_PREFERRED + NMD） | both pass |

MEETS 总数（已验证 pair，每臂每 reviewer 每候选）：D14 = 11，D13 = 11；
CONSENSUS_D13 pair = 0；D14 一致 NOT_YET = 0；UNVERIFIED pair = 0。

## Go/No-Go 逐项（冻结条件）

1. D14 final required relation violations = 0 → PASS
2. D14 final protection violations = 0（硬约束）→ PASS
3. D14 taskSuccess 6/6 ≥ 5/6 → PASS
4. D14 manualCoordinateRepair 0 < D13 2 → PASS
5. median candidateCount D14 1 ≤ D13 2 → PASS
6. visual non-regression：11 ≥ 11 ∧ 0 ≤ 1 ∧ 0 → PASS

## 关键观察（不改变判定）

- **同臂收敛**：每个 task×arm 的 3 次重复产出**字节级相同**的最终图像（各 run 内文档几何一致）。
  任务×臂共 4 种最终设计；C 任务两臂几何不同（D14 28×8 vs D13 26×10），R 任务两臂仅 Node B 柱高不同（D14 19px vs D13 11px/21px）。
- **路径差异**：D14 全部 6 run 以单候选完成（`resize_about_anchor` + `preserveRelations` 自动修复 follower）；
  D13 全部 6 run 用 2 候选（先改 Node A，再手动 `geometry.set` 修 follower）。冻结口径只把其中 2 次计为
  manualCoordinateRepair（另 4 次为单字段 y 平移、bottomY 发生变化，按 v0.1 移植规则不属"锚点保持型修复"；
  该口径在运行前冻结，对 D13 偏宽松，即对结论方向保守）。
- **C-r3 双图字节相同**：两臂独立收敛到相同几何，两位 reviewer 对同一张图分别判 MEETS（R1）与 NOT_YET（R2，
  像素计数约定误差：right-left=25 而非含端计数 26）。冻结 runVisual 规则（≥1 MEETS → PASS）吸收了该分歧；
  机械评估确认该 run 实际几何满足全部合同。
- **Reviewer 局限（12 份全部如实声明）**：task-contract.json 不在评审包内，P1/anchor 保护只能做对内一致性核验；
  机械保护核验由 coordinator evaluator 独立完成（12/12 PASS）。
- **D13 真实性**：D13 快照经逐文件验证与 v0.7.0 tag 一致（39 文件 BYTE_IDENTICAL_TO_TAG），非 v1.4 feature-off 模拟。

## 模型与宿主

24 个 agent（12 participant + 12 reviewer）自报模型一致：`account:bigmodel-individual-coding-plan/GLM-5.3-Flash`。
**任务书标称 GLM-5.5-Flash，宿主实际暴露 GLM-5.3-Flash**；按"不得猜"原则记录实际值。host = ZCode；reasoning/version = null / UNKNOWN。

## 解释边界（冻结解释条件）

relation-aware 能力在全部 6 个 D14 run 被参与者自行调用并产生可验证 relationRepair 台账记录——正面解释条件成立。
但本结论只适用于：两个 relation-heavy hold-out 任务（C、R）、GLM-5.3-Flash/ZCode、candidate budget 6 条件。
不得宣称：对所有模型成立、对所有 2D 资产成立、商业级质量、普遍统计显著（6 对样本，无显著性检验）。

## 干预记录

无 launch 失败、无重跑、无数据排除。4 次 reviewer 输出 schema 归一（均由 reviewer 本人执行，宿主未改任何判定内容）：
motion.taskFit NOT_APPLICABLE→UNVERIFIED ×1、actualViews 对象数组→字符串数组 ×3、confidence MODERATE→MEDIUM ×1。
系统性环境瑕疵：shared/observe.mjs mkdir 非递归（12 run 各遇一次，guest 侧自愈）——工具包改进建议，非本实验有效性问题。

## Gates（13/13 PASS）

REPOSITORY / NOT_RUN / GLOBAL_IDENTITY_POLICY / VISION（A=金钥匙、B=绿树，真实 image input）
/ AGENT_ISOLATION / MODEL_CONSISTENCY（24/24 一致）/ TOOLKIT_HASH（D14=b91c0352…、D13=9e67e30c…）
/ D14_FINAL_PROVENANCE（73 文件、与 candidate 逐字节一致、D13=v0.7.0 逐字节一致）/ OBSERVATION_PARITY（两臂 aaa96e83…）
/ RUNNER / PAYLOAD_BEFORE_AGENT（FROZEN 清单上 TOOLKIT_HASH_MISMATCH 拦截 + 干净放行，taskExposed=false 证据）
/ SYMBOLIC_IDENTITY_LINT（12 材料 + 双向负控制）/ PRIMARY_METRIC_DEFINITION（classify-events.mjs + 冻结口径文本）。

reviewer image-input 证据：12/12 位 actualViews 自报哈希与包内文件机械比对一致（reviewer-image-evidence.json）。
