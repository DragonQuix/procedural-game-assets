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
| `asset loop`（资产循环） | 特别版技能按冻结宪章反复制作、独立评审 2D 程序化资产的流程 | ADR-0006/0007；新任务用 pga-loop/2，不代替普通网页游戏入口，不是后台调度器 |
| `candidate`（候选） | 同一宪章下冻结的交付文件与视觉/技术证据，以内容哈希识别 | 文件或宪章变化即新候选；旧 WOW 不可沿用 |
| `review batch`（评审批次） | 对同一候选回收 visual 与 delivery 全部独立裁决的集合 | 两个不同完整批次同时 WOW 才准出，批次不等于候选 |
| `quality parity`（质量同级） | 在约定用途与审美方向内，整体吸引力、设计控制力和完成度达到标杆档次 | 不是外观相似度；准则见 `docs/visual-quality.md`，循环合同见 ADR-0007 |
| `design constraints`（设计约束） | 用户明确要求的风格、功能、必要特征与使用条件 | 不从标杆自动继承角色身份、配色或几何；未约束部分允许原创 |
| `studio document`（Studio 文档） | `pga-studio/1`（冻结矩形词汇）或 `pga-studio/2`（+poly/disc、shade-diag、色阶局部覆盖、style.meta）的可序列化 JSON：显式种子、内画布、扁平节点、有限几何/材质/色阶声明 | 无函数/模块路径/URL；未知版本与字段拒绝；见 ADR-0008/0010 |
| `style pack`（风格包） | 文档内版本化 `style`：命名 4 级色阶 + `meta`（license/source/focusRamp/notes） | 不是模板换色器；节点可用 `{shades}` 局部覆盖而不动共享色阶 |
| `sceneMap` | Studio 编译输出的编辑侧节点定位数据（最终帧坐标、独立包围盒、层序、支持掩码） | 观察元数据，不进对外 manifest，不进游戏运行时帧结构 |
| `revision`（修订） | Studio 工作区中一次已提交的不可变文档快照（`r1..rN`，含父指针与来源） | 历史 ID ≠ 内容哈希；恢复是引用旧内容的新修订 |
| `edit candidate`（编辑候选） | 从某修订派生的未提交文档 + 保护检查结果，内容哈希识别（`c-*`） | 不改变 head；与 pga-loop 的冻结 `candidate` 不同域，见 ADR-0009 |
| `allowed region`（允许影响区域） | 由操作计划与依赖独立计算的像素可变化区域（旧∪新几何、描边邻域、层序遮挡） | 绝不从事后差分反推；区域外变化即违规 |
| `character document`（角色文档） | `pga-studio/character/1`：humanoid 配方的结构化数据面（palette/frame/rig/art/poses/clips） | 经既有 bakeHumanoid 编译；不变量仅适配 checkedPoseKinds；见 ADR-0011 |
| `grounding`（接地） | 角色帧包围盒底缘（贴地）在修改前后不变 | 顶缘随体高/腿长合法变化；由 solvePose 自动保持 |
| `head` | Studio 工作区当前已确认修订指针（`head.json`，原子替换更新） | 只有 commit 移动它；并发底线是 expectedHead 校验 |
| `asset protection contract`（资产级保护合同） | `pga-studio/3.protection` 的冻结基线、最终帧像素区/掩码、metadataPaths 与 nodeIds | `pga-protection/1`；最终重新编译的 RGBA/元数据为权威，不等于 operation footprint；见 ADR-0012 |
| `safe domain`（安全域） | 指定 revision/documentHash 下，固定其它参数，有限枚举试编译得到的合法整数集合 | 不是多个区间的安全笛卡尔积；探针不输出图像，不计可观察候选，但单列计算量 |
| `relation contract`（关系合同） | `pga-studio/4.relations` 显式声明稳定端点之间的结构关系；required 与 protection 独立 AND | 首版只支持矩形相向边 contact，不从节点名称推断；见 ADR-0013 |
| `relation resolution`（关系修复） | relation 声明 follower、axis、mode、invariant 后的确定性 DAG 传播 | 只有 translate-follower / resize-follower-edge；不是任意 constraint solver；primary invariant 不可被修复反改 |
| `relation inspection`（关系诊断） | 编译后最终几何的 gap/overlap/status 与 revision/document/relationContractHash 绑定 | 不证明接触可见性或视觉质量；旧诊断不能授权新合同 |

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
studio/    agent 创作控制层：文档校验、纯编译、观察视图（ADR-0008）；同为纯核心
observe/   只依赖标准帧的共享观察视图；两实验 arm 可复用，不进入最终资产
export/    PNG、图集、manifest（可选部署路径，IO 适配层）
adapters/  Canvas 启动烘焙适配（ADR-0004）、Studio 文档/预览 IO 与工作区存储（ADR-0009）；Godot 等为可选适配
bin/       CLI 入口（受信本地工具；pga.mjs 人类可读，pga-studio.mjs 为 JSON）
tools/     画廊、基线采集、发行打包（release）与项目初始化（init-project）
skills/procedural-game-assets-loop/  2D 资产循环特别版；与普通技能共享开发源，不共享运行状态
examples/canvas-slice/  轻量 Canvas 网页游戏模板（ADR-0005）
examples/studio/        Studio 文档样例与 smoke 入口（ADR-0008）
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
- ADR：`docs/adr/`（0001 平台解耦、0002 坐标、0003 离线清单、0004 网页优先接入、0005 Canvas 模板、0006 资产循环入口、0007 质量同级评审、0008 agent Studio、0009 Studio 编辑事务、0010 Studio 风格与构造、0011 Studio 角色与跨帧）

本项目当前没有 `CONTEXT-MAP.md`（未做领域拆分）；如将来拆分领域再建立。
