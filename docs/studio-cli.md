# PGA Studio CLI 使用指南（agent 面向）

本指南是 `bin/pga-studio.mjs` 的完整使用合同。面向具备 JSON 与图像查看能力的 agent：
你**不需要写任何绘图代码**——资产由 Studio 文档（JSON）声明，经工具包渲染、检查与导出。
所有编辑都通过 CLI 命令完成；**不要手工修改工作区里的任何文件**。

术语与边界：仓库 `CONTEXT.md`；架构：ADR-0008/0009。本文与实现严格一致；
若命令行为与本文不符，以实际 JSON 输出为准并报告差异。

## 0. 快速心智模型

```text
Studio 文档（.studio.json，唯一可编辑源）
  → create 初始化工作区（r1，head=r1）
  → inspect 看节点、能力（每个节点支持什么操作与参数范围）
  → edit / explore 产生未提交候选（绝不改变 head）
  → commit --accept 接受候选（head 前进）或 --restore 恢复旧内容为新修订
  → export 导出既有资产格式（.asset.json + 图集 PNG + manifest）
```

工作区目录结构（只读查看，不要手改）：

```text
<ws>/head.json            当前已确认修订 { head: 'r3', seq: 3 }
<ws>/revisions/rN.json    不可变修订（含规范化文档与哈希）
<ws>/candidates/c-*.json  未提交候选（含检查结果与预览路径）
<ws>/previews/**          edit/explore 产生的基准与候选证据 PNG
```

预览落盘位置（容易搞错，注意）：

- `create` 的基准预览写在**工作区根目录**：`<id>.native.png` / `<id>.display.png`；
  result.files 里的值是**相对于 outDir 的裸文件名**。
- `edit` / `explore` 的预览在 `<ws>/previews/<标签>/` 下（基准为 `<基准修订>-base`，候选为候选 ID）。
- `commit` 不写新预览：被接受候选的预览就是当前 head 的渲染；需要时可用
  `inspect --ws <dir> --out <dir>` 重新生成 head 的预览图。

坐标系：result 里的 `inner` 是文档内画布尺寸；返回的 `anchor` / `attachments` /
`frameRect` / `frameBounds` / `final` 都是**最终帧坐标**——默认描边时比文档声明大
（内画布 +2，坐标 +1）。`final` = 内画布 +2；`frameRect` = 文档 rect 平移 +1。

## 1. 通用合同

- stdout 只输出 JSON：成功 `{ "ok": true, "command": ..., "result": ... }`；
  失败 `{ "ok": false, "error": { code, message, target, details, retryable, suggestedNextAction } }`。
- 人类可读日志在 stderr，不要解析。
- 退出码：0 成功；2 用法/输入错误；3 校验/编译/候选失败；4 覆盖或工作区路径保护；
  6 版本/请求冲突（STALE_REVISION / REQUEST_ID_CONFLICT）；7 工作区占用（WORKSPACE_BUSY，可重试）。
- 图像查看：命令返回的预览路径是仓库内 PNG 文件。用你的图像读取工具实际打开查看——
  **返回路径不等于已看图**；`native` 是原生尺寸，`display` 是最近邻放大的使用预览。

## 2. Studio 文档（pga-studio/1 与 pga-studio/2）

只含可序列化 JSON（无函数/无代码/无 URL）。未知版本、未知字段、非法值一律拒绝。
两个版本共存：`pga-studio/1`（冻结词汇）与 `pga-studio/2`（扩展词汇）。
/2 相对 /1 新增：`poly`/`disc` 几何、`shade-diag` 材质、`ramp` 局部覆盖、`style.meta`。
**你写新文档时用 /2；旧 /1 文档照常可用。**

