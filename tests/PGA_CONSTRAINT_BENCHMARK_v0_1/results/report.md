# PGA_CONSTRAINT_BENCHMARK_v0_1 正式报告

- 执行日期：2026-09-29（本地 UTC+8）
- 宿主/模型：participant 与 reviewer 均为 ZCode 上的 `GLM-5.3-Flash`（provider `account:bigmodel-individual-coding-plan`；reasoning 宿主未暴露，记 null）
- 冻结：`protocol-frozen.json` SHA-256 `4b2f45928649e0c0f7b7abcbe61aaf5b351999218a09384a4e8c75bc78ec35f0`；
  `freeze-manifest.json` SHA-256 `95aed708d95e99ac0b89567e069c3a66af5fcca28122cf8836dbe21f51b2ae39`
- 执行冻结：`execution-freeze-manifest.json` SHA-256 `02f6d183a81a67e9c986905fbc44ac0e92f8d35e24a6f5413d1c1408cdbbbe10`
- 仓库基线：master `37317b5`（tag v0.7.0）；D12=frozen/D12（source 4fd4330）；D13=frozen/D13-0.7.0-4cd1666（source 4cd1666）
- 执行偏差：INT-01（首日 6 个 D13 run 误装初期草稿载荷，作废归档于 runs-invalid，按原 runOrder 重跑；见 interventions.md 与 organizer/freeze-addendum.json）。正式数据集 = 6 个 D12 run + 6 个 D13 重跑 run，kit 绑定均逐文件核验通过。

## Gates（执行前）

REPOSITORY PASS；NOT_RUN PASS；VISION PASS（机制级 CONFIRMED：宿主 rollout 中 GLM-5.3-Flash 请求含 `type:"image"` 内容块，主会话/子代理均验证，证据见 work/vision-gate-control/vision-gate-evidence.md）；AGENT_ISOLATION PASS；MODEL_CONSISTENCY PASS；RUNNER PASS；OBSERVATION_PARITY PASS；TOOLKIT_HASH PASS（逐文件 0 失配）。

## Task success（Primary 1：提交+确定性+几何+共同保护合同+协议+预算+双 reviewer MEETS+证据非 UNVERIFIED）

- D12：5/6（T12 因视觉分歧未达）
- D13：4/6（T03、T11 因视觉分歧未达）
- 12/12 run 均提交成功、确定性渲染一致、最终保护合同 PASS、预算内、非法物化候选 0、协议 PASS。

## Paired matrix

| pair | D12 | D13 | 结果 | 视觉 |
|---|---|---|---|---|
| G-r1 | T01 | T02 | both pass | NO_MEANINGFUL_DIFFERENCE（X==Y 逐像素相同） |
| G-r2 | T06 | T05 | both pass | NO_MEANINGFUL_DIFFERENCE（相同渲染） |
| G-r3 | T09 | T10 | both pass | NO_MEANINGFUL_DIFFERENCE（相同渲染） |
| P-r1 | T04 | T03 | D12 only | CONSENSUS_D12 |
| P-r2 | T07 | T08 | both pass | NO_MEANINGFUL_DIFFERENCE（相同渲染） |
| P-r3 | T12 | T11 | neither | MIXED（R1 偏 D12，R2 偏 D13；MIXED 不仲裁） |

## Protection / invalid candidates

- 最终保护违规：D12 0，D13 0。
- 非法已物化候选：D12 0，D13 0（该 Go 项因 D12 基线为 0 判 INCONCLUSIVE）。
- 物化前被拒请求：D12 0 次，D13 1 次（T11 的 transform 字段 REJECTED_UNSAFE）。

## Effort（机械台账口径）

- 手工坐标修复：D12 9 次，D13 2 次。
- 语义变换：D12 0 次，D13 6 次（每个 D13 run 恰 1 次）。
- 候选数中位数：D12 2（[1,1,2,2,3,3]），D13 1（[1,1,1,1,2,2]）。
- 验证探针：D12 0（v1.2 无探针概念），D13 47 次（1/1/1/43/1/0，含内建点检与域诊断）。
- 提交成功：12/12。

