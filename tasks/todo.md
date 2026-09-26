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
