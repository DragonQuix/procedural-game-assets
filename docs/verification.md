# 验证记录 — procedural-game-assets

本文件记录工具包自身的验证证据。**原项目（others_003）的 119 项测试与性能数字属于原项目，不是本工具包的结果**（见 `docs/provenance.md`）。

环境：Windows，Node v22.23.2，Godot 4.6.2-stable（仅此版本，不宣称全 4.x）。

## 自动化测试

| 时间 | 范围 | 结果 |
|---|---|---|
| 2026-09-26（P1） | `node --test`：栅格/变换/ASCII/确定性 | 35/35 |
| 2026-09-26（P2） | + 姿态/烘焙/英雄军团 60 帧逐像素回归（基线见 `tests/fixtures/baseline/`） | 59/59 |
| 2026-09-26（P3） | + 图集打包/清单/导出往返/CLI（中文空格路径、覆盖保护、确定性） | 72/72 |
| 2026-09-26（P4） | + 机械/植被/道具/地形配方与接缝断言 | 83/83 |
| 2026-09-26（P6） | + 消费契约（枪口点落枪端像素、锚点贴脚底、镜像 W-x、剪辑时长） | 87/87 |
| 2026-09-26（P7） | 技能载荷独立运行（`skills/.../assets/toolkit` 与已安装位置 `.codex/skills/...`） | 87/87（两处） |

关键回归：ember + legion 族 60 帧与原项目生成器（提交 bd1cf1a）逐像素一致；
原 38×46 帧底边越界以 `clip:'warn'` 显式声明并逐帧记录诊断。

## 视觉验收

见 `docs/visual-review.md`：P2 角色、P4 四类资产、P5 植入故障、P6 消费样例，
均以实际 BMP/浏览器截图/Godot 截图为据，不以单测通过代替审图。

## Godot 验证（4.6.2-stable）

- 无头导入检查 13 项全过（退出码 0）：清单加载、schema 版本、帧矩形在页面内、
  锚点有限、剪辑帧数与 90ms 时长、附件点局部坐标、AtlasTexture 尺寸、幂等加载。
- 窗口模式 demo 截图人工确认：跑姿贴地面参考线、枪口红点、nearest 无串色。
- 编辑器内人工预览（F5）步骤已写入 `examples/godot/README.md`，本会话未执行。

## 技能安装（P7 + R3 + 入口收敛）

- 唯一发现入口（2026-09-26 收敛后）：
  - 主存储 `C:/Users/admin/.codex/skills/procedural-game-assets`（0.2.1，与开发源逐目录一致）；
  - 发现入口 `C:/Users/admin/.agents/skills/procedural-game-assets`（junction → 主存储）。
  - 两个发现目录内**无任何 backup 残留**（已逐一核实）。
- 备份（发现目录之外，`C:/Users/admin/.codex/backups/skills/procedural-game-assets/`）：
  - `agents-backup-20260926094152`（初版纯文档技能，无 toolkit）
  - `codex-backup-20260926101924`（0.1.0）、`codex-backup-20260926102505`（0.2.0）
  - `codex-backup-20260926112629`、`codex-backup-20260926112814`（0.2.1 两次安装演练）
- 迁移核验：3 个旧备份共 231 个文件迁移前后 sha256 逐文件一致
  （记录 `C:/Users/admin/.codex/backups/skills-migration-record.json`，
  工具 `tools/snapshot-hashes.mjs` / `tools/verify-migration.mjs`）。
- 安装脚本修复（install-core 重构 + install.mjs 瘦 CLI）：
  备份默认落 `<codex-home>/backups/skills`（发现目录之外）；
  junction 探测改 readlink（isSymbolicLink 对 junction 恒 false）；
  入口父目录缺失时先建目录（新环境曾致 junction 静默退回复制）。
  回归测试 `tests/integration/install.test.js` 3 项（载荷中自动跳过）。
- **发现链路待新会话验证**：技能列表刷新需新会话/重启 Codex App 确认。

## 多宿主注册（2026-09-26）

- 核查：各宿主惯例为 `~/.<harness>/skills/<name>` 链接到唯一主存储（参照 anysearch）。
  单一真相源保持 `.codex/skills/procedural-game-assets`。
