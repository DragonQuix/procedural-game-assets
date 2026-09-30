# 独立资产修改任务

只读取当前 trial。先读 `task/TASK.md`、`task/task-contract.json` 和 `run-config.json`，
实际查看 baseline 图像；路径或哈希不等于已看图。不要查看其他 arm、repeat、控制样本、
历史结果、reviewer 资料或汇总。宿主须记录真实 image model input。

若 arm=A：编辑 `asset.mjs`，可以使用和编辑 `kit/src/core`、`geometry`、`bake`、`recipes`、`export`
中的现有底层能力；`docs/recipe-guide.md` 在 kit 中。完整 PixelPainter 提供 set/rect/line/poly/ellipse/blit/map。
不要使用 Studio 文档 API、safe-domain、relation evaluator、semantic transforms 或候选管理。
render 返回命名 layers、width、height、anchor、attachments；layers 为真实绘图结果，不是自报验收。

若 arm=D14：使用 frozen Studio CLI，通过 `node run.mjs studio inspect` 查看现有能力。
所有修改通过 `edit`、`explore`、`commit`，可用 safe-domain、protection、relations 和现有语义几何。
不要手改 ws、kit、start.json 或候选文件。完整命令合同见 `kit/docs/studio-cli.md`。
wrapper 自动提供 `--ws`，不要重复传入。例如：
`node run.mjs studio edit --base r1 --op geometry.set --target node.body --params '{"w":30}'`
任务是否有这个节点以 inspect 为准；示例不是推荐答案。

两臂统一观察：`node run.mjs observe`；指定部件裁切：`node run.mjs observe --node node.id`。
D14 可以 `node run.mjs observe --candidate c-xxxxxxxx` 查看未提交候选。
输出包括 baseline/candidate native、最近邻 display、task crop、diff、外置稳定标签 contact sheet。
Candidate A/B 在观察中分别表示 baseline/current，不是实验 arm。用文件名或稳定 Node ID 引用对象。
最终只用 `node run.mjs submit`。Studio 的 `export` 不是 benchmark finalization。

最多 8 个物化可观察状态。源码保存、无图 validation probe、物化前拒绝不计；
edit/explore 已产生的候选图计入，即使未打开、未采用或机械失败。不得绕过 wrapper 私自出图；
宿主将审计漏记的图像，无法核实则协议 UNVERIFIED。超预算不删除历史，最终预算 FAIL。
同像素且同有序部件像素/元数据不重复计数，改注释不产生新 candidate。
保留 source、日志与错误，不修改 task/shared/run.mjs/run-config.json/ledger.json 或 final。
完成不代表视觉通过；不要访问或代写评审。
