# PGA Studio 落地计划（agent 创作控制层）

日期：2026-09-28。状态：M0＋M1＋M2 已实施；M3 起待做。

术语与边界：`../../CONTEXT.md`；架构决策：`../adr/0008-agent-studio.md`（文档与编译）、
`../adr/0009-studio-edit-transactions.md`（候选事务与保护）；
完整方案与评测设计：`../PGA_STUDIO_IMPLEMENTATION_HANDOFF.md`（方案文档，非事实来源）。
既有标准：`../visual-quality.md`（技术与视觉分开）、`../verification.md`（验证记录）。

## 阶段与验收

| 阶段 | 目标 | 状态 |
|---|---|---|
| M0 基线/范围/ADR | 基线测试、范围冻结、ADR-0008、本计划 | ✅ |
| M1 文档→渲染→导出 | v1 校验、编译桥、sceneMap、CLI create/inspect/export、smoke | ✅ |
| M2 局部编辑/候选/回退 | 三个操作、同基准探索、保护检查、事务与幂等 | ✅ |
| M3 agent 接入与对照评测 | 首轮试点：4 题全过、图像真实到达、指南修复；A/B 对照未做 | ⏳ 首轮完成 |
| M4 风格与构造 | 风格包、第二种资产、有限结构分支 | 未做（下一项） |
| M5 角色/跨帧/资产族 | 复用 solvePose，修改跨帧一致 | 未做 |
| M6 发行与文档 | 载荷清单核对、干净目录验证、范围如实标注 | 未做 |

## 本轮冻结的首版范围

- 资产：单帧机械终端，内画布 30×30，`assembleFrame` 默认描边后输出 32×32。
- 节点（扁平、layer 序）：`terminal.base` / `terminal.shell` / `terminal.screen` / `terminal.side_panel`。
- 几何 kind：`panel`、`screen`；材质：`flat`、`bevel-metal`（panel）、`flat`、`scanlines`（screen）。
- 色阶：风格内命名的 4 级 ramp（shadow/base/light/highlight）。
- 操作（M2 才实现执行）：`geometry.set` / `material.set` / `ramp.set`，范围见 inspect 返回的 capabilities。
- 保护项：v1 仅声明（样例含 screen 像素保护与 anchor 元数据保护），M2 起强制执行。

## M2 验收记录（本轮实测，详见 verification.md 的 S2 节）

- 必做演示 `examples/studio/edit-demo.mjs` 九步真实运行通过：创建 → inspect → 探索
  机箱宽度 {24,26,28} → 屏幕像素/锚点保护逐候选核对 → 接受 w=28（r2）→
  修改受保护屏幕被 CONSTRAINT_CONFLICT 拒绝且提交再被 CANDIDATE_INVALID 拒绝（head 不受污染）→
  恢复 r1 得 r3 且 renderHash/documentHash 与 r1 精确一致 → 导出 r3 manifest 通过既有校验 →
  幂等重放返回同一结果不重复接受。
- 候选去重：w=26 标注 UNCHANGED 且 duplicateOf=base，uniqueCount=2，不凑多样性。
- 允许影响区域独立计算：几何操作外扩 1px 描边邻域并减去未变更高层支持掩码遮挡；
  区域外变化、锚点篡改、非目标节点篡改、未声明字段篡改均有专门拒绝测试。
- commit 不信任落盘检查：接受时重新推导+重编译+重新执行保护检查，三者不符即拒绝。
- 并发/重试/崩溃：错误 expectedHead 与过期基准候选 STALE_REVISION；活锁 WORKSPACE_BUSY、
  死锁接管；`*.tmp-*` 残留可识别不自动删除；台账落盘重启后重放有效。
- 视觉：查看 r1 基准与 w=24/w=28 候选 display 图——仅机箱右缘变化，屏幕区域逐像素不变，
  保护语义画面可验证；美术质量仍按 M1 结论（示意样例，NOT_YET），无标杆不宣称同级。

## M3 首轮试点记录（本轮实测，详见 verification.md 的 S3 节与 plans/agent-studio-m3-pilot.md）

- 预注册 4 题（冷启动新建/探索接受/材质修改/保护冲突）由独立子代理仅凭 `../studio-cli.md` 完成：全部 PASS。
- 图像真实到达模型（轨迹逐图记录，共 523 行可复查）；保护冲突按预期拒绝且未被绕过，head 未污染。
- 失败分类：六类 agent 失败为零；命中 4 处指南缺陷 + 1 处误导诊断字段，已全部修复并回归 271/271。
- 口径：只宣称"接口可用/技术试验完成"；A/B 对照、跨模型、MCP 未做（MCP 暂不添加，见 S3 决策）。

## 下一项可执行任务（M4 第一项）

为第二种结构明显不同的静态资产扩展有限几何算子：在非箱体式道具（条形/斜面件）上验证
"同一版本化风格包 + 不同轮廓/构造"能成立，并建立留出组合检验（不把所有测试写成已知模板参数）。

## M1 验收记录（详见 verification.md 的 S1 节）

- 同文档重复编译 RGBA 与关键元数据哈希一致（smoke 与单测双重覆盖）。
- 4 个节点均有稳定 ID 与最终帧坐标（scene.json / inspect 输出）。
- 30×30 内画布 → 32×32 最终帧；锚点/附件点 +1 平移符合 ADR-0002。
- 非法文档（重复 ID、未知 ramp/材质、越界、危险键、多余字段等）拒绝且报 `INVALID_DOCUMENT`。
- 旧套件无回归；新增 studio 测试全过。
- 图像确实由文档经 `PixelPainter` + `assembleFrame` 生成（单测断言具体像素色值），非占位图。
- 视觉查看与技术验收分别记录；视觉结论限于"示意样例可辨识"，不代表美术达标。

## 明确不做（本轮边界）

- 不重写 `PixelPainter`，不引入第二套坐标/渲染器；纯核心无 DOM/FS/网络/时钟。
- 不执行文档中的 JS/模块路径；不接收费模型、云服务、完整 GUI/MCP。
- 不改 `pga-loop/2` 准出、预算与独立评审规则；普通制作不强加严格循环。
- 不手改 `skills/*/assets/toolkit/` 派生载荷与哈希清单；本轮不发行、不升级用户级安装。
- 不恢复 Godot 首版必做要求；网页优先与共享烘焙核心保持不变（ADR-0004）。
