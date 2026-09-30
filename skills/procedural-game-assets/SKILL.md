---
name: procedural-game-assets
description: 用程序化资产工具包与轻量 Canvas 模板制作网页游戏：角色、道具、地形等由代码生成，启动烘焙为 Canvas 精灵，模板提供循环、碰撞与交互。用于缺少美术素材、制作像素风网页游戏或按截图诊断视觉问题；有标杆时追求同等级质量而非复制，并检查整体美学与实际游戏画面。离线图集、Godot 与音频为可选参考；严格独立长循环另用 procedural-game-assets-loop。
---

# 程序化游戏资产 + Canvas 网页游戏模板

本技能附带**可运行工具包**（`assets/toolkit/`，Node 22+，ES Module），两部分：

1. **资产核心**：像素绘制、ASCII、姿态求解、五类配方、锚点/附件点、画廊审图、
   图集导出、自动化测试。
2. **轻量 Canvas 网页游戏模板**（`assets/toolkit/examples/canvas-slice/`）：
   固定步长循环、键盘输入、暂停/重启、精灵动画、镜头、AABB 碰撞、射击交互、
   场景/自发光/HUD 层序、粒子与受击白闪、`step(n, input)`/`state()` 测试接口。

**优先使用工具包与模板并修改数据；不要照着本文档重写绘制器、导出器或游戏循环。**
现有配方是起点，不是质量上限。视觉目标是完整、协调、专业的游戏画面，不只是能运行。

## 快速入口

```powershell
cd <技能目录>/assets/toolkit
node --test "tests/**/*.test.js"       # 先确认全绿（模板逻辑层也在其中）
node tools/static-server.mjs . 47850
# 浏览器打开 http://127.0.0.1:47850/examples/canvas-slice/        模板演示（可玩）
#           http://127.0.0.1:47850/examples/canvas-slice/?preset=fight  定格验收状态
node bin/pga.mjs gallery --dir work/out --port 47840   # 资产画廊（先 bake/export 到 work/out）
```

## 干净目录开始自己的游戏（携带隔离，0.3.0 起）

```powershell
node <技能目录>/assets/toolkit/tools/init-project.mjs <新目录> --name <游戏名>
cd <新目录>
npm test          # 模板冒烟测试
npm run serve     # → http://127.0.0.1:47850/game/
npm run check     # 携带完整性 + 项目身份校验
```

init 做三件事：把工具包按发行清单携带到 `vendor/pga/` 并逐文件 sha256 复核
（缺失/损坏/多出都失败，不静默忽略）；在项目根建立**游戏自己的** package.json、
CONTEXT.md、README.md；把模板复制为 `game/` 并把 import 改写成指向
`vendor/pga/` 的相对路径。项目名不得与工具包同名（写入前校验，同名直接拒绝；
目标目录已有 package.json 时同名同样拒绝且不改动它）。工具包的 CONTEXT.md 与
`.pga-release.json` 只管理 `vendor/pga/` 副本，项目根文件不受清单约束——
同名文件各归各，没有例外条款。
游戏代码只经相对路径引用 `vendor/pga/`，不依赖开发仓库、原游戏或全局技能目录。
改游戏只动 `game/` 与 `tests/`；`vendor/pga/` 视为只读（改了会被 `npm run check` 报出）。

## 制作一个网页游戏切片（推荐顺序）

1. **定质量目标与风格样本**：先读 [视觉质量标准](assets/toolkit/docs/visual-quality.md)。
   有标杆先实际看图，分开质量标尺、用户明确约束与原创空间，不默认复刻角色和配色。
   无标杆按任务确定风格与质量目标，不强制补图；明确分辨率、角色占屏比例和视觉主次。
2. **做资产**：复制最近的模板配方（`examples/recipes/`，参数见
   `docs/recipe-guide.md`），`validate` → `bake --bmp --scale 4` → 画廊审图。
   先看正常尺寸下的整体效果，按实际质量差距修形色、动作与局部完成度，不默认堆细节。
3. **复制模板改内容**（推荐用上面的 init-project 自动完成）：换配方、改
   `template/demo-content.js` 的关卡/敌人/手感，达成"移动 + 一种交互 + 明确胜负"
   的最小闭环。规则只加在 `template/logic/`（无 DOM、可 node 测试），
   表现只放 `template/render/`。文字用 DOM HUD（`template/render/hud.js`），
   不要在低分辨率场景画布上 `fillText` 小字（放大后破碎；位图字体为可选替代，
   见 `reference/visual-diagnosis.md`）。输入契约：点按经 `pressed` 离散事件
   消费，暂停中及暂停/重启当帧丢弃游戏输入（详见 `reference/toolkit-api.md`）。
