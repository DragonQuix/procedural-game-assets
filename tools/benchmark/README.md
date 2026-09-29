# 新实验评审基础设施

这里维护新协议，不修改 `tests/PGA_AB_BENCHMARK_v1_2/` 的冻结代码或原始数据。
依据：`CONTEXT.md`、ADR-0001/0009/0011/0012，以及 v1.2 终审解释。

- `review.mjs`：`pga-review/3` 严格字段校验、固定五分类、动画证据传播和独立 vision 分类。
  缺字段或未知枚举直接 INVALID_REVIEW，不进入解盲，不做 fallback。review 不携带 allowed 枚举。
- 动画任务的 requiredClips 来自外部任务合同；top-level 和对应候选均声明播放、必要 clip
  全覆盖且 motion.taskFit 可验证，才允许 MEETS。未播放或漏 clip 向总 taskFit/pairwise
  传播 UNVERIFIED。原始 review 不被修改。
- CONFIRMED 需要主持人提供有 artifact SHA-256、callId、modelContextId 和成功 modelInput
  关联的 host-transcript 事件；review 自述只到 SELF_REPORTED。事件不能由 reviewer 代填。
  主结果还要求两位 reviewer 均有 CONFIRMED 证据，否则 UNVERIFIED。
- `blind.mjs`：两个独立目录，X/Y 镜像、seed/task/repeat 确定映射；key 只在主持人目录。
  当前新打包器只支持静态任务；有 requiredClips 时拒绝，不能以静图假装动画材料。
- `unblind.mjs KEY REVIEW TASK_CONTRACT [HOST_EVENTS]`：先严格校验，再解盲。

单元/集成测试用合成图和合成宿主事件验证规则，不代表真实 reviewer 已看图。
v1.2 reviewer-self-test 仅作隔离基础设施回归，不是重跑或重评分正式实验。
