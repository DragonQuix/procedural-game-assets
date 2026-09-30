# Studio 单帧位图创作（v1.5 alpha，工具包 0.10.0）

依据：`../CONTEXT.md`、ADR-0014/0015；事务与通用命令见 `studio-cli.md`。
支持 Agent 自己看图、创建和绘改，不包含自动识别、图像生成服务或自动保真评分。

## 最小流程

```powershell
node bin/pga-studio.mjs create --blank --id mask-sample --width 32 --height 32 --out work/mask-ws
node bin/pga-studio.mjs edit --ws work/mask-ws --base r1 --operation examples/studio/raster-mark.draw.json
# 打开返回的 previews.candidate.native/display PNG，实际看图后再接受。
node bin/pga-studio.mjs commit --ws work/mask-ws --accept <candidateId> --expected-head r1
node bin/pga-studio.mjs inspect --ws work/mask-ws --out work/mask-observation
node bin/pga-studio.mjs export --ws work/mask-ws --out work/mask-export
```

`create` 在 `--doc`、`--blank`、`--image <PNG>` 中三选一。位图创建需要 `--id`；
空白创建必须指定 width/height，导入默认使用原尺寸。导入同时指定尺寸时必须相等，不暗中 resize。
`--anchor '{"x":16,"y":30}'` 和 `--attachments '{"head":{"x":16,"y":10}}'` 可在创建时指定。
未指定锚点时为画布底边中点，不代表 Studio 已识别脚底。

## 编辑合同

`edit --operation <JSON>` 与内联 `--op/--target/--params/--value` 互斥；文件是输入指令，
不是工作区内部文件。输入解析后冻结在候选中，可安全删除原输入文件。
操作产生候选，不移动 head；接受时仍会从基准重推导、重编译和核对保护。

`raster.draw` 的形状：

```json
{
  "id": "raster.draw",
  "target": "canvas",
  "params": {
    "region": { "id": "visor", "x": 8, "y": 6, "w": 4, "h": 3, "mask": ["0110", "1111", "0110"] },
    "commands": [
      { "kind": "rect", "x": 0, "y": 0, "w": 4, "h": 3, "color": "#ed721f" },
      { "kind": "pixel", "x": 1, "y": 1, "color": null }
    ]
  }
}
```

- region 是最终帧内矩形，右下排他；mask 可省略，存在时必须为 h 行、每行 w 个 0/1。
- 绘制坐标默认相对 region 原点，必须为整数；`pixel` 用像素索引，line 端点遵循 PixelPainter 规则。
- mask=0 的像素不受影响；mask 全零拒绝。原语越出矩形报错，不靠掩码隐藏非法绘制。
- color 为 `#rrggbb` 或 null；null 真正擦除 RGBA，不是覆盖一层背景色。
- 支持 pixel(x,y)、rect(x,y,w,h)、line(x0,y0,x1,y1,thick?)、poly(points)、path(points,thick?,closed?)。
  一次最多 128 条，poly 3..128 顶点，path 2..128 顶点；line/path 粗细 1..64，合计最多 512 条线段。
  没有渐变、软笔刷或半透明混合。

### 连续路径与画布坐标（0.9.1 起）

观察图定位到的是最终画布坐标时，可直接声明 `params.coordinateSpace: "canvas-pixels"`，
不必手动减去选区原点；省略或 `"region-local-pixels"` 保持旧行为。不自动猜测坐标系。
两种坐标系都必须落在同一事先声明的 region 中，矩形宽高和笔刷粗细不平移。
region/mask 和锚点、附件点仍使用原合同，不受该字段影响。

```json
{
  "id": "raster.draw",
  "target": "canvas",
  "params": {
    "region": { "id": "contour-a", "x": 8, "y": 6, "w": 16, "h": 20 },
    "coordinateSpace": "canvas-pixels",
    "commands": [
      { "kind": "path", "points": [[11, 10], [20, 10], [20, 20], [16, 23], [11, 20]], "closed": true, "color": "#ff922c" }
    ]
  }
}
```

path 默认不闭合；closed=true 追加末点到首点的线段，**不填充内部**。
每段等价于已有 line，连接处不做额外圆角或平滑。粗笔刷的全部覆盖必须在 region 矩形内，
不能用 mask 隐藏越界；color=null 沿路径擦除。完整纯 JSON 样例见
`examples/studio/raster-path.draw.json`，可直接替换最小流程中的 operation 文件。
这只减少输入拆分，不保证轮廓画得更好，也不提供贝塞尔曲线或自动描摹。

