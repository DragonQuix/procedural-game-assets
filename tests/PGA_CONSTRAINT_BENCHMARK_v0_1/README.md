# PGA_CONSTRAINT_BENCHMARK_v0_1

状态：**草案已准备，未执行，未授权执行**。2 tasks × 2 arms × 3 repeats = 12 runs；
6 pairs，每 pair 两位独立 reviewer，共 12 reviews。没有 target 图。

实施者必须以仓库 `CONTEXT.md`、`docs/PLAN.md`、ADR-0001/0002/0009/0010/0011/0012
为术语、坐标、纯核心/IO、事务与保护的来源。当前无 CONTEXT-MAP.md。
实验依据为 `docs/experiments/pga-ab-v1_2-final-audited.md`，不重跑或合并旧数据。

## 两组与材料

- D12：从 `4fd4330` 的真实 src/bin/package/lock 冻结，附同版 pngjs；不是给 v1.3 关闭开关。
- D13：冻结本轮开发源的独立载荷，逐文件 SHA-256 见 preparation-manifest.json。
  正式候选路径取 manifest.toolkits.D13.path；0.7.0 定版追加新快照，初期草案快照保留于
  archivedToolkits，不参加实验。这样无需覆盖任何已生成载荷。
  PR #1 修复后正式候选更新为 `D13-0.7.0-4cd1666`（source=`4cd1666`），旧 `D13-0.7.0`
  与初期 `D13` 均保留。`--finalize` 按版本和源提交追加目录，拒绝覆盖与未提交产品源。
- `materials/G`、`materials/P`：全新 hold-out 布局，不来自两份 demo 或 v1.2 正式资产。
  D12/D13 起始 RGBA 完全一致。D12 用旧 constraints；D13 另外携带最终资产合同。
  独立 evaluate 对两组始终施加同一个最终 pixel/metadata/node 合同。
- 主持人控制解仅验证两组可行性，位于 organizer，不向 participant/reviewer 暴露；
  preparation 的两次控制解编译不是实验 run，也不构成视觉成功。

## 任务

G：矿区压力单元的主体明显更矮、更宽、更重，保持底座、sensor 附件、仪表与保护区域。
机械阈值 minWidth=24、maxHeight=19、centerX=25、bottomY=31；视觉重量仍由独立 reviewer 判断。

P：继电塔主体作明显结构改变（minWidth=20、maxHeight=16），最终边界保护区、anchor、
attachments、bounds、信号灯与插座不变。尺寸与像素以 task-contract.json 为准。

每个 participant 只收到自己 arm 的 toolkit、起始文档、共同 task 说明与观察接口。
不得读取另一组、demo、控制解、key 或原评审。

## 预算与指标

候选预算=6 个不同、实际物化并可被观察的渲染状态，排除基线和同状态确定性复编译；
已物化但被拒绝的候选仍计数。safe-domain 校验探针只返回可行值和失败诊断，不提供图像、
审美排名或选择候选；其调用数单列 validationProbeCount（包括 apply 阶段拒绝），实际试编译
次数另记 validation.trialCompiles，不计为可观察候选。同次 explore 复用域不重复计探针。
因此计算预算不相同，不把候选数等同于总渲染成本。本轮明确评估功能包而非等算力效果。

Primary 1：提交、确定性、共同保护合同、几何目标、协议、预算与双 reviewer MEETS 全部通过
才为 taskSuccess。宿主观察证据不足、动画（未来任务）未看必要播放均传播 UNVERIFIED。
Primary 2：非法已物化候选数/已物化候选数及逐 run 是否发生、最终保护违规数。

拒绝操作必须拆成“提前阻止的非法请求”和“已物化非法候选”，不能把更早阻止的 D13
诊断数量当产品退步。拒绝数单独报告，不设“全部 rejection 都必须下降”的错误门槛。
manualCoordinateRepair 定义为一次 geometry.set 请求中同时手工提供 x+w 或 y+h 的次数，
加上在上一几何请求后为恢复相同中心/底边补交 x/y 的请求数；以操作轨迹机械计算并保留明细，
不从 agent 自述动机计数。semanticTransform 计三个新语义操作的请求数。

两组获得相同 baseline/native/4x nearest、target_crop、contact sheet 和 diff overlay；
共享观察模块置于 toolkit 外，通过标准 asset/frame 读取，不给 D12 新 Studio 编辑能力。
所有操作、候选、探针、提交、宿主图像输入与启动事件需记 ledger。

## 评审与 Go/No-Go

先冻结 12 个执行产物，再统一盲评，再解盲。不替换已启动的失败 run；不增加重复追求 Go。
位置按 protocol-draft.json 的 seed 与 task/repeat 决定，R2 严格镜像 R1；MIXED 不仲裁。
新工具在 `tools/benchmark/`，不使用冻结 v1.2 unblind 的 enum fallback。

Go 条件见 JSON：D13 最终保护违规 0、至少 5/6 taskSuccess；非法已渲染候选与手动坐标
修复严格减少，median candidate count 不增，视觉非退步门槛同时满足。关键数据缺证或
D12 基线发生率为 0 时判 INCONCLUSIVE，不事后改阈值。最多只报告 6 对描述性结果，不称总体优势。

## 准备与未运行证明

`node tests/PGA_CONSTRAINT_BENCHMARK_v0_1/prepare-materials.mjs --check` 校验冻结载荷和材料，
并要求不存在 runs/reviews/results/execution-freeze-manifest。prepare 只允许新目录，拒绝覆盖。
preparation-manifest.json 记录 experimentRunsCreated=0、modelCalls=0；protocol execution.started=false。
清单另记录协议 SHA-256 和共同观察纯模块/依赖的哈希；共同观察从当前 D13 冻结目录取模块，
只给两组相同 frame 观察接口，不向 D12 暴露新编辑能力。check 核对全部旧快照、起始像素、
控制解、三种共同观察输出，以及对 D12/D13 真实编译结果施加的同一独立最终合同。

冻结前还需选定模型/宿主、验证共享计数 runner 与宿主证据通道、签署全部材料及提示词 SHA-256，
获得正式执行授权。目前不是 READY_TO_RUN；本轮不会补跑这些 agent 实验。
