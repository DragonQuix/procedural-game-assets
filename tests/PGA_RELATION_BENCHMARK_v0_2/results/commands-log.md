# 正式实验命令日志（关键路径，2026-09-30）

独立验证与 merge：
- node --test 'tests/**/*.test.js'（源码 405/405，含 host-only controls）
- cd skills/procedural-game-assets/assets/toolkit && node --test 'tests/**/*.test.js'（packaged 393 PASS / 7 SKIP 环境范围）
- git diff --check；node tools/release.mjs --check（207 文件）；--skill procedural-game-assets-loop --check（132 文件）
- node examples/studio/v14-relation-demo.mjs --out work/zcode-v14-demo（六项断言 + 真实看图）
- node work/verify-order-independence.mjs（关系数组顺序无关性独立验证）
- gh pr merge 2 --merge → 91aaa75；git tag -a v0.8.0 && git push origin v0.8.0
- node tests/PGA_RELATION_BENCHMARK_v0_2/organizer/final-freeze.mjs（D14 FINAL，73 文件，b91c0352…）

Gates 与冻结：
- node tests/PGA_RELATION_BENCHMARK_v0_2/prepare-materials.mjs --check（HASH_CHECK_PASS + identityLint PASS ×12 材料）
- node tests/PGA_RELATION_BENCHMARK_v0_2/organizer/setup-trial.mjs --out … --arm D14|D13 --task C|R（staging PASS，participantCreated=false）
- node work/payload-negative-control.mjs（DRAFT 拒绝 + FROZEN 后 TOOLKIT_HASH_MISMATCH 拦截、干净放行）
- node tests/PGA_RELATION_BENCHMARK_v0_2/organizer/freeze-protocol.mjs（protocol a9ee2f4e…，freeze manifest c50e915b…，种子 e0a14cdf…）
- vision gate：Read vision_A.png / vision_B.png（520e5b2f… / 5c4af46f…）+ 控制答案比对 PASS

正式执行（顺序 = 冻结 runOrder）：
- node tests/PGA_RELATION_BENCHMARK_v0_2/organizer/prepare-runs.mjs（12/12 staging PASS）
- 每 run：launchParticipant（gate PASS + PROMPT 哈希核验）→ ZCode 派出全新 participant 子代理（guest 只在 staged/ 内工作）
- node tests/PGA_RELATION_BENCHMARK_v0_2/organizer/freeze-execution.mjs（12 run 执行冻结，60 文件，90d31fd8…）
- node tests/PGA_RELATION_BENCHMARK_v0_2/organizer/evaluate-runs.mjs（12/12 机械评估：各臂 kit 编译 + 同一 evaluator）
- node tests/PGA_RELATION_BENCHMARK_v0_2/organizer/build-reviews.mjs（6 对盲评包，X/Y 映射与冻结协议一致）
- 12 个 reviewer 子代理（各自 reviewer-N/ 目录；真实 Read 图像 + 自报 SHA-256）
- 4 次 reviewer schema 归一（由 reviewer 本人执行；见 report.md 干预记录）
- node tests/PGA_RELATION_BENCHMARK_v0_2/organizer/analyze.mjs（隔离 PASS → 解盲 → 冻结规则聚合 → GO）
- node tests/PGA_RELATION_BENCHMARK_v0_2/organizer/archive-verify.mjs（reviewer 哈希机械比对 12/12 一致；metrics.csv）
