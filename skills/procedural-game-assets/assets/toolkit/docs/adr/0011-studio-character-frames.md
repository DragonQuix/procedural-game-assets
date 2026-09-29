# ADR-0011：Studio 角色与跨帧——数据面、不变量与播放材料

日期：2026-09-28。状态：已接受（M5 范围）。

## 背景

M1–M4 的 Studio 处理单帧静态道具。HANDOFF M5 要求把修改一致传播到明确支持的
角色与动作：选择**一个**已有角色及其现有待机/移动剪辑，复用 `solvePose`；
区分资产级共享字段/部件字段/帧覆盖；自动报告受影响帧与附件点；未适配姿态明确
返回不支持；生成实际播放材料；动画验收必须实际观看播放。

## 决定

1. **角色文档 `pga-studio/character/1`**：既有 humanoid 配方的结构化可编辑数据面
   （`src/studio/character-doc.js`）。资产级共享字段（`palette` / `frame` / `rig`）、
   部件字段（`art.head` / `art.torso`）、显式姿态与剪辑数据（`LEG_POSES`/`runLegs`
   具体化为数值，文档无函数）。`template.checkedPoseKinds` 声明不变量检查适配的
   姿态种类（首版 `['rig']`）。帧覆盖（逐帧参数）本轮**未实现**，如实记录。
2. **编译 = 数据映射，不是新渲染器**：`character-compiler.js` 把文档映射为内存
   `CharacterSpec` 交给既有 `bakeHumanoid`；`BakedAsset.kind` 保持 `'humanoid'`，
   导出/manifest/Canvas 路径不变。等价性锚点：样例文档编译与
   `bakeHumanoid(rustclaw)` 逐帧逐字节一致（renderHash `11c587dd:d890d15f`）。
3. **三个角色操作**（`character-ops.js`）：`palette.set`（共享改色，传播全部所需帧）、
   `rig.set`（骨架标量与 `guns.<aim>.<len|back>`，经 solvePose 重解）、
   `art.set`（同约束 ASCII 部件替换）。不编辑姿态/剪辑、不支持任意骨架。
4. **跨帧检查**（`checkCharacterCandidate`）：
   - 结构完整性：只允许 plan 声明的点路径变化（含嵌套下钻）。
   - 不变量（仅 checked 姿态帧）：锚点（脚底中线）不动；接地 = 包围盒**底缘**不变
     （顶缘随体高/腿长合法变化，不算破坏）。
   - 受影响报告：逐帧 diff 像素数、附件点 delta（如枪口随枪长 +2 一致联动）、
     受影响剪辑；未适配姿态帧列为 `notCoveredChanges`——已重渲染但不断言（不假装覆盖）。
   - metadata 保护按声明核对（anchor / attachments[.<名>] / frameSize）；
     pixels/structure 类别在文档校验期即 `UNSUPPORTED_SCOPE` 拒绝。
5. **播放材料**：`observe.buildCharacterViews` 产出自包含 `player.html`
   （帧 data URL 内嵌，按剪辑毫秒时长播放，可暂停/步进/切剪辑）；
   计时用墙钟累加 + rAF/interval 双驱动，隐藏标签页也按真实时间前进（实证修复）。
   播放页是观察产物，不进对外 manifest（ADR-0003 合同不变）。
6. **store/CLI 文档类型无关**：`studio/dispatch.js` 按 schemaVersion 集中分派
   编译/操作/检查/能力声明；修订、候选、幂等、恢复语义与 M2 完全一致。
7. **本轮不做**：任意姿态/骨架/生物、帧覆盖、逐姿态材质差异、APNG/GIF 编码器
   （播放走 HTML 页）、角色像素保护类别。

## 后果

- 同一修改（改色/腿长/枪长）在约定动作中保持身份、接地、附件关系与材质一致，
  且有逐帧受影响报告与恢复哈希证据；动画验收以真实浏览器播放截图为据。
- 旧 humanoid 配方与所有既有测试不变；`/1`、`/2`、`character/1` 三类文档共存于同一工作区体系。

## 修订（2026-09-28 审查修复轮，R2/R8）

- `template.checkedPoseKinds` 的声明范围由引擎实际适配能力决定（当前仅 `rig`）；
  作者声明未适配种类按 UNSUPPORTED_SCOPE 在校验期拒绝，不能自报扩大检查覆盖（审查 §5.1）。
- 像素/元数据/帧尺寸/剪辑变化分别计算；metadata 保护遍历全部帧（含 notCovered 与
  仅元数据变化帧），不以像素变化为前提；UNCHANGED 须像素与元数据双不变（renderHash 一致）。
- `diffPixels` 按像素计（四字节一组），通道级差异另列 `changedChannels`。

## 备选方案（已否决）

- **把角色拆成 prop 节点（头/躯干/四肢各为节点）**：姿态联动（腿角→膝→踝→贴地）
  会变成第二套求解器，违背"复用 solvePose、几何只解一次"。
- **接地断言用整个包围盒**：腿长变化合法改变顶缘，误报（实证后修正为底缘）。
- **帧拼图当播放验收**：HANDOFF 明确要求实际播放材料与真实观看。
- **GIF/APNG 导出**：需要新编码器/依赖；自包含 HTML 播放页零依赖且可交互。
