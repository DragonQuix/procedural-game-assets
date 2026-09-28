# PGA Studio 落地计划（agent 创作控制层）

日期：2026-09-28。状态：M0＋M1 已实施（本轮）；M2 起待做。

术语与边界：`../../CONTEXT.md`；架构决策：`../adr/0008-agent-studio.md`；
完整方案与评测设计：`../PGA_STUDIO_IMPLEMENTATION_HANDOFF.md`（方案文档，非事实来源）。
既有标准：`../visual-quality.md`（技术与视觉分开）、`../verification.md`（验证记录）。

## 阶段与验收

| 阶段 | 目标 | 状态 |
|---|---|---|
| M0 基线/范围/ADR | 基线测试、范围冻结、ADR-0008、本计划 | ✅ 本轮 |
| M1 文档→渲染→导出 | v1 校验、编译桥、sceneMap、CLI create/inspect/export、smoke | ✅ 本轮 |
| M2 局部编辑/候选/回退 | 三个操作、同基准探索、保护检查、事务与幂等 | 未做 |
| M3 agent 接入与对照评测 | 真实宿主跑通、试点任务、失败分类 | 未做 |
| M4 风格与构造 | 风格包、第二种资产、有限结构分支 | 未做 |
| M5 角色/跨帧/资产族 | 复用 solvePose，修改跨帧一致 | 未做 |
| M6 发行与文档 | 载荷清单核对、干净目录验证、范围如实标注 | 未做 |

## 本轮冻结的首版范围

- 资产：单帧机械终端，内画布 30×30，`assembleFrame` 默认描边后输出 32×32。
- 节点（扁平、layer 序）：`terminal.base` / `terminal.shell` / `terminal.screen` / `terminal.side_panel`。
- 几何 kind：`panel`、`screen`；材质：`flat`、`bevel-metal`（panel）、`flat`、`scanlines`（screen）。
- 色阶：风格内命名的 4 级 ramp（shadow/base/light/highlight）。
- 操作（M2 才实现执行）：`geometry.set` / `material.set` / `ramp.set`，范围见 inspect 返回的 capabilities。
- 保护项：v1 仅声明（样例含 screen 像素保护与 anchor 元数据保护），M2 起强制执行。

## M1 验收记录（本轮实测，详见 verification.md 的 S1 节）

- 同文档重复编译 RGBA 与关键元数据哈希一致（smoke 与单测双重覆盖）。
- 4 个节点均有稳定 ID 与最终帧坐标（scene.json / inspect 输出）。
- 30×30 内画布 → 32×32 最终帧；锚点/附件点 +1 平移符合 ADR-0002。
- 非法文档（重复 ID、未知 ramp/材质、越界、危险键、多余字段等）拒绝且报 `INVALID_DOCUMENT`。
- 旧套件无回归；新增 studio 测试全过。
- 图像确实由文档经 `PixelPainter` + `assembleFrame` 生成（单测断言具体像素色值），非占位图。
- 视觉查看与技术验收分别记录；视觉结论限于"示意样例可辨识"，不代表美术达标。

## 下一项可执行任务（M2 第一项）

为 `geometry.set` 实现 `terminal.shell` 的 `w`（宽度）参数候选分支：
同基准派生 3 个宽度候选 → 全量重渲染 → 校验 `terminal.screen` 像素保护与
anchor 元数据保护 → 产出候选前后图与拒绝证据，配套失败注入测试。

## 明确不做（本轮边界）

- 不重写 `PixelPainter`，不引入第二套坐标/渲染器；纯核心无 DOM/FS/网络/时钟。
- 不执行文档中的 JS/模块路径；不接收费模型、云服务、完整 GUI/MCP。
- 不改 `pga-loop/2` 准出、预算与独立评审规则；普通制作不强加严格循环。
- 不手改 `skills/*/assets/toolkit/` 派生载荷与哈希清单；本轮不发行、不升级用户级安装。
- 不恢复 Godot 首版必做要求；网页优先与共享烘焙核心保持不变（ADR-0004）。
