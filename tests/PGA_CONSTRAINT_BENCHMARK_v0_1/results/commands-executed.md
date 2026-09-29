# Commands executed — PGA_CONSTRAINT_BENCHMARK_v0_1（2026-09-29）

协调器执行的主要命令序列（均在本仓库根目录；控制/取证脚本位于 work/，不入库）。

## 1. 执行前验证

```bash
pwd; git status --short; git branch --show-current; git remote -v
git rev-parse HEAD                      # 37317b5ce537b3147604d816bc207283e07ce252
git describe --tags --exact-match HEAD  # v0.7.0
git log --oneline --decorate -n 15
node tests/PGA_CONSTRAINT_BENCHMARK_v0_1/prepare-materials.mjs --check
# 机械搜索：protocol-frozen / freeze-manifest / key.json / review.json / runs / reviews / results → 0
```

## 2. Vision Gate（非计分控制）

```bash
node work/vision-gate-control/make-vision-controls.mjs          # 生成 3 张 control PNG + key
sha256sum work/vision-gate-control/*.png
node work/vision-gate-control/inspect-model-io.mjs <model-io.jsonl>     # image 内容块核对
node work/vision-gate-control/inspect-rollout-generic.mjs <snapshots…>  # 通用证据提取
# 控制代理：V1/V2/V3（视觉）、A/B（nonce 隔离）；详见 work/vision-gate-control/vision-gate-evidence.md
```

## 3. Runner Gate（非计分机械 control）

```bash
# D12：create → 非法 edit（REJECTED）→ 控制解 edit → explore → commit → export
# D13：create → inspect → 非法 edit（REJECTED_UNSAFE+safeDomain）→ explore → 语义 edit → commit → submit
# 工作区：work/runner-gate-control/{D12-G,D13-G}；评估冒烟：evaluate-run.mjs 于 CTRL-D12/CTRL-D13
```

## 4. 冻结

```bash
node tests/PGA_CONSTRAINT_BENCHMARK_v0_1/organizer/freeze-verification.mjs            # 逐文件核验+聚合探测
node tests/PGA_CONSTRAINT_BENCHMARK_v0_1/organizer/freeze-verification.mjs --freeze   # 生成 protocol-frozen/freeze-manifest
sha256sum tests/PGA_CONSTRAINT_BENCHMARK_v0_1/{protocol-frozen,freeze-manifest}.json
```

## 5. 正式执行（12 run，按冻结 runOrder；T02/T03/T05/T08/T10/T11 首轮作废后重跑）

```bash
node tests/PGA_CONSTRAINT_BENCHMARK_v0_1/organizer/setup-trial.mjs --trial-id Txx --task G|P --arm D12|D13 --runs-dir …/runs --shared-kit …/frozen/D13-0.7.0-4cd1666
node tests/PGA_CONSTRAINT_BENCHMARK_v0_1/organizer/instantiate-prompt.mjs --trial-id Txx --runs-dir …/runs
# 每run一个全新后台代理；运行中复制其 model-io rollout 快照至 runs/<T>/host-evidence/
```

- 首轮：T01,T04,T06,T07,T09,T12（D12，保留为正式数据）；T02,T03,T05,T08,T10,T11 误装 frozen/D13（INT-01）→ 全部产物移 runs-invalid/。
- 重跑：T02,T03,T05,T08,T10,T11（setup 已改为按 manifest.toolkits[arm].path 解析并逐文件核验）。
- 每个参与 run 的代理 ID 与快照清单见 runs/<T>/host-evidence/summary.json。

## 6. 冻结执行产物与统一评估

```bash
node tests/PGA_CONSTRAINT_BENCHMARK_v0_1/organizer/build-execution-freeze.mjs --runs-dir …/runs --trial-map … --out …
# execution-freeze-manifest.json SHA-256 02f6d183a81a67e9c986905fbc44ac0e92f8d35e24a6f5413d1c1408cdbbbe10
for T in T01 … T12; do node …/organizer/evaluate-run.mjs --trial …/runs/$T --trial-map …; done
```

## 7. 盲评与解盲

```bash
mkdir -p …/reviews
node …/organizer/build-blind-packages.mjs --runs-dir …/runs --reviews-dir …/reviews --trial-map …
# 12 个全新评审代理（每对 2 个，MIRRORED_BALANCE）；运行中快照至 reviews/<pair>/<reviewer>/rollout-snapshot.jsonl
node work/vision-gate-control/extract-host-events.mjs <reviewerDir>   # x12
node tools/benchmark/unblind.mjs KEY REVIEW TASK_CONTRACT HOST_EVENTS # 经 analyze.mjs 以库调用等价执行
node …/organizer/analyze.mjs --runs-dir …/runs --reviews-dir …/reviews --results-dir …/results --trial-map …
```

## 8. 归档

```bash
git status; git diff --check
git add .gitignore tests/PGA_CONSTRAINT_BENCHMARK_v0_1/{protocol-frozen.json,freeze-manifest.json,execution-freeze-manifest.json,interventions.md,results/**,organizer/**}
git commit   # 实验归档（中文原子提交）
git push origin master
```
