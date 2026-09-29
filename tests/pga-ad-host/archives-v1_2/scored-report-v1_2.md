# PGA A/D Benchmark v1.2 Scored 批次·人类可读报告

生成：2026-09-29（主持人协调会话）。冻结依据：`preregistration-v1_2-frozen.json`
（SHA-256 `014dc42a97fb41dc58fdb83c8be95782db335f428a614703f70c5d02fe56e0de`），
执行顺序与统计规则均按其预注册执行，未中途修改任何冻结项。

## 执行概况

- 36/36 participant runs 全部完成并 submit 成功；0 次启动失败、0 次补跑、0 次替换。
- 36/36 evaluate 独立重渲染验收：35 PASS，1 FAIL（T05-D-r1，允许区外 27 像素，保留为 TECHNICAL_FAIL）。
- 18 对 blind（MIRRORED_BALANCE，冻结 seed）→ 36 位独立 reviewer 全部完成、全部实际看图。
- 隔离验证：R1 写入后 18 个 R2 包与冻结 blind 输出逐字节一致；R2 写入后 18 个 R1 包内除各自 review.json 外无任何新写入。
- 参试与评审均为全新子代理，仅获知自己 trial/评审包路径；共享宿主文件系统无法硬隔离，记录为限制。

## Primary：run-level taskSuccess（各 18 runs）

| 分类 | A 组 | D 组 |
|---|---|---|
| PASS | 17 | 14 |
| VISUAL_DISAGREEMENT | 1 | 3 |
| TECHNICAL_FAIL | 0 | 1 |

无 PROTOCOL_FAIL、BUDGET_FAIL、TOOL_BLOCKED、INFRA_FAILED、UNVERIFIED。
分任务（3 次重复，A/D 顺序）见 `scored-summary-v1_2.csv`。

## Secondary

- pairLevelPreference（18 pairs）：CONSENSUS_A 7、MIXED 7、CONSENSUS_D 2、NO_MEANINGFUL_DIFFERENCE 2、BOTH_NOT_YET 0、UNVERIFIED 0。分歧全部保留，未设第三评审仲裁。
- candidateVisualStatus：A 17 PASS / 1 DISAGREEMENT；D 15 PASS / 3 DISAGREEMENT。
- 每位 reviewer 的 36 条原始五分类判断完整保存在 `scored-analysis-v1_2.json`。
- 候选预算：全部 36 run 自报候选 1–9 ≤ 12；机械口径（D=候选记录数，A=预览状态目录数）与自报一致量级。
- 成本代理：tool/action 次数与 token 宿主可观测但未逐 run 归档为正式指标；费用/墙钟无宿主统计，记 UNKNOWN。

## 首次解盲

`firstFormalUnblindTimestamp = 2026-09-29T11:44:27+08:00`（36 runs 冻结、36 reviews 冻结、
R2 隔离验证通过之后）。解盲前未读取任何 pair 的 A/D 对应关系。

## 流程注记（不改变结果）

1. blind 首次批处理因主持人脚本路径笔误未生成任何材料，修正后重跑（无副作用）。
2. 2/36 份 review.json 省略 `allowedPairwiseResult` 字段（T05-r1/R2、T05-r3/R1），
   frozen unblind.mjs 按契约拒绝；以 schema 内置枚举做等价机械映射（两份 verdict 均合法），
   已在分析 notes 记录。改进建议归 v1.3：unblind 对缺失枚举数组回退内置集合。
3. 聚合哈希快照的 find 遍历序在会话间不稳定，曾误报 R2 包变化；以排序逐文件清单 +
   与重新生成的 blind 输出逐字节比对裁决：18/18 一致，无篡改。
4. T06 动画维度：3 位评审者经无头 Chromium 实际播放并采帧；其余如实记 UNVERIFIED，无静态拼图冒充。

## 结论（限本次冻结范围）

在本次冻结的 6 项程序化像素资产任务、GLM-5.3-Flash/ZCode 宿主、12 候选预算与 v1.2
工具条件下：A 组（直接代码）taskSuccess 17/18，D 组（Studio 语义编辑+探索）14/18；
配对比较 CONSENSUS_A 7 对 CONSENSUS_D 2 对、MIXED 7 对。**本批次内未观察到 Studio 组
的整体优势；两 arm 的多数 pair 差异落在评审者分歧或"无可辨差异"区间。** 该结论不外推到
其他模型、宿主、任务类型或商业级质量；样本 18 对不构成统计功效声明。

技术可靠性：两组的确定性渲染、保护区、锚点/附件点验收都高度稳定（35/36 PASS），
唯一技术失败来自 D 组一次几何编辑出界（27 像素）。候选预算从未被触及上限。

## 失败模式观察（解释性，不改写 primary）

- 评审分歧集中区：T03（金属感是否充分）两位评审者三次给出方向相反的判断——强提示该任务
  的"金属感"判据在 32x32 尺度上对评审者不可靠。
- D 组在 T02 的三次重复全部遇到 geometry y/h 修改触发底座保护区拒绝（工具行为一致），
  需以 x/w 平移方式绕行——操作空间受限的直接证据。
- T04 两 arm 都在"十字 vs 心形"语义上摇摆，两位评审者对"哪个更像急救标识"判断相反 3 次。
- A 组唯一 DISAGREEMENT 在 T02-r1（居中对称 vs 更厚重的取舍）；D 组 3 个 DISAGREEMENT
  分布在 T01-r2、T03-r2、T05-r3。
