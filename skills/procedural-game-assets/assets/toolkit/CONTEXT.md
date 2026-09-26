# CONTEXT — procedural-game-assets

本文件是工具包的术语与边界来源。修改术语或边界时必须同步更新本文件；长期取舍写入 `docs/adr/`。

日期：2026-09-26。状态：P0 建立；同日按范围校正修订（网页游戏优先，Godot 降可选）。

## 术语

| 术语 | 含义 | 边界 |
|---|---|---|
| `raster` / `painter` | 内存中的像素缓冲（`Uint32Array(w*h)`，ABGR 布局）及其无抗锯齿绘制原语 | 不做通用图层、撤销、半透明混合 |
| `recipe`（配方） | 描述一类资产的显式参数集合（调色板、几何、姿态表、种子） | 只接收显式参数与种子，不读全局状态、不访问 DOM/FS/网络 |
| `pose`（姿态） | 一帧角色的离散几何描述（腿角、瞄准方向、枪长） | 离散姿态烘焙，不是运行时 IK/骨骼动画 |
| `solvePose` | 由配方 + 姿态计算关节、脚底、武器与附件点的纯函数 | 只算几何；栅格绘制与元数据消费同一结果，不各自重算 |
| `frame`（帧） | 一张烘焙完成的精灵图：`{ id, width, height, rgba, anchor, attachments, bounds, diagnostics }` | 对外像素数据为 `Uint8ClampedArray` RGBA |
| `anchor`（锚点） | 帧内像素边界坐标，角色默认为脚底中心 | 与附件点同坐标系；不使用"相对脚底偏移"的第二种坐标 |
| `attachment`（附件点） | 帧内命名关键点（muzzle、head 等），像素边界坐标 | 游戏侧相对偏移按 `attachment - anchor` 计算 |
| `marks` | ASCII 像素图中的标记字符位置 | 表示**像素中心**（边界坐标 = 索引 + 0.5），与显式锚点字段区分 |
| `clip`（动画剪辑） | 帧 ID 序列 + 每帧毫秒时长 | 时间是数据（毫秒），不硬编码进游戏状态机 |
| `bake`（烘焙） | 由配方 + 种子确定性地产出全部帧与剪辑的过程 | 同配方同种子同输出；静态纹理不在消费端每帧重新生成 |
| `manifest` | 导出的版本化 JSON 清单（schemaVersion、帧、图集页、剪辑、来源） | 不含绝对路径、不含构建时间戳；schema 不兼容即导入失败 |
| `bank` / `CanvasBank` | 烘焙产物的命名缓存；CanvasBank 由 `adapters/canvas.js` 在启动时构建 | 原项目的 `SpriteBank` 概念；变体按需生成，不无条件预烘四份 |
| `runtime path`（接入路径） | 资产进入游戏的两种方式：启动烘焙（默认）或离线导出（可选部署），共享烘焙核心 | 见 ADR-0004 |
| `template`（模板） | `examples/canvas-slice/` 升级形态的轻量 Canvas 网页游戏骨架 | 范围与测试接口见 ADR-0005；不是通用引擎 |

## 坐标契约（要点，全文见 ADR-0002）

- 像素边界坐标系：左上角 `(0,0)`，x 向右、y 向下，像素中心为 `(i+0.5, j+0.5)`。
- 水平镜像：点 `(W-x, y)`；像素索引 `W-1-i`。两者严格区分。
- 顺时针 90°：点 `(H-y, x)`，尺寸变 `(H, W)`。
- padding 增加时，锚点与附件点一起平移。

## 模块边界

```text
core/      无 DOM、无 FS、无网络、无时钟；只依赖显式参数与种子
geometry/  姿态求解等纯几何；依赖 core
bake/      帧组装、变体、包围盒、诊断；不创建 Canvas
recipes/   各类资产配方（人形、机械、植被、道具、地形）
export/    PNG、图集、manifest（可选部署路径，IO 适配层）
adapters/  Canvas 启动烘焙适配（ADR-0004）；Godot 等为可选适配
bin/       CLI 入口（受信本地工具）
tools/     画廊与基线采集
examples/canvas-slice/  轻量 Canvas 网页游戏模板（ADR-0005）
examples/godot/         Godot 可选适配样例（非验收前提）
```

画廊、导出与网页启动烘焙必须调用同一烘焙实现（ADR-0004）。
游戏逻辑可消费附件点与动画状态，但碰撞规则不归资产核心库（模板逻辑层除外，见 ADR-0005）。

## 上下文依据

- 当前路线：`docs/PLAN.md`（范围校正后版本；Godot 降为可选适配）
- 原方案（历史依据，只读）：`E:/Repos/Games/ForOthers/others_003/docs/PROCEDURAL-ASSETS-IMPLEMENTATION-PLAN.md`
- 分析：`E:/Repos/Games/ForOthers/others_003/docs/PROCEDURAL-ART-ANALYSIS.md`
- 原游戏设计：`E:/Repos/Games/ForOthers/others_003/docs/DESIGN.md`
- 来源与授权：`docs/provenance.md`
- ADR：`docs/adr/`（0001 平台解耦、0002 坐标、0003 离线清单、0004 网页优先接入、0005 Canvas 模板）

本项目当前没有 `CONTEXT-MAP.md`（未做领域拆分）；如将来拆分领域再建立。
