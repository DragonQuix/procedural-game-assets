# v0.3 Participant Launch Prompt（host adapter wrapper 存档）

实际 expose 文本 = 本模板 + 替换 `<TRIAL_DIR>` 为该 run 的 staged 绝对路径。
冻结的任务语义在 `staged/task/participant.md`；本 wrapper 只提供路径与访问边界，不改变预算、
记账、两臂能力或任何 benchmark 语义。模板哈希随 host-events 逐 run 记录（实发文本 sha256）。

---

你是本 trial 的独立 participant。你的唯一工作目录（trial 根）：

<TRIAL_DIR>

除该目录及其子目录外，不得读取、写入或执行任何仓库文件、用户级技能、历史实验资料；
不得访问其他 arm、其他 repeat、其他 participant 或 reviewer 的目录、控制样本或任何汇总结果。

按顺序开始：

1. 读 `<TRIAL_DIR>\task\TASK.md`、`<TRIAL_DIR>\task\task-contract.json`、`<TRIAL_DIR>\run-config.json`。
2. 读 `<TRIAL_DIR>\task\participant.md` —— 它是本任务的冻结说明；两臂的操作差异以它为准。
3. 实际查看基线图像：用 Read 打开 `<TRIAL_DIR>\task\observation\baseline.native.png` 与
   `<TRIAL_DIR>\task\observation\baseline.display.png`。路径或哈希不等于已看图。
4. 按 participant.md 中你 arm 对应的分支操作：
   - arm=A：编辑 `<TRIAL_DIR>\asset.mjs`；可使用并编辑 `<TRIAL_DIR>\kit\src` 下的
     core/geometry/bake/recipes/export 与 `kit\docs\recipe-guide.md`；完整 PixelPainter 可用。
   - arm=D14：在 trial 根目录通过 `node run.mjs studio <command>` 使用冻结 Studio CLI；
     先 `node run.mjs studio inspect`；不要手改 ws、kit、start.json 或候选文件；wrapper 自动提供 --ws。
5. 统一观察：在 trial 根目录执行 `node run.mjs observe`；部件裁切 `node run.mjs observe --node node.id`；
   D14 可 `node run.mjs observe --candidate c-xxxxxxxx`。观察产物写在 trial 的 observations/ 下，
   用 Read 实际查看 PNG（native 与 display）后再做判断。
6. 最终提交只用 `node run.mjs submit`。提交后本 trial 冻结，不得再改。

所有 shell 命令都在 trial 根目录执行，例如：
`cd "<TRIAL_DIR>" && node run.mjs observe`

预算与记账、禁止事项、协议边界一律以 `participant.md` 原文为准。

完成后最终报告必须包含：`submit` 返回的 JSON、最终 candidateCount、
你实际查看过的图像文件清单（相对 trial 根的路径）。
