# v1.2 维护说明：只修评审基础设施，不实验、不改任务

## 一、这是什么

这是 PGA A/D 实验包的第二个维护版本。v1.1 → v1.2 **只改变 blind/reviewer 基础设施**；
六个任务、frozen fixtures、A/D 起始资产、A/D 执行 PROMPT、HOW_TO、Studio 工具、
项目源码、每 trial 12 个已渲染候选上限、pair-order、evaluate 技术验收规则、controls
与 v1.1 逐字节一致（`organizer/reviewer-self-test.mjs` 自动比对）。没有重建艺术基线，
没有因 smoke 中某组被偏好而修改 D 组工具、参数或提示词。

## 二、为什么要改

v1.1 的 blind 把两个评审者放进同一个 `reviewer/` 目录，第二位评审者可能读到第一位
留下的评审文件，破坏独立性；同时 blind 不对 X/Y 做随机化或平衡，pair 中 X 恒为
`--left` 输入，标签与位置和 arm 混淆。2026-09-29 的 smoke 演练暴露了这两个问题。
因此 **smoke 的视觉比较结果不用于任何 A/D 效果推断**（原始 smoke 结果保留在
主持人侧，不改写、不删除）。

## 三、v1.2 的评审基础设施

1. **独立评审目录**：`blind.mjs` 现在输出 `<out>/reviewer-1/` 与 `<out>/reviewer-2/`
   两个物理独立、内容完整的包（各自 X/、Y/、TASK.md、baseline、common、compare.html、
   PROMPT.md、review.template.json）。两包不共享任何文件；reviewer-1 写入不影响
   reviewer-2 包内容（自动测试验证）。
2. **预注册镜像平衡**：`candidateA/B` 由 `sha256(mappingSeed|leftPath|rightPath)`
   的奇偶决定，默认 seed `pga-ab-benchmark/v1_2/blind-mapping/1` 在评审运行前固定，
   不得按作品质量手工选择。reviewer-1: X=candidateA, Y=candidateB；
   reviewer-2 镜像：X=candidateB, Y=candidateA。每个真实候选在两位评审者处
   各出现一次 X、一次 Y。key.json 记录每个 reviewer 自己的映射
   （reviewerId、X、Y、mappingSeed）。reviewer 包内无任何身份信息。
3. **评审 schema v2（pga-review/2）**：先分别评价 X、Y（taskFit = MEETS/NOT_YET/
   UNVERIFIED，topStrength、topConcern、blockingIssue），再给 pairwiseResult
   （X_PREFERRED / Y_PREFERRED / NO_MEANINGFUL_DIFFERENCE / BOTH_NOT_YET /
   UNVERIFIED）加 confidence（LOW/MEDIUM/HIGH/UNVERIFIED）与 keyEvidence。
   不使用单一数字总分，不要求强行二选一。
4. **unblind.mjs（主持人专用）**：按 key.json 解盲镜像评审，输出底层 run 路径与
   candidateA/B 角色。禁止在正式批次中途使用（见协议第五节规则）。
5. **reviewer-self-test.mjs**：9 项自动测试——目录独立、同 seed 确定性、逐 pair 镜像、
   key 不泄漏进评审包、reviewer-1 写入时 reviewer-2 包哈希不变、schema 五分类、
   unblind 镜像解盲一致、evaluate 规则与 v1.1 一致、冻结材料与 v1.1 逐文件哈希一致。

## 四、评审者隔离的现实边界

同一宿主文件系统下无法做硬性文件权限隔离；v1.2 用物理独立目录 + 哈希不变验证 +
"另一位评审者的结果不可读"指令来保证。**共享宿主文件系统**记录为实验限制。

## 五、正式 scored 阶段新增规则：禁止提前解盲

36 次 scored 运行全部完成之前：不读取/不汇报 A/D 对应的视觉赢家统计；不据中间
视觉结果修改提示词、工具、任务或执行方式；不向后继参试 agent 泄漏前序 A/D 表现；
不因某 arm 连续表现差而追加运行。key.json 若技术上可读，按"逻辑封存"执行，
记录最终首次解盲时间点。每一位评审者使用 reviewer 包的独立拷贝。

## 六、复验命令

```text
node organizer/reviewer-self-test.mjs --repo <项目目录> --out <新目录>
node organizer/self-test.mjs --repo <项目目录> --out <新目录>
node organizer/preflight.mjs --repo <项目目录> --out <新目录> --run-tests
node organizer/blind.mjs --repo <项目目录> --left TRIAL --right TRIAL --out <新目录>
node organizer/unblind.mjs --key <out>/key.json --review <out>/reviewer-1/review.json
```

prompts/reviewer.md 与 BENCHMARK_VERSION.json、SHA256SUMS.json、organizer/blind.mjs、
organizer/unblind.mjs（新增）、organizer/reviewer-self-test.mjs（新增）是 v1.2 仅有的
变化文件；`PROMPTS_CN.md` 中收录的评审提示词为 v1 历史快照，以 `prompts/reviewer.md`
为准。
