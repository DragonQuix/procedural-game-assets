# PGA A/D 实验宿主数据目录

本目录是 A/D 对照实验（`tests/PGA_AB_BENCHMARK_v1` / `v1_1`）的主持人工作区。
约定：**代码、协议与实验工具进 Git；参试数据留在本目录并保持 Git ignored**，
与产品源码分离。本 README 是唯一入 Git 的本目录文件。

## 不进 Git（全部已忽略）

| 目录 | 内容 |
|---|---|
| `smoke/` | 4 个流程演练 trial 及其回收结果（T01/T02 × A/D） |
| `handoff/` | 移交执行会话的 trial 压缩包 |
| `runs/` | 正式 scored 批次的 prepare 输出（约定路径 `runs/<task>-<arm>-r<n>/`） |
| `eval/` | evaluate.mjs 独立验收输出 |
| `reviews/` | blind.mjs 匿名评审包；**`key.json`（X/Y↔组别映射）只存在于本机 `reviews/` 下，任何情况下不入 Git、不进 reviewer 目录** |
| `selftest-v1*/` 等 | 自检生成的机械 trial，仅 `self-test.json` 白名单入库 |
| `**/key.json` | 纵深防御：本目录任意深度的映射文件都被忽略 |

## 进 Git（白名单口径）

预检/自检的结论性报告：`readiness.json`、`self-test.json`、`adapter-self-test.json`，
以及已入库的 v1/v1.1 探针工作区（机械自检产物，无参试内容）。
未来的新报告沿用"顶层报告 JSON 入库、生成过程目录忽略"的口径，不回填大体积产物。

## 可证明性

被忽略目录的完整性靠两件事维持，不靠 Git：
1. 移交/回收的 trial zip 在 `handoff/` 保留原件；
2. 每个移交包生成时把 SHA-256 记入本目录 `handoff/MANIFEST.sha256`（本机留存，不入 Git）。

若日后需要独立实验数据仓库，直接把本目录初始化为独立 Git 仓库即可迁移，
主项目历史无需改动。