```json
{
  "schemaVersion": "pga-studio/2",
  "id": "terminal",
  "seed": 20260928,
  "renderProfile": { "name": "pixel-flat", "version": 1 },
  "style": {
    "id": "steel-console",
    "version": 1,
    "ramps": {
      "steel": ["#232830", "#49525f", "#707b8d", "#a6b0c2"]
    },
    "meta": { "license": "CC0", "source": "toolkit-original", "focusRamp": "steel", "notes": "可选" }
  },
  "canvas": { "w": 30, "h": 30, "outline": "#120d16" },
  "nodes": [
    { "id": "terminal.shell", "kind": "panel", "x": 2, "y": 2, "w": 26, "h": 23, "ramp": "steel", "material": "bevel-metal", "layer": 1 },
    { "id": "terminal.screen", "kind": "screen", "x": 4, "y": 5, "w": 14, "h": 13, "ramp": "steel", "material": "scanlines", "layer": 2 }
  ],
  "anchor": { "x": 15, "y": 28 },
  "attachments": { "screenCenter": { "x": 11, "y": 11.5 } },
  "constraints": [
    { "kind": "pixels", "target": "terminal.screen" },
    { "kind": "metadata", "target": "anchor" }
  ]
}
```

字段规则（未列"可选"的字段均为必填；可选字段缺省时按下述默认值）：

- `id`：小写字母数字开头，可含 `. _ -`（≤64 字符）。
- `seed`：整数。同文档同种子必得同像素（确定性）。
- `style.ramps`：1–16 个命名色阶，每个恰好 4 个 `#rrggbb`，顺序 = shadow/base/light/highlight。
- `style.meta`（可选，仅 /2）：`license` / `source` / `focusRamp`（须为已声明色阶）/ `notes`，
  均为 ≤200 字符字符串。记录风格来源与焦点色约定，参与 styleHash。
- `canvas`：`w/h` 为 2–512 整数，是**内画布**；`outline`（可选）默认 `#120d16`，
  最终输出 = 内画布 +2（四周 1px 描边扩边）。`"outline": null` 则不扩边。
- `nodes`：1–64 个扁平节点（无父子）。公共字段：`id` 点分命名（如 `terminal.shell`，全小写）；
  `kind`、`ramp`、`material`、`layer`（可选，默认数组下标，小的先画）。几何字段按类型：
  | kind | 几何字段 | material 可选项 |
  |---|---|---|
  | `panel` | `x,y,w,h`（整数，矩形在内画布内） | `flat` / `bevel-metal` / `shade-diag`（/2） |
  | `screen` | `x,y,w,h` | `flat` / `scanlines` |
  | `poly`（/2） | `vertices`：3–8 个 `[x,y]` 整数对（单环多边形，可凹） | `flat` / `shade-diag` |
  | `disc`（/2） | `cx,cy,rx,ry` 整数，整体在内画布内 | `flat` / `shade-diag` |
  材质语义：`flat` 平涂基色；`bevel-metal` 上/左受光、下/右阴影、左上高光角；
  `scanlines` 暗框 + 扫描线 + 确定性字符短划（带种子纹理）；
  `shade-diag` 在节点包围盒上按对角分带（高光/受光/基色/阴影）概括体积——是风格化概括不是物理光照。
- `ramp`：共享色阶名（字符串），或（仅 /2）`{ "shades": ["#rrggbb" × 4] }` **局部覆盖**——
  只作用于该节点，不影响共享色阶与其他节点。
- `anchor`（可选）/ `attachments`（可选）：内画布像素边界坐标；名称字母数字下划线。缺省 anchor = 底边中点。
- `constraints`（可选）：保护声明（edit/explore/commit 时强制执行，证据见候选 checks）：
  `{kind:'pixels', target:<节点>}` 该节点最终帧区域 RGBA 不得变（区域 = 节点包围盒，
  其透明角处露出的下层变化也算命中——保守语义）；
  `{kind:'structure', target:<节点>}` 该节点字段不得变；
  `{kind:'metadata', target:'anchor'|'attachments'|'attachments.<名>'|'frameSize'}` 对应元数据不得变。
  **修改一个本身受 pixels/structure 保护的目标会被 CONSTRAINT_CONFLICT 拒绝。**
  注意保守语义：若把保护加到包围盒互相重叠的节点上，下层节点在其透明角处的任何
  可见变化都会被判违规（任务会无解）——保护目标应与操作影响区域匹配，不是越多越好。

- 已知边界：过窄的多边形（某方向 < 1px）栅格化后可能只剩少量像素甚至丢失——
  用 create/inspect 返回的 `opaquePixels` 与 `frameBounds` 核实声明与落像是否一致，
  需要细件时优先用窄 rect 的 panel 而不是细 poly。

## 3. 命令

### create — 初始化工作区

```bash
node bin/pga-studio.mjs create --doc <file.json> --out <ws> [--display-scale N] [--bg #rrggbb]
```

