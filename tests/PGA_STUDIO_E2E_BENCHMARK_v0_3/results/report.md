# PGA_STUDIO_E2E_BENCHMARK_v0_3 正式实验报告

- Host / Model：ZCode / GLM-5.3-Flash（`modelIdentityPolicy.selected = EXACT_REQUIRED`，requestedModel == actualHostModel）
- 协议冻结：`protocol-frozen.json` SHA-256 `426880b6…c8ff5`（commit `b1ec878`）；执行冻结：`execution-freeze-manifest.json` SHA-256 `9c067004…d3549`
- 仓库状态：PR #3 已验证并 merge（merge commit `b911ffc`），master 复验 421/421、self-test 16/16、release 207 文件哈希一致；产品保持 v0.8.0 / tag commit `91aaa75`，未创建新产品 tag
- 解盲时间戳（firstFormalUnblindTimestamp）：`2026-09-30T12:07:07.104Z`

## 1. Gate 结果（merge 与执行前置）

| Gate | 结果 |
|---|---|
| PR #3 独立机械验证（self-test 16/16、全仓 421/421、release 207、git diff --check） | PASS |
| Hold-out 泄漏复核（leakage/self-test + H/K/M/S prompt 逐项人工复核） | PASS |
| A arm 公平性（frozen/A 无 studio/safe-domain/relation/semantic；provenance 逐文件对照 `v0.8.0^{commit}`） | PASS（124 文件零失败） |
| D14 frozen payload（聚合 `b91c0352…` 独立重算） | PASS |
| A toolkit（聚合 `3b2d5903…` 独立重算）与 shared observation（`d29c28f9…`） | PASS |
| Candidate accounting 9-candidate 负控制（第 10 个唯一状态保留且 budget FAIL；同状态复看不计；隐藏层序变化计新） | PASS |
| Reviewer pre-submit gate 负控制（非法 enum/malformed actualViews/非法 confidence/task 绑定不匹配→纯 schemaErrors；合法冻结唯一；覆盖拒绝；attempt 留痕） | PASS |
| Symbolic identity lint 负控制（5 个位置身份表达全部 FAIL；5 个符号/几何表达 PASS） | PASS |
| Payload-before-agent 负控制（toolkit/task/observation/startSource/stagedTree 五类篡改全部在 createEmptyParticipant 前 LAUNCH_BLOCKED；正序列 PASS 且 exposeTask） | PASS |
| Model identity control（EXACT_REQUIRED + freezeModelIdentity，宿主证据=ZCode 系统上下文模型声明，attestationId `zcode-system-context:glm-5.3-flash:2026-09-30`） | PASS |
| Vision Gate（本 benchmark 自带 vision_A/B；全新 GLM-5.3-Flash context 逐张 Read；Object A=帆船、Object B=绿色圆环+深棕柄，形状/颜色/结构匹配；SAW_PIXEL_CONTENT=true） | CONFIRMED |
| Agent isolation（24+24+2 个 spawn 的 agentId 全局唯一；nonce 测试：全新 context 无法获知先前 nonce；共享文件系统记为 limitation） | PASS |
| Materials 重生成比对（新空目录 `--out` 重生成，全部哈希一致） | PASS |

## 2. 执行规模与完整性

- 24 participant runs（4 tasks × 2 arms × 3 repeats）全部以全新 GLM-5.3-Flash context 执行；每个 slot 走 prepare → verify → create empty context → recheck → expose 时序；submit 成功率 24/24；budget 全 PASS（无超 8）；candidate 总数 91（A 臂 18、D14 臂 73）。
- 24 reviewer runs（12 pairs × 2 slots，MIRRORED_BALANCE）全部 SUBMITTED，`reviewValidationAttempts` 全部为 1（0 次 SCHEMA_RETRY）。
- 统一 evaluate：deterministic 双冷渲染、submittedArtifact、sourceFrozen、candidate ledger 对账、宿主 protocol 审计（未入账图像对账，staging 载荷按 binding.stage 白名单）全部通过。

## 3. Primary 结果

### P1 strictTaskSuccess

- **A：10 / 12**（H 3/3、K 3/3、M 2/3、S 2/3）
- **D14：6 / 12**（H 2/3、K 0/3、M 2/3、S 2/3）

逐 pair：H-r1 A PASS / D14 TECHNICAL_FAIL；H-r2、H-r3 双 PASS；K-r1/r2/r3 A PASS / D14 VISUAL_NOT_YET；M-r1 A PASS / D14 VISUAL_DISAGREEMENT；M-r2 双 PASS；M-r3 A TECHNICAL_FAIL / D14 PASS；S-r1 双 PASS；S-r2 双 VISUAL_DISAGREEMENT；S-r3 双 VISUAL_DISAGREEMENT（preference MIXED）。

### P2 technicalFailureIncidence

2 / 24 runs：`H-D14-r1`（silhouette 差分 618 > 上限 560，submit 后才发现）与 `M-A-r3`（protection 违规 8 像素，P1/P2 保护锚点区被重着色）。两臂各 1 次；无 tool-blocked completion、无 submit failure。

### P3 pairedVisualPreference（12 pairs）

CONSENSUS_A **9**、CONSENSUS_D14 **0**、MIXED **3**（M-r1、S-r2、S-r3）、NO_MEANINGFUL_DIFFERENCE 0、BOTH_NOT_YET 0、UNVERIFIED 0。48 个 candidate-level taskFit 判定与 24 份 raw review 全部保留（reviews/ 目录）。

## 4. Secondary

