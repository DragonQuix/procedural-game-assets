# 任务清单 — procedural-game-assets

现行计划：`../docs/PLAN.md`（范围校正版 v2）。
术语与边界：`../CONTEXT.md`；长期决策：`../docs/adr/`。

## 已完成（验证记录见 docs/verification.md）

- [x] P0 基线与契约（cfac45e）
- [x] P1 无 DOM 像素核心（05598a8）
- [x] P2 角色闭环：60 帧逐像素回归、rustclaw、最低画廊（3b966dc）
- [x] P3 图集与清单：PNG、稳定打包、manifest、CLI export（cf87bbd）
- [x] P4 配方扩展：机械/植被/道具/地形（见 git log）
- [x] P5 视觉工作台：变体/场景/对比、四植入故障演练（4772227）
- [x] P6 消费与集成：Canvas 切片、Godot 4.6.2 实测（ad9f5fa，Godot 现降为可选）
- [x] P7 技能封装：SKILL.md、载荷、安装（ec9d402，发现链路待新会话验证）
- [x] 范围校正：ADR-0004/0005、PLAN.md v2、CONTEXT 修订

## R1 网页接入（ADR-0004）

- [ ] `src/adapters/canvas.js`：注入式 Canvas 工厂、CanvasBank、按需变体（镜像/白闪）
- [ ] Node 测试（stub canvas）+ 浏览器 smoke（启动烘焙路径实际画面）
- [ ] 与导出路径的像素一致性验证（共享烘焙实现）

## R2 Canvas 模板（ADR-0005）

- [ ] `template/logic/`：固定步长、输入、暂停/重启、镜头、AABB 碰撞、射击交互、粒子/白闪、固定种子、step/state 接口（无 DOM）
- [ ] `template/render/`：场景/自发光/HUD 层序，消费 CanvasBank
- [ ] canvas-slice 升级整合 + node 测试 + 浏览器验证 + 运行说明

## R3 技能改版（已完成）

- [x] SKILL.md 主用途改为网页游戏；Godot 降可选（reference/godot.md 保留）
- [x] toolkit-api.md 增加 adapters/canvas 与模板接口
- [x] 差异核对：旧载荷自洽，变更在源树；版本 0.2.0，PLAN.md 入载荷
- [x] 重装完成：114 文件哈希一致；0.1.0 备份保留（backup-20260926101924）；发现链路待新会话验证

## R4 新验收（已完成，实施者验收，非独立 Agent 试验）

- [x] 「雪原突击」可玩切片：移动、射击交互、雪原肃清/失败、白闪/粒子反馈
- [x] 三预设 assault/clear/hit 浏览器截图 + work/game.test.mjs 机测 6/6
- [x] 验收发现并修复：模板帧名硬编码（0.2.1 content.aimFrames）、敌人盒高度、bastion 眉影、子弹配色
- [x] pga-acceptance 提交 7d42571；README 含运行步骤与如实验收记录

## 冻结

- Godot 增强、音频模块化、Unity、网络服务：见 PLAN.md 冻结项

## 发现入口与备份收敛（2026-09-26，单独任务）

- [x] 核查：4 个同名入口（0.2.1 / 0.1.0 / 0.2.0 / 初版文档）按内容定版
- [x] 3 个旧备份（231 文件）移至 `.codex/backups/skills/procedural-game-assets/`，迁移前后 sha256 逐文件一致
- [x] 安装脚本修复：备份落发现目录之外；junction 探测（readlink）；入口父目录创建；install-core 重构 + 集成测试 3 项
- [x] 唯一入口核实：`.codex/skills` 与 `.agents/skills` 各仅一个 procedural-game-assets
- [x] 载荷重建（115 文件，新测试在载荷中自动跳过）并重装，开发源==安装副本
- [ ] 发现列表刷新验证：待新会话/重启 Codex App（本会话无法证明）

## 多宿主入口注册（2026-09-26）

- [x] 实机核查 9 宿主惯例（anysearch 参照：skills/<name> 链接到唯一主存储）
- [x] register-harnesses.mjs：8 宿主 junction → .codex/skills 主存储（读回均 0.2.1），OMP 经 customDirectories 间接生效
- [x] 修正脚本"错指开发仓库"缺陷并重建全部链接；幂等验证 8/8
- [x] 端到端测试 register-harnesses.test.js 2 项；载荷 116 文件重装
- [ ] 各宿主重启/新会话后的技能列表验证（本会话无法证明）

## R5 多宿主试验回收（2026-09-26，0.3.0）

- [x] 输入契约：pressed 离散事件（每动作队列上限 8）、失焦清空防粘键、暂停帧只清游戏动作；测试 10 项
- [x] DOM HUD 替代画布内小字（中文横幅/stats），dbg 加 /paused；位图字体记为可选方案；测试 2 项
- [x] 携带隔离：init-project 干净目录初始化（vendor/pga/ + 哈希复核 + 项目身份 + import 改写）；测试 4 项
- [x] 审图与证据纪律回收进 reference/visual-diagnosis.md（泛化，不照搬空间站美术）
- [x] 浏览器验证脚本 tools/browser-check.py 入库；行为断言 10/10（真实按键/预设/
  同帧双击 Esc 确定性断言），截图采集 11 张另计（含 320px 原生与窄屏）
- [x] 同状态修改前截图：从 4edb7b6 worktree 补采 r3-before-*（win 预设文字破碎、
  320px 溢出与点按丢失实测）
- [x] init 项目名写入前校验（撞工具包名拒绝且不落文件；维护者实测复核确认）
- [x] 干净目录验收 work/init-check：测试、--check、携带副本套件、浏览器断言 10/10、无绝对路径
- [x] 0.3.0 发行候选：载荷重建校验（仅开发仓库；共享安装保持 0.2.1 不动）
- [ ] OS 级真实失焦（环境限制，监听路径由合成事件覆盖）
- [ ] 真人全程试玩与真人时长（无真人证据，不编造）
- [ ] 第二个非 Codex 宿主试验（待授权与前置条件确认）

## R6 2D 资产循环特别版（2026-09-28，0.4.0）

依据：`../CONTEXT.md` 与 ADR-0001/0004/0005/0006；当前无 CONTEXT-MAP.md。

- [x] AnySearch 调研同类技能/MCP与视觉程序优化方法，正文核验五类来源并记录边界
- [x] 独立技能入口：标杆评估、宪章、独立 builder/critic、两阶段盲比、双批次 WOW、默认无上限
- [x] 按用户要求采用指令级材料约束，不强制操作系统隔离
- [x] 候选哈希、匿名图、封存/揭盲与准出记录校验；开发源套件 165/165
- [x] 同源双载荷、Git 检出字节稳定与 pngjs 携带、可搬移安装回归
- [x] 独立启动/对齐前向测试；只作技能行为验证，不冒充资产 WOW
- [x] 用户授权安装循环版：主存储与 .agents 入口、140 文件一致、安装套件 155 通过/5 跳过
- [x] 原普通技能安装的 131 文件哈希未变；Gauntlet 与用户原图只读
- [ ] 新会话发现验证
- [ ] 完整资产循环的真实视觉准出与收敛能力验证（本轮未启动）