校验 + 渲染 + 初始化工作区（r1，head=r1），写预览与源文档。`--out` 已是有内容的工作区会被拒（保护历史）。
result 含：`head`、`nodes[]`（定位）、`hashes`、`files`（预览路径）。

### state — 工作区状态

```bash
node bin/pga-studio.mjs state --ws <dir>
```

返回 head、修订列表、候选列表（含状态）、临时残留文件。

### inspect — 看节点与能力

```bash
node bin/pga-studio.mjs inspect --ws <dir> [--revision rN] [--node <id>] [--out <dir>]
node bin/pga-studio.mjs inspect --doc <file.json> [--node <id>] [--out <dir>]
```

返回每个节点的定位（最终帧坐标）、`capabilities`（该节点支持的操作、参数范围、单位、示例）、
诊断与哈希。**动手前先 inspect，不要猜字段。** `--node` 会产出该节点的裁切图。

### edit — 单个受约束修改（产生未提交候选）

```bash
node bin/pga-studio.mjs edit --ws <dir> --base rN --op <id> --target <node> \
  [--params '{"w":28}' | --material <名> | --ramp <名>] [--preserve '<json数组>'] [--request-id id]
```

三个操作：

| op | 参数 | 语义 |
|---|---|---|
| `geometry.set` | `--params '<json>'` 至少一个该节点类型的几何字段 | 修改几何（px）：panel/screen 用 `x/y/w/h`；disc 用 `cx/cy/rx/ry`；poly 用 `vertices`（3–8 个整数对） |
| `material.set` | `--material <该类型已实现的材质>` | 切换材质规则 |
| `ramp.set` | `--ramp <已声明色阶名>` 或 `--ramp '{"shades":["#rrggbb"×4]}'`（/2 局部覆盖） | 换色阶 |

result 含：`candidateId`、`status`、`conflicts`、`diff`、预览路径。状态：

| status | 含义 |
|---|---|
| `OK` | 通过全部保护检查，可提交 |
| `UNCHANGED` | 与基准渲染相同（不算"已经改好"） |
| `REJECTED` | 未通过保护（`code` = CONSTRAINT_CONFLICT / CANDIDATE_INVALID），不可提交 |

### explore — 同基准候选探索

```bash
node bin/pga-studio.mjs explore --ws <dir> --base rN --op <id> --target <node> \
  --field <几何字段|material|ramp> --values 24,26,28 [--preserve '<json数组>'] [--request-id id]
```

同一基准、同一操作、一个字段的有限取值（≤16）。每个取值一个候选；
渲染相同者标注 `duplicateOf`，`uniqueCount` 是不重复候选数。逐一查看预览后再选择。
`--values` 为逗号分隔的标量；探索 poly 顶点等复合值时传整个 JSON 数组
（如 `--values '[[[1,2],[3,4],[5,6]],[[2,2],[3,4],[5,6]]]'`，即"取值组成的数组"）。

### commit — 接受或恢复（唯一移动 head 的入口）

```bash
node bin/pga-studio.mjs commit --ws <dir> --accept <candidateId> --expected-head rN [--request-id id]
node bin/pga-studio.mjs commit --ws <dir> --restore rN --expected-head rM [--request-id id]
```

- `--expected-head` 必须等于当前 head（用 state 查），否则 STALE_REVISION（退出码 6）。
- 候选派生基准必须等于当前 head，否则 STALE_REVISION——先看新状态再重新探索。
- 接受时会重新校验候选（不信落盘结果）；被 REJECTED 或篡改的候选一律拒绝。
- restore 创建引用旧内容的新修订（历史不抹除）。
- 同一 `--request-id` + 相同内容重试返回同一结果（不重复接受）；同 ID 不同内容报 REQUEST_ID_CONFLICT。

### export — 导出既有资产格式

```bash
node bin/pga-studio.mjs export --ws <dir> [--revision rN] --out <dir>
node bin/pga-studio.mjs export --doc <file.json> --out <dir>
```

产出 `<id>.asset.json`、`<id>.page0.png`、`<id>.manifest.json`（版本化清单）与可编辑源文档副本。
图集默认每帧四周留 2px 透明边距（`--margin`），所以单帧 32×32 的页面会是 36×36 之类；
页面尺寸 = 帧尺寸 + 2×margin，不是错误。

