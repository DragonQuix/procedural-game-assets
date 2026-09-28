# ADR-0008：PGA Studio——面向 agent 的可编辑文档与创作控制层

日期：2026-09-28。状态：已接受（M0＋M1 范围）。

## 背景

工具包已有确定性像素绘制、配方、烘焙、Canvas 接入与导出（ADR-0001/0002/0004）。
新需求是让具备视觉判断的 agent 通过**结构化部件与受约束操作**逐步制作资产，
而不是每次手写大量绘图代码。方案来源：`docs/PGA_STUDIO_IMPLEMENTATION_HANDOFF.md`
（开发方案，不是既有事实）。首版只做单帧机械道具/终端，跑通
"可编辑文档 → 现有烘焙核心 → 真实预览 → 既有资产导出"；候选编辑、搜索与回退留给后续阶段。

## 决定

1. **Studio 文档 v1（`pga-studio/1`）是唯一可编辑源**：纯可序列化 JSON
   （无函数、无 JS 字符串、无模块路径、无外部 URL）。字段白名单校验；
   未知 `schemaVersion`、未知字段、非法值一律拒绝，不静默修正、不猜测解释。
   节点为**扁平列表 + 显式 layer 顺序**（v1 无父子嵌套，故无环检查不适用）；
   节点 ID 稳定、唯一、点分命名（如 `terminal.shell`）。种子显式。
2. **编译桥接：可信算子直绘 + 既有帧组装**。`src/studio/compiler.js` 用开发者维护的
   内置几何/材质算子（`panel`/`screen` × `flat`/`bevel-metal`/`scanlines`）把节点画到
   同一个 `PixelPainter`（内画布），再调用既有 `assembleFrame` / `assembleAsset`
   产出标准 `BakedAsset`——与 `bakeProp` 同一条底层路径，不新增第二套渲染器或坐标系。
   不编译为内存 `PropSpec`：shell/icon 模型表达不了多部件层叠（见备选方案）。
3. **不新增 recipe kind**：编译产物 `BakedAsset.kind` 记为 `'prop'`
   （单帧静态道具，下游 Canvas/导出/manifest 均不按 kind 分派，已核实）。
   Studio 语义全部留在文档与编辑侧的 `sceneMap`，不进游戏运行时帧结构。
4. **节点子种子复用既有原则**：`machine.js` 的 `partSeed` 导出复用（算法不变），
   Studio 使用独立命名空间 `studio/1:<nodeId>` 单独版本化；不改动旧配方的种子行为。
5. **`sceneMap` 是编辑观察侧数据**：节点最终帧坐标、独立绘制包围盒、层序、材质/色阶引用，
   与画面同源一次几何解析；不写入对外 manifest（ADR-0003 合同不变）。
   v1 不提供遮挡支持掩码（support masks），如实记录为未实现。
6. **预览与导出复用既有路径**：`observe.js` 产出 native（原生尺寸）与 display
   （`scaleNearest` 整数倍 + 明确背景色）视图数据；PNG 编码、图集、manifest、
   `.asset.json` 全部复用 `src/export/` 与 `src/adapters/asset-file.js`。
7. **独立 JSON CLI**：新增 `bin/pga-studio.mjs`（create/inspect/export 最小子集），
   stdout 只出 JSON，日志走 stderr；不改 `bin/pga.mjs` 的人类可读输出。
   IO（读文档、写文件、覆盖保护）集中在 `src/adapters/studio-files.js`；
   `src/studio/` 保持 ADR-0001 纯核心（无 DOM/FS/网络/时钟，工具版本由调用方注入）。
8. **本轮不做**：候选/探索/回退/事务存储（M2）、操作执行（M2）、MCP（M3）、
   风格包扩展（M4）、跨帧（M5）、发行载荷调整（M6）。`constraints` 字段 v1 只做
   形状校验与声明，强制执行从 M2 开始。

## 后果

- agent 无需写绘图代码即可从 JSON 文档得到真实渲染与既有格式导出；
  编译确定性由 RGBA/元数据哈希回归保证。
- 旧配方、旧测试与 `pga.mjs` 行为不变；Studio 是叠加层，不进入既有消费路径。
- 后续阶段必须沿用同一编译路径加操作，不得为编辑另建渲染器。

## 备选方案（已否决）

- **编译为内存 `PropSpec` 交给 `bakeProp`**：prop 的 shell/icon 两段模型无法表达
  "机箱 + 屏幕 + 侧板 + 底座"的多节点层叠与逐节点定位，硬套会催生第二套语义。
- **新增 recipe kind `'studio'` 并注册进 `pga.mjs`**：为命名引入注册表/Canvas/导出/
  发行的连锁面，MVP 无必要；`BakedAsset.kind` 继续记 `'prop'`。
- **把 sceneMap 写进对外 manifest**：manifest 是版本化导出合同（ADR-0003），
  编辑观察数据混入会破坏"不含编辑状态"的边界。
- **v1 支持节点父子嵌套**：首版样例为扁平结构，先不引入层级与环检查；
  需要时在次版本加入并补校验。