- 已注册（junction → 主存储，读回均 0.2.1）：
  `.agents/skills`（Codex 插件层）、`.claude/skills`、`.cursor/skills`、`.dsh/skills`、
  `.zcode/skills`、`.workbuddy/skills`、`.grok/skills`、`.kimi-code/skills`。
- OMP：无自有 skills 目录，其 `agent/config.yml` 的 `skills.customDirectories`
  指向 zcode/grok/dsh/workbuddy/cursor 的 skills 目录，间接生效，未另建入口。
- 工具：`skills/procedural-game-assets/scripts/register-harnesses.mjs`
  （幂等；预置真实目录备份到发现目录之外；--dry-run/--list）。
  端到端测试 `tests/integration/register-harnesses.test.js` 2 项（载荷中自动跳过）。
- 曾出错并已修正：注册脚本初版把入口错指到开发仓库，已改为默认指向主存储并重建全部链接。
- **每个宿主需各自重启或新开会话后验证**（本会话无法证明任一宿主的技能列表已刷新）。

## R1–R3（范围校正后，2026-09-26）

| 阶段 | 验证 | 结果 |
|---|---|---|
| R1 网页接入 | adapters/canvas.js CanvasBank（注入工厂、变体缓存、与导出同源）；stub 测试 7 项 | 109/109 |
| R2 模板 | 逻辑层 11 项 + demo-presets 5 项（确定性/碰撞/交互/胜负/暂停重启）；浏览器三预设截图人工确认 | 109/109 |
| R3 技能改版 | 载荷 114 文件哈希一致，两处独立运行 109/109；0.1.0/0.2.0 备份保留 | 通过 |

## R4 首版验收（v2，实施者干净目录复用，非独立 Agent 试验）

目录：`E:/Repos/Tools/pga-acceptance`（提交 7d42571），起点仅为已安装载荷。

- 新角色族 snowowl 两体型、scorp 机械、tundra 地形（与示例明显不同）；
  可玩切片「雪原突击」：移动、射击交互、雪原肃清/任务失败、白闪与粒子反馈。
- 机测 `work/game.test.mjs` 6/6（三预设、确定性、内容契约）；
  浏览器截图：初始 + assault/clear/hit 三预设人工确认。
- 验收发现并已修复：模板帧名硬编码（工具包 0.2.1 改 content.aimFrames）、
  敌人盒高度差 1px、bastion 眉影、子弹浅背景配色。资产核心零修改。
- 无对照组：只声称"复用成功"，不声称质量提升百分比。

## R5 多宿主试验回收（2026-09-26，0.3.0）

来源：首个非 Codex 宿主试验项目 `E:/Repos/Tools/pga-trial-kimi-code`（只读证据，
HEAD f319b7c，结束时复核干净）。其验收报告中的"全部完成"类结论按证据逐条核验，
核验结果见本节与文末未验证项。

### 回收内容

1. **模板输入契约**（`template/logic/input.js`、`game.js`、`main.js`）：
   - 证实试验报告指出的缺陷：点按缓冲 + 布尔边沿检测会把连续两次暂停点按吞成
     true/true（暂停后无法恢复）。修正：pressed 离散事件队列（每动作上限 8 条，
     每次快照每动作消费一条），game.step 优先消费 pressed、无 pressed 字段的旧
     布尔快照保持边沿语义。
   - 另发现上轮换接草稿的缺陷并修正：暂停帧 `clear()` 全清会把同帧双击 Esc 的
     第二条 pressed 误杀；改为 `clear({ except: SYSTEM_ACTIONS })` 只清游戏动作。
   - 失焦清空（blur/visibilitychange hidden）回收自试验项目；被清的键需重新
     按下才生效（防粘键），自动重复不复活。
   - 覆盖测试 10 项（`tests/unit/input.test.js`）：亚帧点按、长按、自动重复、
     快速连按、多物理键同动作、暂停/恢复、重启、blur/hidden/clear/unbind、
     补帧 step(n)、暂停中输入丢弃。
