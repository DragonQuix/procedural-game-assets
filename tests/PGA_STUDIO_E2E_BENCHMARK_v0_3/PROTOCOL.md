# v0.3 协议草案

本文件与 `protocol-draft.json` 一起供 ZCode 运行前复核，不是正式预注册。
术语、层次和长期约束沿用 `../../CONTEXT.md` 与 `../../docs/adr/0008-agent-studio.md`、
`0009-studio-edit-transactions.md`、`0012-studio-asset-contract.md`、`0013-studio-relations.md`。
当前没有 CONTEXT-MAP.md。实现者不得根据新实验结果补改冻结规则。

## 设计、臂与预算

4 tasks × 2 arms × 3 repeats = 24 participant runs，12 pairs，每 pair 2 个独立 reviewer，共 24 reviewer。
`planned-matrix.json` 穷举矩阵并交替臂顺序。任务是主要泛化单位，重复不是独立新任务。
不选择最好的一次，不静默替换失败，不追加第三 reviewer，不扩大样本。

A 是 Direct Code：编辑 task-specific `asset.mjs` 与公开底层 core/geometry/bake/recipes/export；
可用完整 PixelPainter、已有配方 primitives、普通函数与全部四级颜色绘制能力。
不允许 Studio 文档 API、safe-domain、relation evaluator、semantic transform、候选管理。
D14 只用真实 v0.8.0 的 inspect、geometry、safe-domain、protection、relations、explore、commit、observation；
不手改工作区或工具，不混入未来功能。两臂不互相调用工具。

两臂保持同一起点 RGBA、部件支持像素和元数据。共享 adapter 的文件树 hash 相同，
baseline native PNG、最近邻 enlarged、task crop、candidate、diff、带外置 ID 的 contact sheet 都一致。
`observe --node <id>` 提供两臂等价部件裁切。Studio 的结构诊断属于被比较的编辑抽象，不是额外参考图。

候选预算 8。定义：有意暴露给 participant 视觉评估的唯一物化渲染状态。
计数 identity 为 `renderHash + semanticStateHash`：前者为尺寸和最终 RGBA 的 SHA256；后者为
有序、命名的各部件 RGBA 与 anchor/attachments 的规范 JSON SHA256。
它是跨臂可验证的 committed source state 投影，不靠 A 文件保存次数或 D workspace ID。
同像素但隐藏部件支持、层序或元数据不同算新状态；注释、变量名、格式或等价源码不同不算。
起点 identity 免费；复看同状态不重复计。Studio edit/explore 已写预览即计，即使没打开或最终拒绝；
一轮 explore 物化多个状态分别计。A observe/submit 冷渲染并登记；无图 validation 与物化前拒绝不计。
超预算仍保留全部账目，budget FAIL，不删除失败候选回收额度。
绕开 wrapper 产生图像必须由宿主审计补证，不能默认没有；无法核实时 protocol UNVERIFIED。

## 三项 primary

1. strict taskSuccess：只有 finalization success、两次独立冷渲染 deterministic、全部 hard constraints、
   protection、适用的 required relation、预算与协议全部 PASS，且两位独立 reviewer 对该 candidate
   都 MEETS，并有可核验真实图像输入证据，才 PASS。
2. technicalFailureIncidence：invalid final output、hard contract violation、tool-blocked completion、
   submit failure 任一发生。未知不是 false；恢复过的中间错误另列 secondary，不自动判最终失败。
3. paired visual preference：保留两份原始裁决和映射后的独立结果；只分类为 CONSENSUS_A、
   CONSENSUS_D14、MIXED、NO_MEANINGFUL_DIFFERENCE、BOTH_NOT_YET、UNVERIFIED，不加总审美分数。

MEETS+MEETS=PASS；MEETS+NOT_YET（任意顺序）=DISAGREEMENT；NOT_YET+NOT_YET=NOT_YET；
任一 UNVERIFIED=UNVERIFIED。缺评审、重复 context/session、无图像输入证据均不能 PASS。
没有“至少一个 MEETS”的 primary；本实现不输出 permissive 值，未来若预注册只能列 sensitivity。
技术失败的资产仍可保留盲评偏好，不能把视觉胜出代替合规成功。

## Secondary 与负担口径

记录 candidateCount、lowLevelEditCount、manualCoordinateRepairCount、semanticTransformCount、
relationAwareTransformCount、rejectedOperationCount、submitSuccess、原始 reviewer outcomes、
validationProbeCount、observableRelationDiagnosticCount、retries/errors、reviewValidationAttempts。
几何语义操作/显式 preserveRelations 由冻结 Studio 候选记录提取，不以 participant 自报代替。
rejectedOperation 是可观察拒绝请求；错误由实际 CLI/runner 事件记录，原始响应保留。
validationProbeCount 只累计可观察工具报告的 tested 数，**DIAGNOSTIC_ONLY**，不称总计算量。
observableRelationDiagnosticCount 只计返回的诊断产物，不称真实 relation evaluation 次数。
A 自己进行的分析可能不可观察；不得将未记录内部计算当作证明零成本。

源码编辑批次和 Studio 原子操作不天然同单位；几何 diff 也不能判断“修复”的意图。
当前 lowLevelEditCount 与 manualCoordinateRepairCount 为 `{value:null, comparability:NOT_COMPARABLE}`。
若 ZCode 能在运行前冻结同一宿主级编码规则，可另设共同指标；不得看结果后改变规则。
wall-clock、CPU time、compile invocations 默认 null，获得真实记录后也只作 exploratory secondary，
除非先证明两臂定义一致。绝不把 shell 次数、probe 次数代入 compute efficiency。
因此本草案不能凭未知手工计数宣称低层负担已改善。

