---
name: procedural-game-assets
description: 用程序化资产工具包与轻量 Canvas 模板制作网页游戏——像素角色/机械/植被/道具/地形由代码生成（ASCII 像素图、程序化骨架、确定性种子），启动时烘焙为 Canvas 精灵，模板提供固定步长循环、碰撞、交互与层序。当做游戏没有美术素材可用、要做像素风网页游戏或游戏切片、需要按截图诊断视觉问题时使用。离线 PNG 图集导出与 Godot 适配为可选路径（reference/godot.md）；音频合成见 reference/audio.md（未升级为工具包模块）。
---

# 程序化游戏资产 + Canvas 网页游戏模板

本技能附带**可运行工具包**（`assets/toolkit/`，Node 22+，ES Module），两部分：

1. **资产核心**：像素绘制、ASCII、姿态求解、五类配方、锚点/附件点、画廊审图、
   图集导出、自动化测试。
2. **轻量 Canvas 网页游戏模板**（`assets/toolkit/examples/canvas-slice/`）：
   固定步长循环、键盘输入、暂停/重启、精灵动画、镜头、AABB 碰撞、射击交互、
   场景/自发光/HUD 层序、粒子与受击白闪、`step(n, input)`/`state()` 测试接口。

**优先使用工具包与模板并修改数据；不要照着本文档重写绘制器、导出器或游戏循环。**

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

1. **定风格样本**：分辨率、角色占屏比例、描边、材质色阶、玩家/危险/背景优先级。
2. **做资产**：复制最近的模板配方（`examples/recipes/`，参数见
   `docs/recipe-guide.md`），`validate` → `bake --bmp --scale 4` → 画廊审图。
   先修轮廓与比例，再修动作与附件点，最后调色阶与细节。
3. **复制模板改内容**（推荐用上面的 init-project 自动完成）：换配方、改
   `template/demo-content.js` 的关卡/敌人/手感，达成"移动 + 一种交互 + 明确胜负"
   的最小闭环。规则只加在 `template/logic/`（无 DOM、可 node 测试），
   表现只放 `template/render/`。文字用 DOM HUD（`template/render/hud.js`），
   不要在低分辨率场景画布上 `fillText` 小字（放大后破碎；位图字体为可选替代，
   见 `reference/visual-diagnosis.md`）。输入契约：点按经 `pressed` 离散事件
   消费，暂停中及暂停/重启当帧丢弃游戏输入（详见 `reference/toolkit-api.md`）。
4. **浏览器验收**：实际画面与操作（移动/交互/胜负/反馈），
   用 `?preset=` 定格复现关键状态截图；日夜背景下确认可读性；
   文字另查原尺寸、常用放大尺寸与非整数缩放（dsf 1.25/1.5 或页面缩放）。
5. **测试与记录**：`node --test` 全过；写下可复现的运行步骤。
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

## 切片验收标准

- 新角色与场景和默认示例明显不同；移动、一种交互、明确的成功或失败状态；
  动画与视觉反馈（白闪/粒子等至少其一）。
- 浏览器实际画面与操作验证（截图留证），不是"测试通过"就算完。
  截图覆盖原尺寸、常用放大尺寸与非整数缩放；窄屏一次。
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