4. **浏览器验收**：先审完整画面的整体美学、场景/HUD/资产协调，再验证操作
   （移动/交互/胜负/反馈）；用 `?preset=` 定格复现关键状态截图，实际播放动画，
   在游戏使用的背景下检查可读性，包含日夜变化时两者都看；
   文字另查原尺寸、常用放大尺寸与非整数缩放（dsf 1.25/1.5 或页面缩放）。
5. **测试与记录**：`node --test` 全过；写下可复现的运行步骤。
   视觉单独记录 `PASS / NOT_YET / UNVERIFIED`、证据与差距；不把测试通过当成视觉通过。
   记录证据时区分注入快照 / 真实键盘事件 / 预设定格 / 状态注入 / 人工试玩，
   脚本通关 tick 不换算成真人时长（规则见 `reference/visual-diagnosis.md` 证据纪律）。

## 职责边界（不要混层）

- **资产生产**（`src/recipes/` 等）：只接收显式参数与种子；同配方同种子同输出。
- **游戏逻辑**（`template/logic/`）：无 DOM、固定步长、固定种子；
  状态经 `state()` 快照断言；输入经快照注入。碰撞规则属于这里，不属于资产库。
- **表现**（`template/render/` + `src/adapters/canvas.js`）：把状态画出来，
  不做判定；像素全部来自启动烘焙缓存，运行时不得逐帧重新生成。

## 接入路径（ADR-0004，共享烘焙核心）

- **启动烘焙（默认）**：`createCanvasBank({ assets: [bakeXxx(spec)...], makeCanvas })`，
  精灵与变体（镜像/白闪）按需缓存。
- **离线导出（可选部署）**：`bin/pga.mjs export` → PNG 图集 + 版本化 manifest；
  与启动烘焙同源，往返切回帧逐像素一致（有测试）。

## PGA Studio：文档驱动的资产创作层（0.8.0 / Studio v1.4 alpha，ADR-0008–0013）

面向具备视觉判断的 agent：不必手写绘图代码，用**可编辑 JSON 文档**逐步制作资产，
经共享烘焙核心渲染、预览、保护与导出。入口与完整合同：
[Studio CLI 指南](assets/toolkit/docs/studio-cli.md)（`bin/pga-studio.mjs`，
stdout 纯 JSON；样例与演示在 `assets/toolkit/examples/studio/`）。

```powershell
cd <技能目录>/assets/toolkit
node examples/studio/smoke.mjs --out work/studio-smoke      # M1：文档→渲染→导出
node examples/studio/edit-demo.mjs --out work/studio-m2      # M2：探索→保护→接受→恢复
node examples/studio/m5-demo.mjs --out work/studio-m5        # M5：角色跨帧修改+播放页
node examples/studio/v13-demo.mjs --out work/studio-v13      # v1.3：最终保护与联动几何
node examples/studio/v14-relation-demo.mjs --out work/studio-v14 # v1.4：显式关系与保护
node bin/pga-studio.mjs create --doc examples/studio/terminal.studio.json --out work/ws
node bin/pga-studio.mjs explore --ws work/ws --base r1 --op geometry.set --target terminal.shell --field w --values 24,26,28
```

当前支持范围（如实标注，不超出声明）：

- **静态道具**（`pga-studio/1` 矩形、`pga-studio/2` 多边形/圆形/体积概括）与
  **一个角色**（锈爪 humanoid 数据面，13 帧 4 剪辑，跨帧一致修改）。
- 编辑事务：有限操作（geometry/material/ramp/palette/rig/art.set）、同基准候选探索与去重、
  像素/结构/元数据保护、接受/恢复/过期拒绝、幂等重试；错误候选不会污染已确认版本。
- 观察：native/display 预览、节点定位、受影响帧与附件点报告、自包含播放页（真实播放）。
- 每步命令都有可复查的修订/候选记录与真实 PNG，不是"接口占位"。
- `/3` 静态文档可携带资产级 protection；inspect --node 返回当前修订的安全域，
  widen_about_center / squash_keep_base / resize_about_anchor 自动补偿位置。
  不把多个单变量安全域任意组合；非法值不 clamp，旧修订结果需重新 inspect。
  commit 与 export/submit 都复验最终 RGBA/元数据。NOT_CONFIGURED 不是全局保护通过。

- **v1.4 显式关系**：/4 relations 用稳定 nodeId+feature 声明 contact；inspect 直接报告 gap/overlap。
  三个矩形语义变换支持 preserveRelations=true 或关系 ID 数组，只按声明 follower/policy 修复。
  required relation 与 protection 最终必须 AND 通过；不按节点名称猜依赖，不是通用 solver。
  支持 translate-follower / resize-follower-edge；冲突、非整数或未支持关系均拒绝。
  工程自检不等于独立认证，v0.2 正式模型实验未执行，不宣称 agent 收益。

