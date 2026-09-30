# PGA_RELATION_BENCHMARK_v0_2

状态：**DRAFT_NOT_RUN**。没有正式 runs、reviews、results；没有模型调用。
Codex 只准备代码、测试、任务、D13 frozen release 与 D14 candidate snapshot。
ZCode 负责独立验证、toolkit final freeze、计数 schema 与模型/宿主冻结及正式执行。

## 实施与复核依据

以 `../../CONTEXT.md`、`../../docs/PLAN.md`、`../../docs/adr/0012-studio-asset-contract.md`
及 `../../docs/adr/0013-studio-relations.md` 作为术语、边界和架构决策来源；没有 CONTEXT-MAP.md。
v0.1 原结果保持不变，产品解释见 `../../docs/experiments/pga-constraint-v0_1-product-interpretation.md`。

## 两臂与任务

- D13 来自真实 `v0.7.0` tag，不是 v1.4 关闭关系的模拟 arm。
- D14 来自已提交的 0.8.0 源，标记 CANDIDATE_NOT_FINAL_FREEZE；当前清单不是正式执行冻结。
- Task C：新信标资产，Node A 比例重构同时保持 Node B E2 与 Node A E1 的 R1。
- Task R：新终端资产，同时保持 R1、R2、Region P1 和 Node C。低层几何合法解在 organizer/materials.mjs，
  不生成答案图、不暴露给 participant。两个任务均与 demo、v0.1 assets 独立。
- 每任务每臂 3 次，共 12 次；候选预算 6。未物化图像的 relation/validation probe 单列。

两臂 common task 文件逐字节相同；起始文档只在 /3→/4 与 relations 声明有工具能力差异。
纯视觉观察统一经过 shared/observe.mjs 和同一哈希的共享代码，输入是各臂真实 BakedFrame，
不是 atlas page。baseline/native/upscaled/crop/diff/contact sheet 规则与信息量相同。
D14 的 relation inspect 是工具能力差异，允许使用，不向 D13 注入该诊断能力。

## 启动顺序硬约束

`prepare trial → install frozen toolkit → recompute toolkit hash → verify expected arm identity
→ verify common observation hash → verify task hash → PASS → create/start participant`

`organizer/setup-trial.mjs` 只在**协调器私有目录** staging，不创建 participant。任何失配写
`LAUNCH_BLOCKED`，不返回任务正文。不得先创建 agent 再装包、再核验。
正式启动必须调用 `tools/benchmark/payload-gate.mjs` 的 `launchParticipant`，由 ZCode 注入真实
host adapter；它在读取 prompt 和调用 adapter 前再次核验，DRAFT 清单一律拒绝启动。
host adapter 必须限制 agent 只访问 `staged/`；文件哈希 gate 本身不是 OS 沙箱，不抵御管理员
在核验与启动之间篡改文件。启动前冻结 staging 写权限由宿主负责。

blocked attempt 是可重试 launch failure，使用全新试次目录。participant 已看任务后发生的失配
不能追认成普通 launch failure，必须记录 intervention，不得静默重试。

## 指标与 Go 草案

Primary：taskSuccess、finalRequiredRelationViolationCount、manualCoordinateRepairCount。
taskSuccess 要求 submit、确定性、mechanical、protection、required relation、budget、protocol、visual 全部 PASS。
protection violation 独立硬约束；不使用单总分，不再以 invalidRenderedCandidateIncidence 作核心判据。

Secondary：candidateCount、rejectedOperationCount、semanticTransformCount、relationAwareTransformCount、
validationProbeCount、relationEvaluationProbeCount、relationRepairCount、protectionRejectionCount、retries/errors、reviewer preference。
`organizer/evaluate.mjs` 提供机械最终合同与草案计数器；事件分类、手工修复定义、幂等重放和错误重试口径
须在运行前冻结，不能根据结果改口径。建议手工坐标修复计成功应用的低层 geometry.set 修复操作，初次操作
是否属于修复由冻结规则按请求序列分类，不由 participant 自报。计数器只聚合主持人已分类事件。

Go 草案：D14 关系违规=0、保护违规=0、taskSuccess≥5/6、手工修复总数<D13、候选中位数≤D13、
visual non-regression。实际调用并产生可验证关系修复仅为解释条件，不向 participant 指定 API。
若 agent 不使用关系工具，这是实验结果，不是允许干预的理由。具体草案见 protocol-draft.json。

## 符号身份与视觉入口

`identity-lint.mjs` 只扫描 agent-facing prompts、盲包说明和任务文字，不对 geometry 源码做方向禁词扫描。
需要方向语义时 allowlist 必须包含精确行号、短语、stable object ID、理由，且该行出现对应 ID。
无效或未消费 allowlist 也失败。

v0.2 使用 `symbolic-blind.mjs`，不得调用旧 blind.mjs：物理输出 X.png/Y.png，MIRRORED_BALANCE
只交换展示顺序，X/Y 映射跨 reviewer 保持不变。key 由主持人另存。评审依然是双 reviewer，
原始判定与宿主 image-input 证据均保留，未知不算 PASS。

Vision gate 提供独立 vision/vision_A.png / vision_B.png，与正式 hold-out 无关，图片和 prompt
以哈希绑定；语义答案在 organizer/vision-control.json，只供主持人复核，不暴露给 participant。
gate 尚未执行，不宣称 vision PASS；ZCode 须在正式冻结前验证真实 image-input，不冻结宿主模型。

## ZCode 运行入口

```powershell
node --test --test-reporter=spec "tests/**/*.test.js"
node examples/studio/v14-relation-demo.mjs --out work/zcode-v14-demo
node tests/PGA_RELATION_BENCHMARK_v0_2/prepare-materials.mjs --check
node --test tests/integration/benchmark-relation-materials.test.js
node tests/PGA_RELATION_BENCHMARK_v0_2/organizer/setup-trial.mjs --out work/zcode-launch-control --arm D14 --task C
```

这些命令不调用模型。正式执行前另行归档 ZCode 验证报告、最终两臂 hash 清单、共同观察哈希、
任务哈希、vision gate 哈希和宿主适配证据；D14 有修改须新建追加快照，不覆盖当前 candidate。
没有全套独立验证、正式冻结与授权，不得把 preparation PASS 当成开跑许可。
