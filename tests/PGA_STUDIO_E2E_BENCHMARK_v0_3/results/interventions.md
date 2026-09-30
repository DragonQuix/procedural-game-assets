# v0.3 正式实验偏差与干预记录

全部偏差均为协调器（ZCode host adapter）运行时问题，未改变冻结 benchmark 语义、任务定义、评分规则或任何 run 的正式结果。

| # | 时间（UTC，2026-09-30） | 事件 | 处置 | 影响 |
|---|---|---|---|---|
| 1 | ~08:0x | H-A-r2 的 SendMessage（expose）与 register/recheck 调用顺序毫秒级倒置 | recheck PASS 后 run 才开始执行 | 无实质影响；记录 |
| 2 | ~09:28 | K-D14-r2 漏 prep 即 register + expose-record | recheck 正确 LAUNCH_BLOCKED；SendMessage 未发；补 prep+recheck PASS 后才真正 expose；host-state 更正 + correction 事件 | expose 记录一度失真，已更正；任务暴露严格晚于 payload 验证 |
| 3 | ~11:3x | H-D14-r3 在第二批 prep 后被漏 launch | 其余 23 runs 完成后发现；staging recheck PASS 后按完整时序补 launch | 执行顺序偏离 plannedRunOrder 的字面顺序（该 run 最后执行）；规模与时序 gate 完整性不受影响 |
| 4 | ~09:0x | coordinator.mjs `finish` 路径 bug（trial 根 vs staged） | 修复为 staged/ 下读取 | 仅协调器记录读取 |
| 5 | ~11:5x | evaluate-all.mjs 调 evaluateTrial 传 trial 根而非 staged | 修复重跑 | 仅评估读取路径 |
| 6 | ~11:5x | protocolAudit 初版把 D14 staging 期 `studio create` 起点预览误判未入账 | 内容对账（==baseline renderHash）+ binding.stage.files 佐证；最终白名单=binding.stage | audit 字段演进；technical/budget 不变 |
| 7 | ~08:4x | Vision Gate 首个子代理 A/B 标签互换（内容描述全对） | 运行作废；严格逐张读取版重验 CONFIRMED | 无 |
| 8 | ~12:0x | S-r2 slot1 reviewer 误报 contact-sheet 标签互换 | 机械复核：同输入重建 sheet 与盘上逐字节一致；X.png/Y.png 哈希与 key、两臂 final 渲染一致 | 包无缺陷；reviewer 目测误差；该 pair MIXED 不受影响 |

## reviewer/ host 适配约定（非偏差，供审计）

- ZCode 不向子代理暴露原生 transcript callId/sessionId：coordinator 以 spawn 的 agentId 作为 modelContextId（全局唯一），图像输入事件 callId 由 host adapter 分配（vision gate：`v03-vision-r2-read-N`；reviewer：`reviewer-<slot>-<view>`），每次分配绑定 agentId 并落 host-events.jsonl。图像内容级传输已由 Vision Gate（内容探针）独立证实。
- 共享文件系统不构成沙箱：隔离由 prompt 目录边界 + 事后审计（protocolAudit、candidate ledger 对账）控制；nonce 实验证实对话历史不共享。
