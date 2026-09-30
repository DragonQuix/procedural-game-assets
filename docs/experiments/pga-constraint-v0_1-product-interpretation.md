# v0.1 产品解释：保留 NO-GO，补上显式部件关系

日期：2026-09-30。本文是产品维护决策，不替代或改写正式实验结果。
依据：`../../CONTEXT.md`、ADR-0008/0009/0012、
`../../tests/PGA_CONSTRAINT_BENCHMARK_v0_1/results/report.md`、同目录 `analysis.json`，
以及实验的 `interventions.md`、`organizer/freeze-addendum.json`。

- v0.1 正式判定仍为 **NO-GO**；不重新解释成 GO。
- 在本次冻结范围内，v1.3 technical reliability 没有退步：12/12 提交成功、确定性与最终保护通过，无技术原因导致的失败。
- manual coordinate repair 从 9 降到 2；candidate median 从 2 降到 1。
- G 三对最终图逐像素一致；visual regression 全部集中在 P 的部件接触/连续性。
- semantic transform 保留了几何 anchor，但文档没有声明交界处应保持的结构接触关系。该缺口不能由保护 PASS 或 anchor 不动替代。
- INT-01 是已披露的 post-freeze harness correction：错误 D13 draft payload 的 6 次运行作废，按原顺序重跑。因此 v0.1 是 **qualified evidence**，不是无偏差的原始冻结执行。

下一阶段只增加显式 relation contract、确定性检查和有限 follower 策略。v0.2 的 payload
核验必须先于 participant 创建及任务暴露。是否改善 agent 表现仍待独立实验；本轮不运行模型，
不改 v0.1 原数据，不把工程预期当成实验结论。