`raster.replace` 使用同样的 region，params.rgba 为 `w*h*8` 个小写十六进制 RGBA 字符。
也可以不填 rgba，使用 `edit --operation replace.json --image patch.png`，由 IO 层解码并冻结像素。
patch.png 必须恰好等于 region.w/h；替换包括透明擦除，选区外保留基准像素。

`raster.metadata` 的 target 为 `anchor` 或 `attachments`，value 为对应完整对象。
锚点与附件点是最终帧像素边界坐标；不更改像素，不自动识别人物关节。

### 显式尺寸草稿（0.10.0 起）

已有位图需要另一个等比例尺寸时，可用 `raster.resample` 生成候选，不必分开缩图、手算点位和重新导入。

```json
{
  "id": "raster.resample",
  "target": "canvas",
  "params": { "width": 16, "height": 16, "sampling": "nearest" }
}
```

可通过现有 operation 文件入口操作 32×32 的 mask-ws（修改示例尺寸以适配实际画布）：

```powershell
node bin/pga-studio.mjs edit --ws work/mask-ws --base <当前修订> --operation examples/studio/raster-resample.json
```

- 两个尺寸都必须为 1..256 整数，sampling 必须显式为 nearest，必须严格保持宽高比。
  不支持拉伸、裁切、平滑插值或省略采样规则。create 导入仍只接受原尺寸。
- 目标像素中心采样源索引 `floor((i+0.5)*sourceSize/targetSize)`，复制二值 alpha RGBA。
  anchor/attachments 按边界坐标比例变换且不取整；ID、seed、constraints 不变，同尺寸为 UNCHANGED。
- checks.resample 给出 from/to、sampling 和点位前后值。全画布 pixels 或 frameSize 保护仍会拒绝
  尺寸变化，空白图也不能绕过；anchor/attachments 保护按最终值检查，不自动放宽合同。
- 尺寸变化时 diff.total/outside 为 null，reason=FRAME_SIZE_CHANGED，**不是区域外零变化**。
  observe 保留真实尺寸的拼图，但差分为 NOT_COMPARABLE / FRAME_SIZE_MISMATCH，计数与 files 为 null。
  传入的 region 属于基准尺寸，不自动映射到尺寸候选，候选 crop 也标不可比较。
- 候选照常提供 native/display/light/silhouette 和身份绑定，没有虚假局部图。
  先实际看目标原尺寸和背景图再接受为草稿；拒绝时不提交，恢复仍用 commit --restore。
  接受草稿后按新尺寸重新选择 region，用已有 poly/path/replace 重组细节并检查点位。

重采样可能丢失眼缝、装饰和连接边，不负责临摹、风格转换或识别特征重构。
几何点同比缩放也不证明附件仍落在可见部件上；每个目标尺寸必须独立看图，不能沿用源尺寸的视觉通过。

## 看图、比较与回退

0.9.2 起，位图 `edit` 的 `previews.base/candidate` 在接受前就返回 light、silhouette、
observation；绘制/替换操作另带 selection、crop、cropDisplay，自动使用本次 region。
先看返回的候选视图，再决定是否 commit，不需要先接受才能做局部检查。
基准裁切按候选隔离；observation 绑定基准 revision、候选 ID（基准图为 null）、文档/渲染哈希和 region。
候选状态仍以 edit 的 status/checks 为准；有预览不等于候选可提交，更不等于视觉通过。
旧候选和旧幂等请求记录不自动补视图；需要时重新 edit 并使用新的 request-id，不改历史文件。

0.9.3 起，带 region 的位图 edit/inspect 另返回 cropLight、cropSilhouette：
在同一裁切与 2px 邻域内，用不透明浅底检查深色轮廓、透明断口和部件连接。
cropLight 保留原不透明像素的颜色，cropSilhouette 只保留不透明形状；背景记录在
observation.target_crop.backgrounds，仍与修订、候选和哈希绑定。crop/cropDisplay 继续保留透明，
所有观察背景和覆盖都不进入文档、native 或导出资产。无 region 的元数据修改不返回虚假局部图。