## 两层解释，不是单一 GO

Engineering decision 分别展示 technical reliability 是否不低于 A、strict taskSuccess 是否不低于 A、
candidate/manual effort 是否改善及可比性。Visual/product hypothesis 分别展示 taskSuccess 的方向、
consensus preference 的方向和逐任务有无一致视觉回归。每层允许 SUPPORTS、DOES_NOT_SUPPORT、
MIXED/INCONCLUSIVE；没有为促成 GO 设定的总阈值，未知/冲突必须保留。
ZCode 正式冻结前确认解释措辞；不以统计 p 值替代维护判断。

统计只预备 paired 2×2 success matrix、二侧 exact McNemar、consensus-only 二侧 exact sign/binomial、
task-level breakdown。全部 12 pairs 留在表中。UNVERIFIED 在成功矩阵中属于未通过但单列数量，
有 unresolved 时不运行 McNemar；无不一致对时 p=null。sign test 仅含 CONSENSUS_A/D14，明确分母，
排除 MIXED/NMD/BOTH_NOT_YET/UNVERIFIED，不把它解释为所有偏好的总体检验。
不试不同检验挑最小 p；小样本、同任务重复相关、不显著不等效。

## 盲评与 pre-submit gate

MIRRORED_BALANCE：每 pair 只映射一次 X/Y；reviewer-1 呈现 X,Y，reviewer-2 呈现 Y,X。
物理文件始终 `X.png`、`Y.png`；换呈现顺序不换身份。各 reviewer 单独目录、单独上下文。
任务文字、baseline、候选图、schema/template/validator 可见；key、工具、操作日志、candidate count、
技术结果、peer review 不可见。图集标签位于 asset pixels 外，不用位置定义对象。

reviewer 按 `review.schema.json` 写 draft，经 `submit-review.mjs` 本人提交。
无效 enum/字段/shape 只产生纯 schemaErrors，发回同一 context；coordinator 不代改。
每次保存 attempt 序号、draft hash、author binding、错误字段和允许形状。
通过后仅保存一份不可覆盖 review.json 与 hash receipt；reviewValidationAttempts 不是票数。
没有默认值补全、enum 归一或 post-review repair。达到格式重试上限仍失败记 NOT_SUBMITTED。
validator 验证格式，不纠正审美判断；图像证据再由主持人匹配真实宿主轨迹，不信自报 CONFIRMED。

## 模型与启动 gates

`modelIdentityPolicy.selected` 当前为 null，ZCode 必须在正式 protocol freeze 前二选一：
EXACT_REQUIRED 要求 requestedModel == actual host model，否则 FAIL，不建 participant。
FREEZE_ACTUAL 允许宿主实际模型，但必须在第一个正式 run 前冻结 actual identity。
实际身份包括 model、host、version、reasoning（未知显式 null），来源为 host-api 及 attestationId；
不能仅使用 agent 自报或任务书名称。每次启动重新核验，漂移 LAUNCH_BLOCKED。

真实 Vision Gate 单独输入 vision_A.png、vision_B.png，不问空间身份。
主持人核对 Object A 为帆船（浅色帆、暖色船体），Object B 为放大镜形环（绿色圆环、深色柄）；
用形状/颜色/结构确认，不以单一物体命名同义词决定失败。保留 image SHA、call/session/context ID、
modelInput=true；本轮只生成图片及合成测试，真实 gate 仍 NOT_RUN。

时序为 prepare → install frozen arm → 重算 kit/task/observation/start/staged hash → PASS →
create empty participant → 再核对 context/model 与载荷 → expose task。
任何 mismatch 在 expose 前阻断，记录 participantCreated/taskExposed；negative control 篡改真实安装文件。
`launchParticipant` 还要求 execution=FROZEN、approvedToExecute=true，绑定候选 manifest 与 protocol hash，
有预先冻结 modelIdentity 和真实 visionEvidence。候选 manifest 自身保持 CANDIDATE_NOT_RUN。
此函数没有实际模型驱动，必须由 ZCode 提供 getModelIdentity/createEmptyParticipant/exposeTask。

## 隔离与真实执行前清单

所有 48 个正式 agent 都须新 context、新 session，无前序结果或跨臂记忆。
participant 禁止看 other arm/repeat、reviewer、控制解、历史结果、aggregate；reviewer 禁止看来源映射和技术轨迹。
共享 FS 限制须书面记录，并由宿主挂载/权限或访问日志控制；路径名字不能证明隔离。
`launchReviewer` 同样先校验冻结模型和包 hash，再建空上下文、重验并暴露评审材料；
它与 participant 共用 contextRegistry。reviewer 绑定由宿主写 review-binding.json，格式重试须由同一 reviewer 的真实工具事件提交。
程序识别上下文混用不等于能防止有全盘权限者伪造证据，正式审计仍需宿主证据。

运行前核对材料与 self-tests、冻结 modelIdentity policy、host、common budgets、访问策略、vision 证据、
执行矩阵和 protocol；保存 freeze 文件在协调器私有目录。不把冻结文件放进 participant/reviewer package。
本开发交付只准备候选，不创建正式 run/review/results，不调用任何 participant/reviewer 模型。