| 指标 | A 臂（12 runs） | D14 臂（12 runs） | 口径 |
|---|---|---|---|
| candidateCount | 18 总 / 均值 1.5（1–2） | 73 总 / 均值 6.1（5–8） | 跨臂可比 |
| submitSuccess | 12/12 | 12/12 | 跨臂可比 |
| retries/errors（runner 事件） | 0 | 2（1 次参数形式错误、1 次探测错误） | DIAGNOSTIC |
| validationProbeCount | 0 | 110 | **DIAGNOSTIC_ONLY**，不用于效率结论 |
| observableRelationDiagnosticCount | 0 | 12 | 只计可观察诊断产物 |
| semanticTransformCount / relationAwareTransformCount | 0 | 1 / 1 | 由冻结候选记录提取 |
| rejectedOperationCount | 0 | 1（物化前安全域拒绝） | 可观察拒绝请求 |
| lowLevelEditCount / manualCoordinateRepairCount | — | — | **NOT_COMPARABLE**（按冻结协议保持） |
| wallClock / CPU / compile | — | — | null，仅 exploratory |

## 5. 预注册统计

- Paired 2×2 success matrix：bothPass 5、AOnly 5、D14Only 1、neitherPass 1；UNVERIFIED 0（单列数量为 0）
- Two-sided exact McNemar：p = 0.21875（DESCRIPTIVE_ONLY；无 unresolved）
- Consensus-only two-sided exact sign/binomial：n = 9（9:0），p = 0.00390625；明确排除 MIXED/NMD/BOTH_NOT_YET/UNVERIFIED
- Task-level breakdown 已在 analysis.json（12 pairs 嵌套于 4 tasks；4 tasks 为主要泛化单位）

## 6. 最终 Decision（两层，无总分）

### Engineering decision：**DOES_NOT_SUPPORT**

依据：Studio v1.4 的技术可靠性不高于直接代码（两臂各 1 次技术失败、提交成功率相同 100%）；strict taskSuccess 更低（6/12 vs 10/12，方向为负）；唯一跨臂可比的负担指标 candidateCount 显著更高（均值 6.1 vs 1.5，Studio 的 edit/explore 每次物化即计账）。`lowLevelEditCount` 等按冻结保持 NOT_COMPARABLE，不在此宣称低层负担改善。

### Visual/product hypothesis：**DOES_NOT_SUPPORT**

依据：strict taskSuccess 方向一致偏 A；9 个共识偏好全部为 CONSENSUS_A（p≈0.004），0 个 D14 共识；任务级存在系统性回归——K 任务（结构重组+功能可读）D14 三次重复全部 VISUAL_NOT_YET（reviewer 一致反馈：鼓轮缠绕/导出/握持的功能语义未建立）；无任何 task 出现支持 D14 的方向。M/S 持平，H 因 D14 一次技术超差落后一次。

## 7. 允许的最强结论

在 4 个新开放 hold-out tasks（H/K/M/S）、GLM-5.3-Flash、ZCode、candidate budget 8、当前冻结的 A/D14 能力组合下，Studio v1.4 相对 direct code 的效果如上。不外推到其他 agent、其他 2D 资产、商业级质量或普遍统计结论。小样本、同任务重复相关、p 值不满足显著性不等价于无差异。

## 8. Protocol deviations / interventions

1. **H-A-r2**：expose 与 register/recheck 的会话调用顺序存在毫秒级倒置（recheck PASS 后任务才实际开始执行），无实质影响；已记录。
2. **K-D14-r2**：coordinator 漏执行 prep 即 register/expose-record；recheck 正确 LAUNCH_BLOCKED（binding 缺失），SendMessage 未发出、任务未暴露；补 prep+recheck PASS 后才 expose；host-state 更正并追加 correction 事件。
3. **H-D14-r3 漏 launch**：第二批 prep 后被跳过，其余 23 runs 完成后发现并补 launch（staging 重新 verify PASS 后按完整时序 expose）。
4. **coordinator/evaluate 脚本路径 bug**（trial vs staged）在执行中修复；evaluate 重跑仅影响评估读取路径，run 数据未变。
5. **protocolAudit 规则演进**：初版把 D14 staging 期 `studio create` 写入的起点预览（`ws/e2e-*-v03.*.png`）误判为未入账图像；经内容对账（与 baseline renderHash 一致）与 binding.stage.files 佐证（staging 载荷、每次 launch 哈希校验）后，最终规则以 binding.stage 为白名单。重跑不改变 technical/budget 结果。
6. **Vision Gate 首跑作废**：首个 vision 子代理内容描述全部正确但 A/B 标签互换；作废并以逐张顺序读取版重验 CONFIRMED。
7. **S-r2 reviewer 误报**：slot1 报告 contact-sheet tile 标签疑似互换；机械复核（以相同输入重建 sheet，与盘上文件逐字节一致；X.png/Y.png 与 key 及各 arm final 渲染哈希一致）证明包无缺陷，属低分辨率 tile 目测误差。该 pair 本为 MIXED，判定不受影响。
8. reviewer M-r1 slot1 未查看 contact-sheet（actualViews 3 项）——prompt 允许，X/Y/baseline 图像证据齐备，deriveReview 通过。

## 9. 归档索引

- 冻结：`results/protocol-frozen.json`、`results/freeze-manifest.json`、`results/execution-freeze-manifest.json`
- 评估：`results/evaluate/<runId>.json`（24）、`results/evaluate/summary.json`
- 解盲与分析：`results/analysis.json`、`results/summary.csv`
- 盲评 key（协调器私有）：`results/private/blind-keys/`（12 key + 12 packages）
- 原始 runs（不入库）：`runs/<runId>/`；原始盲评包（不入库）：`reviews/<pair>/`
- 协调器脚本与宿主事件：`results/coordinator/`（coordinator.mjs、evaluate-all.mjs、build-blind-pairs.mjs、analyze.mjs、execution-freeze.mjs、host-events.jsonl、host-state.json）
