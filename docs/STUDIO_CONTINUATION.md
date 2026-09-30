# Studio 临摹路线续接说明

更新时间：2026-09-30。适用起点：工具包 0.9.2 / Studio v1.5 alpha。
本文件是清空会话后的工作入口，不替代领域合同或验证记录。

## 先读与执行边界

实施 Agent 先读根 AGENTS.md、CONTEXT.md、docs/PLAN.md、docs/studio-raster.md，
以 CONTEXT.md 和 docs/adr/ 为术语、模块边界和架构决策来源。
重点 ADR：0001 核心/IO、0002 坐标、0004 共享烘焙、0009 事务、0014 位图。
当前没有 CONTEXT-MAP.md；若以后建立则按其定位子域。
方向见 docs/plans/studio-reference-translation.md；实际证据见 docs/verification.md S11、S11.1、S11.2。

- Windows/PowerShell，中文交流、文档和提交；本地文件优先 FastCtx，手工编辑用 apply_patch。
- 不默认启动子代理，不改用户级技能安装、循环版载荷、旧实验或参考原图。
- 开发源先改，普通载荷只用 node tools/release.mjs 生成，不手改派生产物。
- 每轮按职责原子提交。用户本次已要求提交并推送；先核对远端，不强推、不 amend、不覆盖他人改动。
- 运行目的是改进项目，**不是获得满意的运行结果**。允许继续打磨样图，前提是过程或发现
  能沉淀为通用工具、技能指导、支持边界或维护判断；不能误读为“禁止打磨样图”。
  补证前说明项目收益与信息缺口，证据足够就停止；不以全绿、截图数量或样图漂亮程度为目标。

## 用户要的能力

Agent 实际看用户角色设计，通过 Studio 创建和修改，再用自身看图能力检查并决定接受/回退。
允许空白绘制、现有配方、PNG 导入或外部生成，不要求全部在 Studio 内完成。
不把 Studio 变成自动理解/评审模型，不要求任意角色套固定 humanoid 模板。
明确临摹时保留角色身份，画风/造型变换按用户授权；质量标杆和身份参考不是同一概念。
技术通过不等于视觉通过，也不默认套循环版双批次独立评审。

## 已交付

- 0.9.0：pga-studio/raster/1，单帧、边长 1..256、二值 alpha、内嵌规范化 RGBA。
  空白/PNG 创建、region+mask 下的绘制/透明擦除/替换、anchor/attachments、候选/恢复/幂等/导出。
  PNG 最多 4 MiB，部分颜色管理/朝向/动画语义拒绝；不自动缩放、去背或量化。
  无跨修订区域冻结，protection=NOT_CONFIGURED；不是任意图层/动画编辑器。
- 0.9.1：path 连续折线、显式 canvas-pixels 输入；默认仍为 region-local-pixels。
  path 2..128 点，默认不闭合，closed=true 也不填充；每次 line/path 合计最多 512 线段。
  原身体修整轨迹只读回放从 148 条压到 70 条，可由两次编辑合为一次，文档与像素完全相同。
  这只证明表达简化，不证明视觉质量或模型成功率提升。
- 0.9.2：位图 edit 接受前直接返回 light/silhouette/observation；绘制/替换还返回
  selection/crop/cropDisplay。基准裁切按候选隔离；JSON 绑定 revision、candidateId 和哈希。
  旧候选及幂等请求不自动补材料；重新 edit 用新 request-id，不能直接修改历史。

主要实现：src/studio/raster-doc.js、src/adapters/studio-store.js、src/adapters/studio-files.js、
src/studio/dispatch.js、src/studio/observe.js、bin/pga-studio.mjs。
通用样例：examples/studio/raster-mark.draw.json、examples/studio/raster-path.draw.json。

已完成原子提交：

- 1e321c6：0.9.0 开发源；5037835：0.9.0 普通载荷。
- 2f64f51：0.9.1 开发源；42bcff5：0.9.1 普通载荷。
- 6438537：0.9.2 开发源；6e30f01：0.9.2 普通载荷。

当前分支 master，远端 origin 为 https://github.com/DragonQuix/procedural-game-assets.git。
续接时以 git status / git log / 远端查询核实实际状态，不把本文当成永久的同步证明。

