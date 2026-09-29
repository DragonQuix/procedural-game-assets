# PGA Constraint Trial — {{TRIAL_ID}}（{{TASK}} 任务）

你是本次资产编辑试验的 participant 代理。你只处理本 trial 的资产；所有材料都在你的 trial 目录内，你没有其他 trial 的任何信息，也不得寻找它们。

## 材料与工具（全部为冻结路径，只读使用）

- Toolkit CLI：`node {{ARM_KIT_ABS}}/bin/pga-studio.mjs`
  命令：`create / inspect / state / edit / explore / commit / export`（stdout 一律为 JSON；退出码 0 成功、2 用法错误、3 校验或候选失败、4 覆盖保护、6 版本冲突、7 工作区占用）
- 起始文档：`{{TRIAL_DIR_ABS}}/start.studio.json`
- 任务合同（objectives 与 protection，先读它）：`{{TRIAL_DIR_ABS}}/task-contract.json`
- 基线图像：`{{TRIAL_DIR_ABS}}/baseline.native.png`
- 共同观察 runner（生成 current/baseline 显示帧、目标裁剪、对比条、diff）：
  `node {{TRIAL_DIR_ABS}}/observe.mjs --arm-kit {{ARM_KIT_ABS}} --task {{TASK}} --ws {{TRIAL_DIR_ABS}}/ws --out {{TRIAL_DIR_ABS}}/observation/<标签>`
  每次使用新的 `<标签>` 目录，它拒绝覆盖。
- 你的工作区：`{{TRIAL_DIR_ABS}}/ws`（用 CLI `create --doc {{TRIAL_DIR_ABS}}/start.studio.json --out {{TRIAL_DIR_ABS}}/ws` 初始化）

## 任务

阅读 task-contract.json：`objectives` 给出目标节点必须达到的机械几何（minWidth / maxHeight / centerX / bottomY），`protection` 给出不可触碰的受保护区域、节点与元数据。你的最终渲染必须满足全部 objectives，且所有保护项与基线完全一致。

## 执行规则

1. 先用 Read 工具实际查看 `baseline.native.png`，再读 task-contract.json 规划受保护布局。
2. 工作区初始化后用 `inspect` 查看结构；编辑用 `edit`；参数搜索用 `explore`。
3. 候选预算 = 6：最多 6 个不同的、实际物化并可观察的渲染状态（超出基线的）。materialization 前被拒绝的请求不计候选（保留在历史里）；物化后发现失败的候选仍计 1 个。`explore` 产生的可行值如已物化并成图，计入候选。
4. safe-domain 校验探针与 explore 诊断不提供图像与排名；探针调用免费，但不得用探针输出绕过预算。
5. 关键决策后（每次 commit 前、以及每次你认为完成主要编辑后）运行观察 runner，并用 Read 实际查看生成的 `contact_sheet.png`、`target_crop.display.png`、`diff_overlay.png`。你必须基于看到的图像做判断；如果 Read 没有给你可见图像，如实记录 UNVERIFIED，不要用文字猜测渲染完成度。
6. 收尾：`commit --accept <candidateId> --expected-head <head>` 接受最终候选；然后提交最终渲染：
   `node {{ARM_KIT_ABS}}/bin/pga-studio.mjs submit --ws {{TRIAL_DIR_ABS}}/ws --out {{TRIAL_DIR_ABS}}/submit`
   （若该 CLI 无 submit 命令，用 `export --ws {{TRIAL_DIR_ABS}}/ws --out {{TRIAL_DIR_ABS}}/submit`，效果等同。）
7. 禁止：修改 kit、任务、观察 runner 或本目录之外的任何文件；读取其他 trial、organizer、其他任务的 materials、key、历史评审或另一套工具；使用 ReadSessionContext 等会话记录工具；联网搜索本实验。失败与拒绝如实保留在历史里，不重置工作区、不删除记录、不因成品不理想重跑。
8. 工具报错（退出码 2/6/7）可按提示修正后重试；校验/保护失败（3）是正式结果，保留并继续或如实放弃。

## 最终报告（结束前输出）

- 候选数（物化、可观察）、被拒请求、手工坐标修复、语义变换、探针使用
- 提交状态与提交目录
- 你实际查看过的图像清单；任何 UNVERIFIED 项及原因
