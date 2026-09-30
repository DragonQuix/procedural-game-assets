# 共享 harness

本目录是 benchmark adapter，不是 Studio 产品补丁。`observe()` 使用 recursive-safe mkdir。
`src/` 与 PNG 依赖由准备脚本从 v0.8.0 tag 生成；不得手改。

两臂统一命令：`node run.mjs observe`、`node run.mjs submit`。
`observe` 输出原生、最近邻放大、任务裁切、diff 和带外置 A/B 标签的 contact sheet。
A 表示本次观察的 baseline，B 表示本次观察的 candidate，不是实验 arm 身份。
保存源码不计 candidate；无图探针与物化前拒绝不计；可观察物化状态一旦生成即计，
包括最终未采用或机械不合格的图像。同像素且同有序部件像素/元数据复看只计一次。

`validationProbeCount` 仅为 diagnostic。`observableRelationDiagnosticCount` 仅计明确返回的关系诊断产物，
不估算内部 relation evaluator 的调用次数。未知的跨臂编辑负担计数保留 `NOT_COMPARABLE`，不可填成 0。