## 当前样图与本地证据

用户原图：C:/Users/admin/Downloads/0000.png，只读。
Agent 已看图：暗甲、橙色面甲/装甲纹路、长黑发、交叉背带、袍面符文、护膝。
当前选择 128×256 正面单帧透明背景；不是用户锁死的最终尺寸，可按使用要求重新评估。

以下路径均相对仓库，位于 gitignored 的 work，不会随 Git 推送：

- work/reference-knight/workspace：Studio 工作区，head=r6。
- work/reference-knight/export/ember-knight.studio.json：自包含编辑源。
- work/reference-knight/final/ember-knight.native.png 与 ember-knight.display.png：最后资产图。
- work/reference-knight/reference-R.png：原图副本。
- work/reference-knight/pilot-evidence.json、refinement-evidence.json：修订、局部修复与判断记录。
- work/reference-knight/browser-preview.png：实际 CanvasBank 静态预览截图，1x 完整、2x 局部。
- work/raster-reference-pilot.mjs、raster-reference-refine.mjs、raster-reference-finish.mjs：
  一次性试验脚本，只作轨迹来源，不直接重跑（会继续修改工作区/覆盖报告），不当通用维护模块。

最终 documentHash=3b0918c5，renderHash=0b9b5119:8e0cacc3。
三次局部修改选区外差分均为 0；Agent 自检 **NOT_YET**：手部块状，材质、头发、面甲粗略。
不是独立认证，未证明普遍可靠临摹、尺寸迁移、风格迁移或动画。临时浏览器标签和服务器已关闭。
work 文件如缺失，不要求重建整套样图证据；先用通用 fixture 处理可复用问题。

## 测试事实

- 0.9.2 开发源运行：node --test "tests/unit/studio-raster*.test.js" "tests/integration/studio*.test.js" tests/integration/skill-release.test.js
  74 PASS / 0 FAIL。载荷目录同范围但不含 skill-release：73 PASS / 0 FAIL。
  日志 work/studio-raster-preview-source-tests.log、studio-raster-preview-payload-tests.log。
- 普通发行清单 216 文件；循环版保持原 132 文件，只读核对、不重建。
- 0.9.0 曾跑较广回归：过滤旧断言后 433 PASS；普通载荷 406 PASS / 8 SKIP。
  不是 0.9.2 的全套重测结果。0.9.1 的 20/19 相关回归见 S11.1。
- 已知旧断言：tests/integration/benchmark-e2e-v03.test.js 中
  “24 participants / 12 pairs / 24 independent reviewers planned; no formal data”
  仍要求正式实验数据不存在，但提交 376f563 已归档数据。未为凑绿删除数据或改旧测试。
  如运行全套应如实报告此边界，不能宣称全部通过，也不接管旧实验。

## 建议的下一步

1. 实际打开用户参考和最后样图，选择一个有明确项目收益的局部问题，例如手部轮廓修整。
   先写一句待验证假设：现有 path/画布坐标/候选裁切是否足够让 Agent 不借助专用脚本完成局部调整，
   当前欠缺的是绘制操作、观察信息、通用指导，还是 Agent 自身视觉/造型能力。
2. 从自包含编辑源建立新的 work 工作区，保留 r6 和旧 evidence。用现有 JSON CLI 创建候选，
   实际看 candidate 的 crop/native/display，再接受或放弃；勿先提交后看图。
   一到两次有目的修整用于找缺口，不预设必须出新 API，不把不断重画当作开发成果。
3. 有重复/可迁移的缺口才改开发源或技能指导，并加能防退化的最小测试；
   如工具已足够，则记录这一有限结论，转入一个更小尺寸的细节重组问题。
4. 尺寸迁移目前未做。不要先写通用 resize 冒充临摹：目标尺寸、细节保留、锚点/附件点变换、
   跨尺寸观察和事务如何表达需要先定位一个真实缺口。之后再考虑第二种角色结构，动画后置。

保持方向：用户提供设计后，Agent 能通过可观察、可修改、可回退的工具把它翻译成游戏资产。
不要把工作重新引向通用关系求解器、完整 GUI、强制模型服务、无限评审或漂亮报告。