```powershell
node bin/pga-studio.mjs inspect --ws work/mask-ws --region '{"id":"visor","x":8,"y":6,"w":16,"h":20}' --out work/mask-detail
node bin/pga-studio.mjs observe --ws work/mask-ws --candidates '["<candidateId>"]' --region '{"id":"visor","x":8,"y":6,"w":16,"h":20}' --out work/mask-compare
node bin/pga-studio.mjs commit --ws work/mask-ws --restore r1 --expected-head r2
```

inspect 输出原尺寸、指定背景放大、浅色背景、剪影；带 region 时追加裁切与粉色选区覆盖。
选区覆盖只属于观察图，不能拿它交付。region 与 node 不能同时提供。
observe 只展示当前基准下完整性与检查通过的已有候选，并记录候选 ID、差分和裁切。
restore 创建新修订，不抹除历史。过期候选不能接受，位图 edit 也要求当前 head。

### 局部修整的操作顺序

- 保留旧证据；需隔离试改时，从导出的 .studio.json 用 create 建立新工作区，不直接重跑旧绘制脚本。
- 先给局部稳定 region ID，选区包含连接边与少量邻域；查看 selection 和
  observation.target_crop.crop 的画布原点。裁切图索引不是画布坐标；放大图的像素位置先除以
  target_crop.scale 再加裁切原点，才是 canvas-pixels 输入坐标，不能直接抄放大图的像素位置。
- 一次只修一个可见问题。已有 poly 用于填色、path 用于轮廓或笔画、color=null 用于透明擦除，
  不预设必须加新操作，也不把某种角色或手部造型写成模板。擦除后重画尤其要检查连接处。
- 只补笔画且需保留底层时，优先 raster.draw。raster.replace 的 mask=1 处，透明补丁会擦除
  基准 RGBA，不是透明叠加；独立部件的透明背景可能抹掉同选区内的衣料或连接。
  需保留的像素用 mask=0，或在补丁中带回已确认基准；接受前用 cropSilhouette 检查内部断口。
- 接受前先看候选 cropLight/cropSilhouette 的轮廓和接缝，再看 native 与声明背景下的整体。
  局部细节变多不等于改善；轮廓断开、尺寸下不可读或破坏设计时可不接受候选，head 不变。
- 看图仍由 Agent 判断，技术 diff.outside=0 只证明选区外未变。若问题在现有操作下可表达，
  优先改操作或指导；只有出现可复用缺口才改工具。证据足以支持维护决定时停止打磨。

### 复用检查的材料边界

另一种角色结构的复用检查，应先实际看未参与调工具的设计，记录来源、源图尺寸、目标帧尺寸、
显示倍率、少数必须保留与允许概括的特征，再写一句待验证假设。不要拿既有配方输出或本轮自绘输入
冒充留出设计。缺少合适材料时，说明缺口并请求附图或准确路径，不扫描无关用户目录。
只有存在明确代码、指导或维护收益时才做最小合成探针；它可验证操作链，不认证用户设计临摹、
泛化能力或完整尺寸迁移。每个目标尺寸独立审图，技术通过与视觉裁决分别记录。

文档级 constraints 与请求级 preserve 支持全画布 pixels:canvas，以及
metadata:anchor/attachments/attachments.<名称>/frameSize。没有区域冻结合同，
`protection=NOT_CONFIGURED` 不代表全局保护通过。每次绘改仍独立检查选区外 RGBA 不变。

## 导入与交付边界

- `pga-studio/raster/1` 内嵌像素，无外部资源依赖；边长 1..256，二值 alpha。
  透明 RGB 规范化为 0；未知字段、版本、危险名称均拒绝。
- PNG 文件最多 4 MiB；解码前检查尺寸。不接受 APNG、ICC、EXIF、cHRM 或非默认 gamma；
  需要时由外部工具显式转换。半透明不自动阈值化，带背景的图也不自动去背。
- 原始角色设计图可以是大图，仅供 Agent 看图，不需要强行作为 Studio 文档导入。
- 输出最终尺寸与声明相同，不默认描边、扩边、缩放或量化。
- 导出 `.studio.json` 是可再次创建工作区的编辑源；同时导出标准 `.asset.json`、PNG 图集和 manifest。
  runtime kind 为 raster；可直接编译后传给既有 CanvasBank。导出不等于视觉验收通过。
- 参考身份、造型授权与风格要求由任务说明和 Agent 负责。先看轮廓/比例/识别特征，
  再修局部细节；看目标尺寸和场景背景，不只看放大图。
- 当前无动画、图层、位图 explore、自动风格转换或跨尺寸细节重构；显式重采样只提供尺寸草稿。
