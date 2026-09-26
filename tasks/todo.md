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

## R3 技能改版

- [ ] SKILL.md 主用途改为"工具包 + 模板做网页游戏"；Godot 降可选引用
- [ ] 重装前核对开发源与安装副本差异；重新打包（release.mjs）并安装；提醒新会话验证

## R4 新验收（pga-acceptance 干净目录）

- [ ] 模板 + snowowl/scorp/tundra 可玩切片：移动、射击交互、胜负状态、动画反馈
- [ ] 浏览器操作验证截图；自动化测试；可复现运行步骤
- [ ] 记录：首次预览用时、失败、核心修改次数、修复轮次（如实，不冒充独立试验）

## 冻结

- Godot 增强、音频模块化、Unity、网络服务：见 PLAN.md 冻结项
