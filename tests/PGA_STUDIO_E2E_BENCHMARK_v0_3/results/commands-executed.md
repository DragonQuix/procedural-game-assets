# v0.3 正式实验命令日志（摘要）

宿主：ZCode / GLM-5.3-Flash / win32 Git Bash。完整命令在会话轨迹中；此处记录阶段级命令面与关键产物。FastCtx run/run_background 执行。

## A. 独立验证（PR #3 分支 5c0d1a6）

```
gh pr view 3 …                          # OPEN/MERGEABLE/CLEAN，HEAD=5c0d1a6
gh pr checkout 3
node tests/PGA_STUDIO_E2E_BENCHMARK_v0_3/organizer/prepare-materials.mjs --check   # PASS, CANDIDATE_NOT_RUN 0/0/0
node tests/PGA_STUDIO_E2E_BENCHMARK_v0_3/organizer/self-test.mjs                   # 16/16 PASS
node --test --test-reporter=spec "tests/**/*.test.js"                              # 421/421 PASS
node tools/release.mjs --check                                                     # 207 文件哈希一致
git diff --check                                                                    # 干净
git diff --name-status $(git merge-base origin/master HEAD)...HEAD                  # 非 benchmark 改动仅 .gitattributes/.gitignore/tools/release.mjs/integration test
```

## B. 哈希复算（独立脚本，临时目录）

```
node <tmp>/recompute-hashes.mjs <repo>   # A=3b2d5903… D14=b91c0352… shared=d29c28f9… vision/4 task 一致；
                                          # provenance 124 文件逐个对照 git show 91aaa75… 零失败
```

## C. 负控制（临时目录）

```
node <tmp>/negative-controls.mjs <repo>  # identityLint PASS(5F/5P)；reviewGate PASS(10 项)；
                                          # candidateAccounting PASS(9 唯一+复看不计+隐藏层序计新)；
                                          # payloadBeforeAgent PASS(5 类篡改 LAUNCH_BLOCKED/participantCreated=false/taskExposed=false；正序列 expose)
```

## D. 真实宿主 Gates

- Vision Gate：协调者自看 vision_A/B（帆船/绿环+柄）→ spawn 全新 GLM-5.3-Flash context 逐张 Read + 描述（首跑标签互换作废，重验 CONFIRMED，agent_1e2984cb…）。
- Agent isolation：agent_00ae25c6 生成 nonce `ef115489006fe50e` 落盘；agent_72bc5bbd（全新 context）读到文件内容但 prior nonce = "没有"（对话历史不共享；共享 FS 记 limitation）。

## E. Merge 与 master 复验

```
gh pr merge 3 --merge                    # merge commit b911ffc（不 squash/rebase/admin）
git switch master && git pull --ff-only  # b3e43cc→b911ffc
# 五项复验全绿：--check PASS / 16/16 / 421/421 / 207 / git diff --check
node <tmp>/make-freeze.mjs <repo>        # protocol-frozen.json SHA 426880b6…；freeze-manifest 81d9c46d…；mappingSeed f4533200…；modelIdentity SHA bef2f574…
git commit -m "chore: 冻结 v0.3 端到端基准协议与协调器运行框架"   # b1ec878
```

## F. 24 participant runs（3 并发滚动）

每 run（coordinator.mjs，24×）：
```
node results/coordinator/coordinator.mjs <repo> prep <runId>            # prepareTrial+verifyTrial
# spawn 空 bootstrap context（无任务内容）→ agentId
node … register-context <runId> <agentId> zcode-subagent:<agentId>       # context 唯一注册
node … recheck <runId>                                                   # expose 前复验
# SendMessage(agentId, 启动 prompt[模板+trial 路径]) = exposeTask
node … expose-record <runId> recorded-from-session:template-v1 <agentId>
node … finish <runId>                                                    # submission/ledger 摘要
```
24 个 context 全局唯一；两处时序偏差（H-A-r2、K-D14-r2）与 H-D14-r3 补 launch 见 interventions.md。

## G. 执行冻结与统一评估

```
node results/coordinator/execution-freeze.mjs <repo>   # 24 runs，executionFreezeSha256 9c067004…，allSubmitted=true
node results/coordinator/evaluate-all.mjs <repo>       # evaluateTrial×24 + protocolAudit（最终规则：binding.stage 白名单）
node results/coordinator/audit-ws-exports.mjs <repo>   # D14 ws/*.png 内容对账（staging 预览证据链）
```

## H. 盲评与 24 reviewer runs

```
node results/coordinator/build-blind-pairs.mjs <repo>   # 12 pairs，MIRRORED_BALANCE，seed=f4533200…；key→results/private/
node … verify-reviewer <pair> <slot>                     # payload tree 对比
node … bind-reviewer <pair> <slot> <agentId> <sessionId> # review-binding.json（wx）+ context 注册
# SendMessage 暴露评审任务 → reviewer 自写 draft.json → node submit-review.mjs draft.json
```
24/24 SUBMITTED，reviewValidationAttempts 全部 1。S-r2 sheet 误报核查：`check-sheet.mjs` 重建比对（逐字节一致）。

## I. 解盲与分析

```
node results/coordinator/analyze.mjs <repo>   # firstFormalUnblindTimestamp 2026-09-30T12:07:07.104Z；
                                               # analysis.json + summary.csv（taskBreakdown/McNemar/sign）
```

## J. 归档

```
cp reviews/<pair>/reviewer-<s>/submission/review.json → results/reviews-archive/（24 份）
.gitignore += results/private/（盲评 key 不入库）
git add <results 冻结/评估/报告/协调器脚本/24 reviews 副本> && git commit && git push origin master
```
