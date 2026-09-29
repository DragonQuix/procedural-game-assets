# 实际命令与读取范围

全部在Windows侧执行，工作目录 `E:\Repos\Tools\procedural-game-assets`。没有调用收费模型、网络搜索、云服务、npm安装、Git提交或push。文件查阅使用FastCtx，文件创建/修改使用apply_patch；只有审计脚本生成的派生数据写入本目录。

## Git与运行时

```powershell
git status --short
git branch --show-current
git rev-parse HEAD
git log -8 --format="%h %aI %s"
Get-Command node | Select-Object Source,Version
git diff --stat
git log --all --since=2026-09-29 --format="%h %aI %s" -- src bin package.json tests/PGA_AB_BENCHMARK_v1_2
git check-ignore tests/pga-ad-host/audit-v1_2/audit-report.md
```

脚本内部还执行了：

```text
git log 4fd4330..HEAD --format=%h %aI %s -- src bin package.json tests/PGA_AB_BENCHMARK_v1_2
```

起始status包含五项用户已有未跟踪路径：eval-v1_2/、preregistration-v1_2-frozen.json、scored-analysis-v1_2.json、scored-summary-v1_2.csv、v1_2-freeze-manifest.json。审计只新增audit-v1_2/；tracked diff为空。

## 重算命令

首次调试完成后执行过一次不重定向的 `node tests/pga-ad-host/audit-v1_2/recompute.mjs`，随后扩充只读核验字段并重复运行下列命令。它们重放现有源、算hash和聚合原始裁决，不启动participant或reviewer：

```powershell
node tests/pga-ad-host/audit-v1_2/recompute.mjs | Out-File -LiteralPath tests/pga-ad-host/audit-v1_2/recompute.console.log -Encoding utf8
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node tests/pga-ad-host/audit-v1_2/supplement.mjs
node tests/pga-ad-host/audit-v1_2/validate-audit.mjs
```

`supplement.mjs`对子进程执行原冻结解析器，共36份。每次精确参数、退出码、stdout/stderr保存在 `frozen-unblind-replay.json`：

```text
node tests/PGA_AB_BENCHMARK_v1_2/organizer/unblind.mjs --key <pair>/key.json --review <pair>/reviewer-N/review.json
```

另执行过四次 `node --input-type=module -e '...'` 的只读输出投影，分别打印：T02候选/T05违规链/错误事件；候选摘要与播放辅助文件mtime；freeze时间/hash/缺字段名单；重渲染异常列表/import列表/manifest空assetHash数量。其完整数据和等价计算都在recompute/supplement脚本及operation-ledger、candidate-and-revision-audit、chronology、reviewer-mapping中，不依赖这些临时输出复现。一次大对象输出被终端截断，审计结论使用保存的完整JSON，而非截断部分。

## 实际输入

- 36份technical.json、36组final源/asset/submission及全部最终帧、对应baseline与allowed-mask。
- 36份run.json、36份REPORT.md、36份logs/events.jsonl、全部已存预览状态；18个D工作区的92候选与64修订。
- 18份key.json、36份review.json与template、全部匿名候选PNG及compare.html、原始reviewer公共材料。
- preregistration、freeze manifest、readiness、execution manifest及archives副本、benchmark SHA256SUMS、pair-order、原分析脚本与汇总（后者只用于结果对比）。
- 当前产品src/package/bin及trial复制品，仅用于hash、编译和理解保护合同；相关AGENTS/CONTEXT/ADR/任务/提示词。
- T06-A-r2保留页面截图、T06-r1/reviewer-2的playback.cjs与时序截图；其余“已删除截图”的自述没有对应本地证据。
- 仅额外读取T06-D-r2 REPORT明确引用的 `C:/Users/admin/.fastctx/jobs/j-ojzdgz/output.log`，确认临时服务启动SyntaxError；内容与hash另存 `referenced-playback-failure-log.json`，没有搜索无关用户目录。

逐文件SHA-256、字节数和mtime见 `read-inputs.json`；原始实验文件审计前快照见 `initial-experiment-inventory.json`。FastCtx额外读取的文档列表以本报告引用为索引。没有读取本机无关凭据或用户私人资料。

## 产物索引

- `audit-report.md`：发现、依据、边界和11项最终问题的结论。
- `complete-tables.md`、`run-level-results.csv`、`paired-matrix.csv`、`reviewer-mapping.csv`：完整表。
- `audit-results.json`、`sensitivity-analysis.json`：独立结果和四种固定情景。
- `freeze-checks.json`、`chronology.json`、`frozen-unblind-replay.json`：冻结、顺序与解析器复核。
- `candidate-and-revision-audit.json`、`operation-ledger.json`、`t05-d-r1-reconstruction.json`：候选与操作证据。
- `t05-d-r1-coordinates.json`、`t05-d-r1-diff.png`：27坐标和数据可视化。
- `t05-a-component-audit.json`、`vision-evidence.json`、`evidence-summary.json`：类型边界与看图证据。
- `v1_3-recommendations.md`、`next-experiment-plan.md`：后续建议；未实施、未运行。
- `recompute.mjs`、`supplement.mjs`、`validate-audit.mjs`：可复现的本地审计工具；不是产品改动。
- `validation.json`：机器交叉断言、输入未改变检查和最终Git状态。

本目录不在Git ignore范围内，可直接作为待审归档目录；本轮未添加到Git索引。
