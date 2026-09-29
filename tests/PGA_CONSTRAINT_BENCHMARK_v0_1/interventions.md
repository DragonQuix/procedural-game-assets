# Interventions — PGA_CONSTRAINT_BENCHMARK_v0_1（2026-09-29 正式执行）

按冻结协议记录全部干预。原则：不结果驱动干预；12 participant 完成前不做两臂汇总。

## INT-01：D13 臂装包错误（错误工具包绑定），6 个 run 作废重跑

- **发现时间**：12 个 participant 全部执行完毕后的统一评估阶段（协调器 evaluate-run.mjs 的 protocol 检查）。
- **现象**：T02/T03/T05/T08/T10/T11（全部 6 个 D13 run）的 trial kit 副本与 preparation-manifest 的
  `toolkits.D13`（path=`D13-0.7.0-4cd1666`）逐文件失配（bin/pga-studio.mjs、safe-domain.js、
  studio-store.js、observation-files.js、package.json/lock 等 7 个文件哈希不同）；失配哈希与
  `archivedToolkits["D13-initial-draft"]`（frozen/D13，PR #1 修复前的开发源快照）完全一致。
  D12 的 6 个 run（T01/T04/T06/T07/T09/T12）kit 绑定全部正确。
- **根因**：协调器组装 trial 的批处理脚本把 arm 名直接拼成 `frozen/${arm}`；frozen/ 下并存
  `D13`（初期草稿）、`D13-0.7.0`、`D13-0.7.0-4cd1666`（正式候选）三个目录，于是 6 个 D13 trial
  被装上了初期草稿载荷。评估器 protocol 检查按冻结哈希机械拦截，属协议防护按设计生效。
- **佐证症状**：草稿版候选记录无 `validationProbeCount` 字段，故这 6 个 run 的探针计数为 0
  （正式候选载荷的候选记录带该字段，见 CONTROL trial 与 D12 run 的记录结构）。
- **重跑理由（arm 完整性，非结果驱动）**：冻结协议规定 D13 臂 = `D13-0.7.0-4cd1666`；用草稿
  载荷的数据回答"v1.3(0.7.0) 是否改善"会系统性错答研究问题。决定依据是工具包绑定的机械哈希
  失配（6/6 全部失配，与任何 run 的成败/指标无关），发现时点在两臂汇总之前——协调器只看过
  单 run 机械事实（评估器逐 run 输出），未计算或引用任何 D12 vs D13 聚合。
- **处置**：
  1. 6 个无效 run 的全部产物原样移入 `runs-invalid/`（不入库），目录名不变，作为事故证据保留。
  2. `setup-trial.mjs` 修正：kit 目录改由 `preparation-manifest.toolkits[arm].path` 解析；
     装包后逐文件核验，失配即拒绝开跑（exit 3）。修正后 harness 哈希记录于 `freeze-addendum.json`。
  3. 以原 runOrder 顺序重跑 6 个 D13 run（G-D13-r1、P-D13-r1、G-D13-r2、P-D13-r2、G-D13-r3、
     P-D13-r3），全新代理，取证流程与首轮一致。
  4. 重跑前重跑 `prepare-materials.mjs --check` 确认冻结材料未被本轮污染。
- **无效 run 一览（保留于 runs-invalid/，不入正式数据集）**：
  - T02（G-D13-r1，agent_9b069e9c，提交成功但 kit=D13-initial-draft）
  - T03（P-D13-r1，agent_66691863，同上）
  - T05（G-D13-r2，agent_06487168，同上）
  - T08（P-D13-r2，agent_7ede8555，同上）
  - T10（G-D13-r3，agent_ef8ae514，同上；其提交另存在几何未达标，见其 participant-report）
  - T11（P-D13-r3，agent_e7fd972a，同上）
- **D12 六个 run 不受影响**，保留为正式数据。

## INT-02：执行期间快照取证的时间损耗（无协议影响）

宿主在子代理结束后删除其 model-io rollout 文件；Windows 下偶发复制期文件锁。处理：每个 run
运行中多次快照复制（60-170 秒间隔）。T12 的提交后追加快照未能取得（rollout 已清理），其证据
以提交前快照（67 个 image 内容块）为准。不影响任何协议判定。