明确边界：**不是**严格资产循环（Studio 候选是快速试错，不等于循环版冻结候选或 WOW；
严格交付仍走 `procedural-game-assets-loop` 的独立评审）；没有 GUI/MCP/云服务；
样例是工程示意图，不代表美术质量上限——视觉验收仍按本文"视觉评审与普通版边界"执行。
后续阶段（风格尺度规则、更多资产族、对照评测、发行范围扩大）见
`docs/plans/agent-studio.md`（开发仓库内文档，不在载荷中）。

## 关键约束

- 坐标契约：锚点/附件点为帧内像素边界坐标；相对偏移 `attachment - anchor`；
  镜像点 `W-x` ≠ 镜像像素 `W-1-i`（`docs/adr/0002`）。
- 帧约束显式：越界默认烘焙失败；先放大帧或改数据，不滥用 `clip:'warn'`。
- 确定性：禁止 `Math.random()` 进配方与逻辑层；视觉粒子用独立随机源实例。
- 截图状态可复现：固定种子、固定 tick、画廊 URL 视图状态或 `?preset=`。

## 视觉诊断路径

症状 → 优先检查（详见 `reference/visual-diagnosis.md`，含植入故障演练）：
看不出是什么→剪影/比例/识别特征；跑步滑行→接地帧/相位/连续条；
武器脱手→肩/握点/枪口共用坐标；夜里找不到→夜间背景+对比视图；
烘焙越界→帧约束与诊断计数；截图不同→固定种子与视图状态。

## 视觉评审与普通版边界

完整范围和准则见 [视觉质量标准](assets/toolkit/docs/visual-quality.md)：

- 整体美学、设计组织、色彩层级、表现完成度、实际使用、系列/完整场景都要检查；
  按类型补充角色、地块、特效或动画要求。单项资产任务不额外强加完整游戏。
- 有参考依据的维度评 `BELOW / ON_PAR / ABOVE / NOT_COMPARABLE`；目标是同级，非复制。
  静态参考不能证明动态质量，按独立动作要求验证；无标杆不编造同级结论。
- 整体美学具有独立否决权，须说明可见现象和影响；不靠总分、相似度或个人偏好放行。
  差异不等于缺陷，简洁不等于低档，细节更多也不自动更好。
- 普通版采用轻量记录与任务内返修，不要求独立子代理、盲比封存、双批次或无限迭代。
  有独立评审如实记录来源，没有则注明制作代理自审；严格长循环另用循环版。

## 切片验收标准

- 新角色与场景和默认示例明显不同；移动、一种交互、明确的成功或失败状态；
  动画与视觉反馈（白闪/粒子等至少其一）。
- 浏览器实际画面与操作验证（截图留证），不是"测试通过"就算完。
  截图覆盖原尺寸、常用放大尺寸与非整数缩放；窄屏一次。
- 整体美学及适用视觉维度通过；要求参考同级的部分为 `ON_PAR` 或 `ABOVE`，
  关键范围无漏评，无未解决的重大缺陷。画廊单图、总分或新角色与示例不同都不能替代审图。
- `node --test` 全过；运行步骤可复现（静态服务命令 + URL）。
- 项目根是游戏自己的身份（package.json 名称/版本/描述、CONTEXT.md），
  工具包只在 `vendor/pga/`；`npm run check` 哈希校验通过。
- 派生产物不写开发机绝对路径；不声明未验证的能力（真人时长、宿主发现链路等
  没有真人/新会话证据时标注"未验证"）。

## 可选适配

- **Godot**：`reference/godot.md` 与 `examples/godot/`（Godot 4.6.2 实测过），
  按需读取，不是安装、使用或验收的前提。
- **音频**：`reference/audio.md`（上一版保留的合成音效/芯片音乐参考），
  可用但未升级为工具包模块，不要声称已由本工具包覆盖。

## 多宿主入口

单一真相源是主存储（`.codex/skills/procedural-game-assets`，哈希校验过的版本）。
各宿主以链接指向主存储（与 anysearch 同形态）：

- Codex（`.codex/skills` + `.agents/skills`）：`scripts/install.mjs`
- Claude Code / Cursor / DeepSeek Harness / ZCode / workbuddy / Grok build / Kimi Code：
  `node scripts/register-harnesses.mjs`（幂等；预置真实目录会备份到发现目录之外）
- OMP 无自有 skills 目录：经其 `skills.customDirectories`（指向 zcode/grok/dsh/
  workbuddy/cursor 的 skills 目录）间接生效，无需单独入口。

每个宿主都要各自重启或新开会话后才会刷新技能列表——脚本无法代替该验证。

## 版本与回滚

技能与工具包版本绑定（`assets/toolkit/package.json` 与 `.pga-release.json` 哈希清单）。
安装脚本在安装前把旧版备份到发现目录之外（默认 `.codex/backups/skills/procedural-game-assets/`）；
回滚 = 删除主存储与入口，把备份目录改回原名（`scripts/install.mjs`）。
旧版 `reference/pixel-art.md` 伪代码骨架已被可运行工具包取代，不再随附。