## Visual（pga-review/3，双 reviewer，MIRRORED_BALANCE，全 12 评审 visionEvidence=CONFIRMED）

- 3 个 G 对：两臂渲染逐像素相同，两位 reviewer 均判 NO_MEANINGFUL_DIFFERENCE、双双 MEETS。
- P-r1：两渲染仅竖杆-主体交界 19 像素不同（D13 保留 1px 悬空间隙，D12 下延竖杆填补）；R1 判双 MEETS 但偏好 D12，R2 判 D13 NOT_YET → 双 reviewer 一致偏好 D12（1 对，在"最多 1 对"限额内）。
- P-r3：同交界差异反向出现（D12 下延竖杆、D13 保留间隙）；R1 判 D13 NOT_YET，R2 判 D12 NOT_YET → MIXED。
- P-r2：相同渲染，双 MEETS。
- 12 条原始 review 存档于 results/reviews/。

## Decision（冻结 protocol-frozen.go 逐项）

| 判据 | 要求 | 实际 | 判定 |
|---|---|---|---|
| D13FinalProtectionViolations | 0 | 0 | PASS |
| D13TaskSuccessMinimum | ≥5/6 | 4/6 | FAIL |
| invalidRenderedCandidateIncidence | D12≥1 且 D13 更少；D12=0 则证据不足 | 0 vs 0 | INCONCLUSIVE |
| manualCoordinateRepair | D13 总数严格 < D12 | 2 < 9 | PASS |
| medianCandidateCount | D13 ≤ D12 | 1 ≤ 2 | PASS |
| visualNonRegression | MEETS 不低于、D12 一致偏好 ≤1 对、无 D13 一致 NOT_YET | MEETS 10<11；其余两项满足 | FAIL |

**最终判定：NO-GO**（两项硬性 FAIL）。解盲时点：12 participant 冻结、12 evaluate、12 review 与隔离验证全部完成之后（analysis.json generatedAt 即 firstFormalUnblindTimestamp）。

## Interpretation（仅陈述本冻结范围支持的内容）

在两个新的 constraint-heavy hold-out 任务、GLM-5.3-Flash/ZCode、固定候选预算 6 的条件下：

1. D13（Studio v1.3, 0.7.0）把约束求解搬进工具的工程目标在机械口径上成立：6 个 run 全部使用语义变换、手工坐标修复 9→2、候选中位数 2→1、最终保护违规 0、技术成功 12/12。
2. 但预注册的视觉门槛未通过：D13 taskSuccess 4/6 < 5；视觉 MEETS 数 10 < 11。差距完全来自 P 任务竖杆-主体交界这一非强制美学处理：D13 的两个 run 保留 1px 悬空间隙，D12 的两个 run 用低级几何编辑下延竖杆填补；盲评对此出现候选级分歧（P-r1 一致偏好 D12 的填补，P-r3 MIXED），没有一个 D13 run 因技术或保护原因失败。
3. invalid-candidate 改善判据因 D12 基线为 0 而 INCONCLUSIVE，按冻结协议不换指标。
4. 以上结论限于：6 对描述性结果、单一模型/宿主、两个 hold-out 任务；不外推到所有弱 agent、所有像素资产或商业美术水平。G 任务两臂渲染逐像素相同，说明在确定性可解的任务上两套工具最终渲染无差异，差异只出现在任务未强制的连通性/美学处理上。

## Archiving

- `results/analysis.json`、`results/summary.csv`、`results/reviews/`（12 条原始 review）、`results/keys/`（6 个盲 key）随本报告入库。
- 原始参试工作区（runs/）、盲评原始包（reviews/）、无效 run（runs-invalid/）按 .gitignore 不入库。
- 干预记录：`interventions.md`；命令日志：`commands-executed.md`；harness 修复附录：`organizer/freeze-addendum.json`。
