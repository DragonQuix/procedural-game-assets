# 来源与授权记录（provenance）

日期：2026-09-26。本文件记录工具包从原项目抽取代码与数据的来源，供审计与回归使用。

## 来源项目

- 路径：`E:/Repos/Games/ForOthers/others_003`（本地私有仓库，只读使用）
- 代码基线提交：`981c73f`（最后的功能/文档提交）
- 后续文档提交：`fc52921`（技术分析）、`bd1cf1a`（实施方案）——这两份是分析产物，不是历史实现，不与历史代码混同。
- 原项目验证基线：`node --test` 119 项通过、111 个命名精灵（见原项目 `docs/VERIFICATION.md`）。**这些数字属于原项目，不是本工具包的验证结果。**

## 抽取文件清单

| 原文件（相对 others_003） | 抽取到 | 内容 | 本地修改 |
|---|---|---|---|
| `src/gfx/pixelPainter.js` | `src/core/` | 绘制原语、颜色打包 | 去 DOM 依赖、修负坐标取整、加诊断与校验（P1） |
| `src/gfx/spriteBuilder.js` | `src/core/ascii.js`、`src/core/transform.js` | parseArt、rotate90、描边+锚点入库逻辑 | 坐标契约按 ADR-0002 统一（P1） |
| `src/entities/rigGeometry.js` | `src/geometry/` | 骨架几何、姿态表、枪口求解 | 推广为 `solvePose`，帧约束显式化（P2） |
| `src/gfx/sprites/rig.js` | `src/geometry/` + `src/recipes/humanoid.js` | 姿态绘制 | 拆为 solve/draw 两半（P2） |
| `src/gfx/sprites/characters.js` | `examples/recipes/` | 英雄/军团配方数据 | 作为兼容样本，不作唯一风格（P2） |
| `src/core/rng.js` | `src/core/rng.js` | mulberry32 | 无（P1） |
| `src/core/math.js`（`hash2`） | `src/core/hash.js` | 确定性二维哈希 | 无（P1） |

本地修改原则：先保留算法行为，再逐项修边界；修复只存在于本库，不回写原项目。

## 基线数据

`tests/fixtures/baseline/` 由 `tools/capture-baseline.mjs` 用**原项目生成器**（提交 `bd1cf1a` 工作区）采集：

- 调用原 `buildHero` / `buildLegion` / `buildProps` / `buildScenery` 与原版 `SpriteBank.add` 逻辑（含 1px 描边扩边与锚点平移）。
- 每个命名精灵记录：名称、尺寸、锚点、marks、RGBA（base64）、镜像/白闪的存在性。
- 用途：新库烘焙兼容样本时逐像素回归。像素变化必须区分"算法回归 / 坐标契约修正 / 有意改美术"。

## 授权与来源检查

- 原项目为用户本机私有项目，仓库无 LICENSE 文件、无第三方素材文件；全部美术/音频由代码生成。
- 本工具包为同一用户环境内的本地复用，不公开发布；公开发行前需另行确认授权。
- 已有技能基线：`C:/Users/admin/.agents/skills/procedural-game-assets/SKILL.md`（含 `reference/`），提炼自同一来源项目。P7 优先升级该技能，不另造同名技能；安装前核查真实存储位置与备份。
- 第三方依赖（IO 边界，锁定版本）：
  - `pngjs@7.0.0`（MIT，`src/export/png.js` 薄封装）：PNG 编解码。选择理由：纯 JS、无原生依赖、API 稳定。像素核心 `src/core/` 仍无第三方运行时依赖。