## 5. 角色文档（pga-studio/character/1，M5 起）

既有 humanoid 配方的结构化数据面：同一工作区与命令，换一类文档与操作。
样例：`examples/studio/rustclaw.studio.json`（锈爪：13 帧、4 剪辑、焊接面罩 + 青色目镜带）。

```json
{
  "schemaVersion": "pga-studio/character/1",
  "id": "rustclaw",
  "seed": 42,
  "template": { "id": "humanoid-rig", "version": 1, "checkedPoseKinds": ["rig"] },
  "meta": { "source": "...", "license": "CC0", "notes": "可选" },
  "frame": { "w": 40, "h": 46, "feetY": 44, "bodyX": 20 },
  "palette": { "V": "#39d0c4", "A": "#8a4b26" },
  "art": { "head": ["..AAAA.."], "torso": ["BBKK"] },
  "rig": { "hipY": -11, "thigh": 4, "shin": 4, "thick": 4, "guns": { "fwd": { "grip": [7, -14], "dir": [1, 0], "back": 3, "len": 7 } } },
  "poses": [{ "id": "stand_fwd", "kind": "rig", "legs": [[-9, 3], [11, 5]], "aim": "fwd" }],
  "clips": { "run_fwd": { "frames": ["run0_fwd"], "ms": 110 } },
  "constraints": [{ "kind": "metadata", "target": "anchor" }]
}
```

要点：

- `palette` 单字符键 → 颜色（ASCII 图与绘制共用）；`art.head/torso` 为 ASCII 像素图（字符须取自调色板或 `.` 空格）。
- `rig` 骨架参数经 solvePose 求解；`feetY` 是脚底边界行，接地由求解器自动保持。
- `poses` 姿态为显式数据；`kind ∈ rig|prone|dead|dive|ball`。
  `template.checkedPoseKinds` 声明**不变量检查适配的姿态种类**（首版 `["rig"]`）；
  其余姿态照常渲染，但在候选报告中列为 `notCoveredChanges`（明确不假装覆盖）。
- `constraints` 仅 `metadata` 类别：`anchor` / `attachments[.<名>]` / `frameSize`；
  pixels/structure 类别校验期即拒绝（UNSUPPORTED_SCOPE，未实现）。

角色操作（edit 用 `--op <id> --target <目标> --value <值>`；explore 用 `--values`）：

| op | target | value | 影响 |
|---|---|---|---|
| `palette.set` | 调色板键（如 `V`） | `'#rrggbb'` | 全部使用该键的帧一致改色 |
| `rig.set` | `thigh/shin/thick/hipSpread/hipY/torsoDrop/headDx/headDrop` 或 `guns.<方向>.<len|back>` | 整数（范围见 inspect capabilities） | solvePose 重解；接地保持；枪口等附件点一致联动 |
| `art.set` | `head` / `torso` | ASCII 行 JSON 数组 | 部件替换；尺寸变化会合法移动头部附件点（报告如实呈现） |

角色候选检查：锚点（脚底中线）不动、接地（包围盒底缘）不变、受影响帧/剪辑/附件点自动报告。
inspect 的 `capabilities` 给出每个字段当前值与范围；previews 下有逐帧 native/display PNG 与
**player.html 播放页**（按剪辑时长真实播放，可暂停/步进/切剪辑；动画验收请实际观看播放）。

## 4. 纪律

- 只用 CLI 改状态；不手工编辑 `<ws>` 内文件；不把文档写成代码。
- edit/explore 后**实际查看候选预览图**再决定接受哪一个；允许一个都不接受。
- 操作前 inspect；提交前 state；出错看 `error.suggestedNextAction`。
- `--preserve '<json数组>'` 追加请求级保护项，元素形如
  `[{"kind":"pixels","target":"terminal.shell"},{"kind":"metadata","target":"anchor"}]`，
  与文档内 constraints 合并生效（判责同 §2 的保守语义，别滥加）。
- 样例文档：`examples/studio/terminal.studio.json`（/1 四节点机械终端，内画布 30×30，输出 32×32）、
  `examples/studio/wrench.studio.json`（/2 扳手：poly 手柄/钳口 + disc 螺栓 + shade-diag，输出 26×26）。