2. **DOM HUD 文字方案**（`template/render/hud.js`、`index.html`）：低分辨率画布
   内 fillText 小字全部移除（护盾格保留），stats/横幅走 DOM，支持中文；
   dbg 行加 `/paused` 标记（回收自试验项目：无 JS 求值的宿主靠 dbg 文本读状态）。
   位图字体作为可选方案写入文档，不维护第二套实现。
3. **携带隔离**（`tools/init-project.mjs` + `tools/release-manifest.mjs`）：
   干净目录初始化把工具包携带到 `vendor/pga/` 并逐文件 sha256 复核，
   项目根建立游戏自身 package.json/CONTEXT.md/README.md，模板复制为 `game/`
   并把 import 改写为相对路径（Node 与浏览器通用）。清单路径根 = vendor/pga/，
   项目根文件不受清单约束——试验项目的"CONTEXT.md 同名撞车例外"就此消除。
   `release.mjs` 拆出共用哈希模块，未新增第二套打包系统。
   测试 4 项（`tests/integration/init-project.test.js`）：迷你载荷全链、
   覆盖保护、缺失/损坏/多出/身份撞名响亮失败、真实载荷链（init→冒烟→
   携带副本全量套件→check→静态服务 HTTP）。
4. **审图与证据规则**回收进 `skills/.../reference/visual-diagnosis.md`（文字、
   状态不只靠颜色、暗背景辨识度、场景语义、证据纪律），按任务要求泛化——
   不强制"背景更暗"/支架吊索，不写"≤10px 一律不合格"式保证；
   空间站专用美术与领航玩法未回收（项目内容层，非通用能力）。

### 本轮验证

- 全量回归 `node --test "tests/**/*.test.js"`：**132/132**（116 基线 + 输入 10
  中的增量、HUD 2、init 4；原 input 草稿 7 项已并入扩充后的 10 项）。
- 浏览器实际验证（Python Playwright 1.58 headless Chromium，trusted 键盘事件，
  脚本 `tools/browser-check.py` 已入库可复跑）：12/12 通过——真实按键
  右移/跳跃/射击/暂停/恢复/重启，暂停中输入不补发，双击 Esc 净结果恢复，
  三预设状态与文案断言。
- 截图（`output/playwright/r3-*.png`，人工过目）：暂停/胜利横幅中文清晰、
  stats 右上不遮挡；dsf 1.25/1.5 下 DOM 文字清晰（画布像素边缘有非整数缩放的
  固有抖动，如实记录）；420px 窄屏布局不溢出。
  注：旧 `output/playwright/before-win.png` 内嵌浏览器截图未捕获画布，
  不是有效基线，本轮未覆盖它，留作历史文件。
- 干净目录验收：`work/init-check/`（gitignored）由载荷 init 生成——
  项目测试 1/1、携带副本套件 124 过 3 跳过（跳过的是宿主安装集成测试）、
  `--check` 通过、`game/` 无绝对路径残留（grep 0 命中）、
  浏览器 12/12（用项目自己的 `vendor/pga/tools/static-server.mjs` 起服务）。
- 只读边界复核：`pga-trial-kimi-code`（f319b7c）、原游戏 `others_003`、
  共享安装 `.codex/skills/procedural-game-assets` 本轮均未修改（git 状态与
  哈希复核可查）；本轮只产出开发仓库内的 0.3.0 发行候选，共享安装保持 0.2.1。

### 未验证项（本轮新增/沿用）

- OS 级真实失焦：headless 环境无法复现（试验项目探针结论相同）；
  blur/隐藏监听由合成事件单测覆盖。
- 真人全程试玩与真人单局时长：两轮均无真人试玩，脚本/机器定时通关
  不换算为真人时长。
- 各宿主重启/新会话后的技能列表刷新（沿用）。
- 试验项目的"Kimi 原生技能发现成功"：本轮未在新会话重演，沿用其验收记录。
- 第二个非 Codex 宿主试验：未进行，是否开始由维护者决定。

## 未验证项（长期，如实记录）

- 技能发现链路（新会话/重启各宿主后确认）。
- Godot 编辑器人工预览（F5）；Godot 后续增强（冻结）。
- 音频模块（旧技能保留参考，未升级为工具包模块）。
- 跨平台（Linux/macOS）与 Node 23+ 未测。
