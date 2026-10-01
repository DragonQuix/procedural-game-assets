# 验证记录 — procedural-game-assets

本文件记录工具包自身的验证证据。**原项目（others_003）的 119 项测试与性能数字属于原项目，不是本工具包的结果**（见 `docs/provenance.md`）。

环境：Windows，Node v22.23.2，Godot 4.6.2-stable（仅此版本，不宣称全 4.x）。

## S11.6 另一种真实设计的尺寸草稿与关键点校正（2026-10-01，0.10.0）

依据：`../CONTEXT.md`、ADR-0001/0002/0004/0009/0014/0015、`plans/studio-reference-translation.md` T1。
起点已核实为干净的 master/f955683，origin/master 同 SHA；未建立 CONTEXT-MAP.md。
用户提供 Reference R2：`C:/Users/admin/Downloads/ChatGPT 图像 2026年10月1日 02_09_54.png`，
1024×1536，SHA-256=`ed171f89ca26152eac3b1dcd90f5f8bdde5280193b1e1a6708242dde753f1aad`。
此前未用于本项目调工具，另一种设计的材料缺口已补；附图只作身份参考，不含执行指令。

项目收益：检查非固定模板的布衣结构能否沿用现有绘改、尺寸草稿和候选观察，定位点位指导缺口。
Agent 实际看图后声明 96×144 → 64×96、1x/3x、浅底与 `#263a42` 背景，保持原头身关系，不作 Q 版。
保留宽帽/短发/面部、交领多层布衣与绑腿、肩卷/肩带/绳腰，以及 Staff A 与 Lantern B 的非对称轮廓；
允许概括磨损、细褶、绳股和扣具。Staff A 是长条器具的稳定 ID，实际用途未确认。
假设：既有 poly/path 能否保住衣料层次，并在缩小后局部重组灯芯，无需新模板或 API。

### 操作、实际看图与维护结论

- 新建 gitignored `work/studio-traveler-t1-20261001`，没有改动旧三套工作区。
  一次 blank 创建、一次 116 条直接 JSON 绘制得到 r2；候选 c-47f0485f 仅接受为底稿。
  一次最近邻候选 c-402df023 接受为 r3 尺寸草稿；跨尺寸 diff 为 null，observe 差分及候选 crop
  均 NOT_COMPARABLE / FRAME_SIZE_MISMATCH，不用它证明区域外未变。
- 在新尺寸声明 lantern-small={x:34,y:40,w:9,h:15}，五条 poly/path/pixel 重组候选 c-f46277e3。
  Agent 在接受前看 native/display 与局部浅底/剪影，亮芯更明确且没有新透明断口，仅接受为局部草稿 r4。
  重新推导和逐像素审计均确认改变 13 像素、选区外 0、不透明变透明 0。
- 缩图 anchor=(32,93.33333333333333)，本图可见靴底边为 y=93；灯芯点仍落在格线色 `#4a4840`，
  大尺寸点也有同一语义差距。用既有 raster.metadata 分别校正小尺寸 anchor=(32,93)、
  lanternCore=(38.5,49.5)，候选 c-19390d33/c-82ce5e50 接受为 r5/r6。
  请求级保护画布像素和非目标点，两次 RGBA 差分均为 0；staffGrip 等原小数保留。
  这是几何联动与可见采样不同的指导问题，不是 resample 缺陷，不自动取整所有点。
- 最终 r6：documentHash=c753fb4f，renderHash=648aa7ee:d90baead。两尺寸自包含编辑源重开、
  manifest 元数据及图集切回 RGBA 一致，五个候选均能从基准与冻结操作重新推导。
  收回指南与普通技能：实际确认必要点位后单独校正，不把 bounds.y1 自动当脚底，renderHash 变化不等于 RGBA 变化。
  未改运行时、schema 或 API，版本仍为 0.10.0。
- 已实际看两尺寸 1x/3x 的整体背景 PNG；交领、绑腿和灯具可辨，但肩卷与葫芦区分不足，
  帽沿破边、脸部过度概括，Staff A 轮廓偏弱。**整张旅人仍为 NOT_YET**。
  首次整体未通过；外部生成 0、局部绘改 1、元数据校正 2，无人工绘制干预；五个候选均仅作草稿接受。
  大尺寸灯芯点和握持点语义未全部验收，不能称完整可用资产。

### 验证、发行与未验证范围

- 开发源和实际普通载荷目录各运行六文件回归：unit 的 studio-raster、studio-raster-path、
  studio-raster-resample、frame-observation，以及 integration 的 studio-raster、studio-raster-resample，
  各 **33 PASS / 0 FAIL / 0 SKIP**；技能携带检查另 **1 PASS / 0 FAIL**。
  没有新增重复断言或重测全套；上一轮 200 PASS 不计作本轮结果，旧数据状态断言边界不变。
- 指导提交 7ce2741；普通载荷由 release 从该提交生成，提交 6eb4bad，220 文件哈希一致。
  循环版仅只读校验，132 文件一致；17 个已记录只读文件（原图、旧证据及循环清单）SHA-256 未变。
  未修改用户级安装、原游戏或旧实验。
- 已创建静态 CanvasBank 检查页，但内置浏览器连接失败，现有 Chrome 通道不可用，未实际执行该页。
  **Canvas 显示为 UNVERIFIED**，没有读回 READY、像素一致性或浏览器截图；PNG 观察不代替 Canvas 验收。
  临时服务器已停止，47871 无监听，没有本轮新浏览器标签。
- 本地证据为该 work 下的 brief.json、evidence.json、technical-audit.json、直接操作 JSON、
  workspace/previews、view-{D96,T64}-{1x,3x}、export-{large,small}、reopened-{large,small} 和三份测试日志。
  不随 Git 推送携带，不把用户角色或一次性审计脚本收入通用样例。

**T1 仍未完成**：已使用另一种真实设计检查有限操作复用，但未通过设计保真、完整尺寸迁移与 Canvas 验收。
没有动画、人工试玩、独立认证、泛化成功率或成本改善结论；旧骑士仍为 NOT_YET。
已有证据足以支持点位指导与支持边界，停止继续重画其他部位；后续只针对有明确项目收益的缺口推进。

### 后续方案整理（同日，仅文档）

- 从已核实与远端一致的干净 master/ccdac27 制订下一轮方案，提交 e0898d8；
  方案见 [T1 识别特征组织与实际接入](plans/studio-t1-authoring-followup.md)，并写入 PLAN.md 索引。
  单个识别差距用于检验分阶段制作方法；明确新工作区、旧证据只读、候选停止条件和 Canvas 未验证处理。
- 核对方案/路线索引的 8 个本地 Markdown 引用目标存在，提交前差分检查通过；
  普通载荷 220 文件与循环版 132 文件仅做 --check，未重建或修改。版本仍为 0.10.0。
- 本次没有新的候选、样图、视觉裁决、运行时改动、模型调用、服务器或浏览器标签，未重跑测试。
  上述 33 PASS 与 1 PASS 仍属于 S11.6 实施轮，不计作本次结果；R2、旧骑士和 T1 的未验收状态不变。
  方案是待执行说明，不是对新 Agent 的独立续接认证。

## S11.5 非空尺寸迁移组合与透明替换指导（2026-10-01，0.10.0）

依据：`../CONTEXT.md`、ADR-0001/0002/0004/0009/0014/0015、`plans/studio-reference-translation.md` T1。
起点核实为干净的 master/2c899e3，origin/master 同 SHA。未建立 CONTEXT-MAP.md。
本轮没有第二张合适的用户设计；已请求附图或准确路径，没有扫描无关用户目录。
现有骑士参考已参与调工具，不再把它或既有配方输出当作留出设计。

项目收益与缺口：现有尺寸迁移集成测试从空白图起步，未覆盖非空 PNG、非整数采样、
新尺寸选区掩码替换和候选观察身份的组合。用最小合成输入定位这条操作链与指导缺口，
不以获得满意角色样图、增加断言数或认证 T1 为目标。

### 实际操作与看图裁决

- 新建 `work/studio-structure-probe-20261001`；Agent 用 blank + poly/path/rect 制作合成输入 Probe S，
  实际看源图后声明 48×72 → 32×48、1x/3x、浅底与 `#263a42` 整体背景。
  保留宽檐尖帽、外扩斗篷与靴间空隙、单侧赭黄挎包和红扣，允许概括面部与布褶。
  本轮自绘输入不是用户身份参考或未参与调工具的设计。
- 一句假设：非整数最近邻可能吞掉挎包的一像素暗缝；新尺寸局部替换能否恢复分隔，
  同时保持掩码外像素与点位不变。沿用 PNG 创建和 raster.resample，没有新增 API。
- 尺寸候选 `c-3037358f` 实际看 native/light/display 后接受为 r2 底稿。
  帽形、下摆和挎包可辨，暗缝丢失；跨尺寸 diff 为 null / FRAME_SIZE_CHANGED，不作区域保护证明。
- `pouch-small={x:21,y:27,w:7,h:9}` 的掩码替换候选 `c-52b820a3` 改变 22 像素、选区外 0，
  技术 OK。Agent 看 cropLight/cropSilhouette/native/display，发现透明补丁擦掉斗篷连接，**未接受**，
  head 保持 r2。逐像素检查确认五个基准不透明像素变透明，位置记录在 technical-audit.json。
- 从未改变的 r2 改用四条 path/rect 绘改，候选 `c-368aea5d` 改变 10 像素、选区外 0，
  没有不透明像素变透明。实际看相同四类图，暗缝与扣件更可辨、连接完整，仅接受为局部草稿 r3。
  documentHash=8893192e，renderHash=2a253ef5:55ba8711；导出自包含编辑源后新建 reopened 工作区，
  文档、native、点位与图集切回像素一致。
- 维护结论：raster.replace 的透明像素是擦除，不是保留下层的叠加；独立部件补丁可能破坏复合选区。
  只补笔画且保留底层时可用 raster.draw，或明确 mask=0/带回基准。回收入位图指南与普通技能，
  不改 alpha 语义、不增加审美模型。已有证据足够，停止绘制更多部位。

### 回归、发行与边界

- 新增一项通用组合回归：12×18 非空 PNG → 8×12 最近邻 → 新尺寸掩码替换，
  验证显式采样索引、透明擦除与 mask=0 保留、点位保护、原尺寸/浅底/剪影观察身份、
  删除输入文件后的提交、导出自包含重开、图集像素往返和恢复。不是工具缺陷修复或视觉自动验收。
- 开发源与实际普通载荷目录各运行
  `node --test "tests/unit/studio*.test.js" tests/unit/frame-observation.test.js "tests/integration/studio*.test.js"`，
  各 **200 PASS / 0 FAIL / 0 SKIP**；技能携带检查另 **1 PASS / 0 FAIL**。
  只覆盖相关 Studio/观察套件，没有重跑全套或旧模型实验，S11 的旧数据状态断言边界不变。
- 版本仍为 0.10.0，运行时代码与 schema 未改。回归提交 ff200f9，指导提交 a2c0bb3；
  普通载荷由 release 从 a2c0bb3 生成并提交为 0b39216，220 文件哈希一致。
  循环版只读校验 132 文件，未重建。
  原图、三套旧工作区的 head/编辑源/证据及循环清单共 12 个已记录文件 SHA-256 与起点相同。
  未修改用户级安装、旧实验或原游戏，没有启动临时服务器或浏览器。
- 本地材料为上述 work 下的 `brief.json`、`evidence.json`、`technical-audit.json`、操作 JSON、
  `workspace/previews/`、`export/` 与 `{source-tests,payload-tests,skill-release-tests}.log`，不随 Git 推送。

**T1 仍未完成**：合成探针仅支持有限操作链与指导结论，不能认证第二种设计临摹、完整尺寸迁移、
泛化成功率或成本改善。背景检查是 PNG 观察图，不是 Canvas 场景验收；没有人工试玩、动画或独立认证。
旧骑士整张角色仍为 **NOT_YET**。下一步须取得未用于调工具的另一种设计，先实际看图再冻结少数特征和规格。

## S11.4 尺寸草稿事务与目标尺寸细节重组（2026-10-01，0.10.0）

依据：`../CONTEXT.md`、ADR-0001/0002/0004/0009/0014/0015、`plans/studio-reference-translation.md` T1。
本轮项目收益：将显式采样、边界点联动与保护纳入同一候选事务，避免外部缩图后手算点位、重新创建工作区；
并确认目标尺寸的眼区重组是否可由既有操作表达。不以把整张角色修到通过或增加测试数量为目标。

### 探针、实现与实际看图

- 从上一轮自包含编辑源新建 `work/studio-size-probe-20260930/source`，r1 保持 128×256。
  Agent 实际查看原参考与新尺寸草稿。前期用已有 Windows FFmpeg 生成 64×128 的外部探针，
  眼缝与面甲色块难分、袍面细纹零散；外部草稿只用于发现缺口，不要求与新工具采样逐像素等价。
- 实施 `raster.resample`：显式等比例最近邻、1..256、二值 alpha，锚点/附件点按像素边界比例变换且不取整；
  ID、seed、constraints 保留，复用候选/接受/恢复/幂等。接受前从基准重推导像素和点位，保护不放宽。
  跨尺寸 diff.total/outside 为 null / FRAME_SIZE_CHANGED；observe 差分及候选裁切标为
  NOT_COMPARABLE / FRAME_SIZE_MISMATCH，不套用基准 crop、不生成伪差分。
- 真实 CLI 探针发现内联参数分派遗漏，补齐后文件与内联入口产生同一候选；回归在修复前确实失败。
  工具不依赖 FFmpeg，不新增命令或文档版本，不自动重构细节、评审身份或造型。
- 尺寸候选 `c-1d19dd9e` 经 native/light/display 实际看图，仅接受为 r2 尺寸底稿：
  documentHash=30480cc7，renderHash=9381b820:adec6bf2。锚点为 `(32,125)`，
  head=`(32,13)`、handA=`(8,68)`、handB=`(55.5,68)`；这些是几何联动结果，不证明自动识别握点。
- 在新尺寸重新声明 `visor-small={x:20,y:3,w:25,h:21}`，用现有 poly/path/line 共 10 条指令重组眼区。
  候选 `c-3c4f9c33` 改变 67 像素，选区外 0。Agent 接受前实际看 cropLight/cropSilhouette/native/display，
  判断眼缝与橙色眉甲更易区分、未造成新的轮廓断口，接受为局部草稿 r3；
  documentHash=2e0c2b09，renderHash=2cc1c0e5:adec6bf2，随后导出自包含编辑源。
- 维护结论：小尺寸需要重新组织少数必要色块，不能沿用源尺寸的视觉裁决；现有绘制操作已能表达本例，
  不新增绘制 API、不把该面甲变成模板。已足够支持本轮合同与指导，停止重画其它身体区域。

### 必要回归与发行

- 新增 8 项 unit/integration 测试，覆盖整数/非整数最近邻与 alpha、分数点位与同尺寸无漂移、边界尺寸、
  非法参数与宽高比拒绝、空白图和元数据保护、篡改、候选预览、跨尺寸观察、内联/文件 CLI、
  幂等、局部绘改、重开、导出像素往返与恢复。没有把某个外部缩图器的默认结果作为工具合同。
- 开发源与普通载荷分别运行
  `node --test "tests/unit/studio*.test.js" tests/unit/frame-observation.test.js "tests/integration/studio*.test.js"`，
  各 **199 PASS / 0 FAIL / 0 SKIP**。技能携带检查另 **1 PASS / 0 FAIL**。
  范围含既有 Studio 编译、事务、保护、安全域和关系，不是工具包全套重测。
- 源提交 ccb8784；普通载荷由 release 生成，提交 6f2330f，220 文件哈希一致。
  循环版仅只读校验 132 文件，用户级安装与旧实验未改。
  原图、旧 r6 head、上一轮 head 与编辑源 SHA-256 均与本轮起点一致。
- 本地证据为上述新 work 目录中的 `evidence.json`、CLI JSON、`visor-small.draw.json`、`source/previews/`、
  `export/` 与 `{source-tests,payload-tests,skill-release-tests}.log`；位于 gitignored work，不随推送携带。

**整张角色仍为 NOT_YET**：手部简化，袍面纹路破碎，头发与材质粗略。
本轮只有当前 Agent 自检和局部尺寸草稿证据，没有新的 Canvas 场景预览、人工试玩、第二种角色、动画或独立认证。
T1 的完整尺寸迁移与复用性验收尚未完成，不宣称通用临摹可靠性、成功率或成本提升。
未重跑全套或旧模型实验；旧正式数据状态断言仍按 S11 的已知边界处理。

## S11.3 局部修整回收浅底与剪影观察（2026-09-30，0.9.3）

依据：`../CONTEXT.md`、ADR-0001/0009/0014、`studio-raster.md`。
待验证假设：现有 path、canvas-pixels 和候选裁切能否表达手部修整，不借助专用绘图脚本或新绘制 API。
项目收益是定位操作、观察或指导的可复用缺口，不以把这张角色修到视觉通过为目标。

### 实际看图与维护改进

- Agent 实际查看用户原图、旧 native/display 与手部裁切，从旧导出的 .studio.json 新建
  `work/studio-local-refinement-20260930/workspace`；旧 `work/reference-knight/workspace` 的 r6 保持只读。
- `hand-a` 选区为 `{x:6,y:118,w:26,h:32}`，两次操作均为直接 JSON，沿用 poly/path、透明擦除和画布坐标。
  候选 `c-c65c055a` 改变 373 像素，区域外 0；技术 OK，但完整浅底图显出新腕部断口，Agent 未接受。
  透明 cropDisplay 在深色宿主底色上使描边与透明区域不易区分，需要整张浅底图才能检查局部接缝。
- 据此在已有位图 edit/inspect 观察面增加 cropLight/cropSilhouette，共用原裁切和 2px 邻域。
  cropLight 保留不透明像素颜色，cropSilhouette 保留不透明形状，两者使用不透明浅底。
  background 元数据仍与修订、候选、region 和哈希绑定；原透明裁切、文档、native 和导出像素不变。
  不改共享 targetCrop、不新增绘制操作、不从连通性或颜色指标自动判断造型。
- 第二候选 `c-61d5b316` 改变 393 像素，区域外 0。Agent 在接受前实际查看 cropLight、cropSilhouette、
  native 和 display，判断腕部连接完整、掌甲与指节比原块状手套更可辨，接受为局部草稿；新 head=r2，
  documentHash=5410e14e，renderHash=6521a4dc:8e0cacc3。编辑源导出到该目录的 `export/`。
- 通用指导补充：隔离试改、选区连接边、裁切原点与倍率换算、擦除后检查接缝，以及局部图后检查整体。
  两次有目的试改已足够支持这项维护决定，停止继续重画，不把该角色或手型收进通用模板。

### 必要回归与边界

- 新增一项通用 unit 回归，增强已有真实 CLI 与候选隔离测试。新断言在实现前分别因缺少局部视图失败；
  实现后验证裁切尺寸/邻域、边缘裁切、1x/3x 最近邻、掩码内外可观察像素、背景/剪影 RGBA、身份绑定、
  原始透明裁切与资产像素不变、无 region 时无虚假局部图。
- 开发源与普通载荷分别运行
  `node --test "tests/unit/studio*.test.js" tests/unit/frame-observation.test.js "tests/integration/studio*.test.js"`，
  各得 **191 PASS / 0 FAIL / 0 SKIP**。范围含静态/角色/位图编译、观察、事务、保护、安全域与关系回归。
  开发仓库另运行 `tests/integration/skill-release.test.js`：**1 PASS / 0 FAIL**。
- 普通载荷由 release 从源提交 6b4a4f5 生成，216 文件哈希一致；循环版只读校验 132 文件一致，未重建。
  用户原图、旧 r6 head、旧导出编辑源及两份旧 evidence 的 SHA-256 前后相同；未修改旧实验或用户级安装。
- 本地记录：`work/studio-local-refinement-20260930/evidence.json`、两份 draw.json、候选目录、`export/`，
  以及 `source-tests.log`、`payload-tests.log`、`skill-release-tests.log`。这些位于 gitignored work，不随推送携带。

**整张角色仍为 NOT_YET**：hand-b 未修整，hand-a 手型仍简化，材质、头发和面甲仍粗略。
本轮是 Agent 自检，不是独立认证；没有新增浏览器预览或人工试玩，没有尺寸/风格迁移、第二种角色或动画证据。
只支持本例中的操作表达与观察改进，不证明普遍临摹质量、模型成功率或成本提升。
未重跑工具包全套；S11 的旧正式数据状态断言仍是已知边界，不为全绿接管旧实验。

## S11.2 接受前的位图候选局部观察（2026-09-30，0.9.2）

依据：`../CONTEXT.md`、ADR-0009/0014、`studio-raster.md`。本轮解决的通用缺口是：
edit 只写 native/display，而 inspect 的明暗背景、剪影和选区裁切面向修订，
导致 Agent 很容易先接受再检查局部。不是为提高某次样图的验收结果而补材料。

- 位图 edit 的基准与候选预览新增 light/silhouette/observation；绘制和替换追加 selection/crop/cropDisplay。
  observation 绑定基准 revision、候选 ID、documentHash/renderHash 和 region。
  基准裁切按候选隔离，不再共用会被后续选区覆盖的 rN-base 路径。已有静态/角色预览路径不变。
- 新增一项集成测试并加强真实 CLI 断言，覆盖未提交就获得局部图、两个不同选区互不覆盖、
  身份绑定、观察不移动 head、不污染 native 像素，以及纯元数据编辑没有虚假选区。
- 开发源：`node --test "tests/unit/studio-raster*.test.js" "tests/integration/studio*.test.js" tests/integration/skill-release.test.js`
  得到 **74 PASS / 0 FAIL**。普通载荷同范围、不含宿主 skill-release 检查：**73 PASS / 0 FAIL**。
  范围含已有 Studio 事务、观察、跨帧、保护和关系集成测试；未重跑工具包全套或旧模型实验。
- 普通载荷经 release 生成，216 文件一致；未升级循环版或用户级安装。
  日志为 `work/studio-raster-preview-source-tests.log`、`work/studio-raster-preview-payload-tests.log`。

本轮没有新的角色视觉裁决；S11 的 NOT_YET 不变。允许后续用真实局部打磨检验新观察面，
但必须说明可回收的工具缺口或方法经验；不把价值优先误解为禁止继续打磨样图。
旧候选/幂等记录不自动补视图，新能力使用新的 edit 请求，不手工修改历史。

## S11.1 位图路径输入回收（2026-09-30，0.9.1）

依据：`../CONTEXT.md`、ADR-0014、`studio-raster.md`。本轮不是继续打磨角色样图，
而是检查 S11 修整轨迹中哪些重复工作应由 Studio 提供。

### 缺口与项目改进

S11 的头部和身体脚本均自行展开折线；身体脚本还把画布坐标减去选区原点，
148 条指令分成两次 edit。由此新增 `raster.draw` 的 path 和显式 canvas-pixels 坐标输入，
默认保留 region-local-pixels。路径复用 line 栅格规则，可闭合但不填充、不平滑。
每条最多 128 点，每次 line/path 合计最多 512 条线段；选区、掩码和元数据合同不变。
通用示例 `examples/studio/raster-path.draw.json` 可直接交给现有 CLI，无需另写绘制脚本。

### 最小验证与结论

- 只读回放原身体操作：**148 条变为 70 条**，可在一次 edit 中表达；新文档与原两次操作后的
  文档完全相同，renderHash=5ea7cc47:8e0cacc3，选区外差分为 0。
  原参考、角色工作区和修订未改，未写入新角色候选。此回放只支持“表达更紧凑”，不支持美术改进。
- 新增 6 项回归覆盖连续/闭合路径与旧 line 逐像素等价、全部原语的两种坐标输入、透明擦除、
  掩码保护、非法输入、粗笔刷越界、展开线段预算，以及 CLI 失败不移 head、删除输入后提交、重开/导出/恢复。
- 开发源相关套件加普通技能发行检查：**20 PASS / 0 FAIL**；普通载荷内相关套件：**19 PASS / 0 FAIL**。
  运行文件为 `tests/unit/studio-raster.test.js`、`tests/unit/studio-raster-path.test.js`、
  `tests/integration/studio-raster.test.js`，开发源另含 `tests/integration/skill-release.test.js`。
  没有重跑全套，S11 的全量数字不作为本轮重新验证的结果；旧基准数据状态断言也未修改。
- 普通载荷经 release 生成，216 文件哈希一致；循环版只检查，132 文件一致，用户级安装未改。

证据：`work/studio-raster-path-trace.log`、`work/studio-raster-path-release-tests.log`、
`work/studio-raster-path-payload-tests.log`。前者是对已有轨迹的纯函数回放，不是新增正式实验。
输出与既有像素完全一致，故不为此补拍浏览器截图或重新审美，S11 的视觉 NOT_YET 保持不变。

维护决定：保留路径和坐标输入能力及通用回归，停止该项补证。不扩展曲线、自动描摹或语义部件；
后续尺寸迁移另行验证细节损失和元数据变换，不由本轮结果推断其可用性。
本轮未验证模型调用成本、Agent 成功率、临摹质量或第二种角色结构。

## S11 Studio v1.5 alpha：Agent 看图驱动的位图创作（2026-09-30）

依据：`../CONTEXT.md`、ADR-0014、`plans/studio-reference-translation.md`。
package/toolkit=0.9.0，document=pga-studio/raster/1。当前实施 Agent 自检，非独立认证。

### 工具与回归

- 新增单帧位图文档、空白/PNG 创建、选区批量 pixel/rect/line/poly 绘制、透明擦除/替换、
  anchor/attachments 编辑。尺寸不隐式扩边；IO 解码后将像素冻结到文档或操作，不依赖原 PNG。
- 选区及掩码先于差分声明；候选/提交复核选区外像素、元数据保护和基准身份。
  位图局部修改不等于跨修订区域冻结，protection 仍为 NOT_CONFIGURED，视觉仍为 UNVERIFIED。
- 新增 13 项测试（unit 8、integration 5）全部通过，覆盖非法输入、绘改与掩码、透明擦除、
  确定性、观察、候选拒绝/提交/恢复/幂等/过期/篡改、真实 CLI、PNG 导入后删除原文件、
  自包含重开及图集逐像素往返。透明 RGB 规范化为 0，避免既有图集跳过透明像素造成字节差异。
- 开发源回归：显式过滤下述旧数据状态断言后，**433 PASS / 0 FAIL**。
  命令为 `node --test --test-skip-pattern="24 participants / 12 pairs / 24 independent reviewers planned; no formal data" "tests/**/*.test.js"`。
  被名称过滤的子项未计入 Node 的 skipped 数字，不据此宣称未过滤全套通过。
- 未过滤全套仍有既有失败：`tests/integration/benchmark-e2e-v03.test.js` 的
  `24 participants / 12 pairs / 24 independent reviewers planned; no formal data`
  要求正式 runs/reviews/results/execution-freeze 不存在，但当前 HEAD 已归档正式数据。
  失败是同一子项及父测试的失败传播；本轮未修改该测试、旧实验数据或其结论。
- 普通载荷套件：**406 PASS / 0 FAIL / 8 SKIP**；跳过依赖开发仓库发行/安装目录的 6 项，
  以及不随载荷携带实验目录的 v0.2/v0.3 host-only 测试。
- 普通载荷由 `node tools/release.mjs` 生成，214 个文件哈希校验通过；循环版仅检查，
  132 个文件一致。用户级安装、原游戏和独立试验项目未改。

### 用户参考的实际试验

用户提供的 Reference R 保持只读。目标选择 **128×256、正面单帧、透明背景**，先保留完整人物
轮廓与主要服装结构，不把更小尺寸的自动缩图当成本轮验证。Agent 实际看参考，用 Studio
绘制初稿，查看输出后修正装甲纹路、袍面符文和头发/面甲轮廓，再用 CanvasBank 预览。

- 三个局部修复候选：c-faa720d5、c-a75486bf、c-45c9f71d；分别变化 817、736、1427 个像素，
  各自事先声明的选区外变化均为 0。这证明局部修改保护生效，不证明角色身份已准确还原。
- 最终 head=r6，documentHash=3b0918c5，renderHash=0b9b5119:8e0cacc3。
  预览页实际通过 CanvasBank 显示，浏览器状态读回同一 renderHash；截图完整包含 1x 场景，
  2x 场景只有局部，不将其记为完整审图。未做动画或人工试玩；临时标签页和服务已关闭。
- **视觉 NOT_YET**：暗甲、橙色面甲/纹路、交叉背带、长袍符文和护膝可辨；
  手部仍是整块手套造型，材质层次、头发与面甲细节粗略。工具流程通过不等于最终美术验收通过。

本地证据在 gitignored 的 `work/reference-knight/`：`pilot-evidence.json`、
`refinement-evidence.json`、`browser-preview.png`、`final/ember-knight.native.png`、
`final/ember-knight.display.png` 与 `export/ember-knight.studio.json`。
用户人物与一次性绘制脚本不进入通用样例或技能载荷；可复跑的通用操作示例为
`examples/studio/raster-mark.draw.json`，使用方式见 `studio-raster.md`。
回归日志为 `work/studio-raster-source-filtered.log`、`work/studio-raster-payload-tests.log`。

### 维护结论与边界

可继续采用“Agent 看图判断，Studio 提供可回退的绘改与技术检查”这条路线。
首步已验证创建/导入/局部修改与既有资产链可以连通，不再强迫任意角色适配固定 humanoid 模板。
尚未证明临摹普遍可靠、Studio 优于直接生成、外部生成模型接入有效，或风格/尺寸迁移成功。
下一步优先验证局部造型修整和更小尺寸的细节重组，再用另一种角色结构检查复用性；
不为把本样图修到通过而持续追加一次性绘图代码，不提前建设动画、完整 GUI 或通用约束求解器。

## S10 Studio v1.4 开发交付（2026-09-30，未独立认证）

依据：`../CONTEXT.md`、ADR-0013、`plans/studio-v1_4-delivery.md`。
package/toolkit=0.8.0，document=pga-studio/4。此节只记录 Codex 开发者自检，不是 ZCode 独立结论。

| 范围 | 本轮结果 |
|---|---|
| 新增关系、事务、身份 lint、预启动 gate 回归 | 27 PASS / 0 FAIL |
| 开发源回归（显式排除 v0.2 host-only controls） | 405 PASS / 0 FAIL；被名称过滤的控制解测试不在统计中 |
| 普通发行载荷回归 | 393 PASS / 0 FAIL / 7 SKIP |
| v0.2 preparation hash + agent-facing lint | HASH_CHECK_PASS；12 个任务材料文件；没有执行控制解或模型 |
| 普通载荷发行清单 | 207 文件一致，经 release.mjs 生成 |
| 循环版载荷 | 132 文件一致，只检查、未重建 |
| 新 demo | 脚本与 evidence 格式已写，语法检查通过；运行/审图留给 ZCode |

新增测试覆盖 evaluator 的 contact/gap/overlap/tolerance/unsupported/missing-node、两种 follower
策略与 invariant、整数格、冲突和多个 required relations、preserveRelations 的 true/ID-list/省略、
protection AND relation、安全域缩减和回退、合同改变失效、inspect、候选篡改、提交/导出/restore、
旧模式无关系兼容。旧测试没有删除，仅将 schema 支持列表补到 /4。

载荷 7 个 SKIP：原有依赖开发仓库发行/安装目录的 6 项（见 S9.1），以及新的 v0.2 host-only
controls 测试。正式实验目录不随通用载荷发行，所以该测试明确跳过而不假装覆盖。
源码控制解测试按本轮职责边界未运行，供 ZCode 独立核验任务可行性和两臂观察等价。

机器记录：`evidence/studio-v1_4/developer-checks.json`。本地日志：`work/studio-v14-source-tests.log`、
`work/studio-v14-payload-tests.log`。新回归首轮发现 -0 数值规范化问题并已修复。
Windows autocrlf 导致发行载荷纯换行差异，已在开发源 release 脚本中规范化文本后重新生成，
没有手改载荷或重写清单掩盖不一致。

v0.1 全目录保持不变，NO-GO 与 qualified evidence 边界见新增产品解释。
D13=真实 tag v0.7.0/37317b5，D14=0.8.0/20b81c1 candidate snapshot；两臂逐文件哈希已记录。
v0.2 没有 runs/reviews/results，没有 participant/reviewer/model 调用，也没有正式模型/宿主冻结。
准备 gate 图像与基线 PNG 不等于执行视觉 gate。独立认证、D14 final freeze 和正式 benchmark 由 ZCode 完成。

相对 v0.7.0，core/recipes/bake/geometry 与既有 v1.3 demo 源未改；循环载荷、用户级技能安装未升级。

## S9.1 PR #1 合并前修复（2026-09-29）

依据：`../CONTEXT.md`、ADR-0009/0012、`studio-cli.md`。保持原架构；不新增 rebase、
不改 hold-out、candidate budget 或 Go/No-Go，不运行 12-run。下列为本次实际重新验证，
下方 S9 保留原交付时的历史计数。

| 实际命令/范围 | 结果 |
|---|---|
| `node --test --test-reporter=spec tests/unit/studio-geometry-safe.test.js tests/integration/studio-safe.test.js tests/integration/studio-observation.test.js tests/integration/studio-contract.test.js` | 22 PASS、0 FAIL、0 SKIP |
| `node --test --test-reporter=spec "tests/**/*.test.js"`（开发源） | 377 PASS、0 FAIL、0 SKIP |
| 同一全套命令（普通技能 assets/toolkit 目录） | 366 PASS、0 FAIL、6 SKIP；总计 372 |
| `node examples/studio/v13-demo.mjs --out work/pr1-v13-demo --evidence work/pr1-v13-evidence` | Demo A/B PASS |
| 普通载荷内同一 demo，输出到仓库 `work/pr1-portable-demo`、`work/pr1-portable-evidence` | Demo A/B PASS |
| `node tools/release.mjs`、`node tools/release.mjs --check` | 192 文件一致；仅普通载荷重建 |
| `node tools/release.mjs --skill procedural-game-assets-loop --check` | 132 文件一致；未重建 |
| `node tests/PGA_CONSTRAINT_BENCHMARK_v0_1/prepare-materials.mjs --finalize`、`--check` | 追加 D13-0.7.0-4cd1666（68 文件），D12 64 文件、全部旧快照和材料一致；NOT_RUN |
| `git diff --check` | 通过 |

日志：`work/pr1-focused-tests.log`、`work/pr1-source-tests.log`、`work/pr1-payload-tests.log`；
机器摘要：`evidence/studio-v1_3/pr1-verification.json`。

新增 7 项顶层测试并扩充旧断言。260×260 fixture 的理论域 pixelWork=35,694,880，
超过生产默认 32,000,000；inspect 保留 SEARCH_LIMIT，无 partial safeRange。合法 edit
以 POINT_FALLBACK 真实编译并提交；explore 的 [24,35,300,26] 四次点检查中三次进入编译，
仅两个合法项物化；保护违规和 apply 越界均无候选/PNG。小资产完整域只枚举一次，后续复用
不重复计探针。另验证 maxSearch 超限回退及非 SEARCH_LIMIT 异常不被吞掉。

safeBinding 核对字段、固定参数（稳定键顺序）和合同哈希，不授权自报 values。
观察与 commit 共用身份、派生内容、哈希及保护重验；VALID 才出图，REJECTED/STALE/TAMPERED
只留显式诊断。accept/restore 后 baseline 不变的断言通过，无 implicit rebase。

普通载荷 6 个 SKIP 的完整测试名称：

1. `真实载荷链：init → 冒烟测试 → --check → 静态服务 HTTP`
2. `安装核心`
3. `循环版独立载荷：复制后 CLI、专名安装与原版共存`
4. `Git 携带：保留 pngjs 与精确字节，autocrlf=true 检出后仍通过清单`
5. `register-harnesses`
6. `普通技能可独立携带：视觉标准随清单发行，入口与诊断链接均在包内可读`

这些测试依赖开发仓库技能/安装/发行目录，在开发源全部通过；没有 Studio v1.3
protection、geometry、safe-domain 或观察核心测试被跳过。

新 D13 source=`4cd1666`，旧 `D13` 与 `D13-0.7.0` 保留于 archivedToolkits。
manifest 更新逐文件哈希、协议 SHA-256 与共同观察模块哈希；check 验证两组起始 RGBA、
控制解 RGBA、crop/contact sheet/diff 输出一致，真实编译结果通过同一独立 final contract。
协议、hold-out、旧冻结工具、共享观察纯层与 core/recipes/bake/geometry 相对 `7b359bc`
无差异。模型/宿主/推理配置和批准仍未冻结，participant/review/modelCalls 均为 0。

## S9 Studio v1.3 / 工具包 0.7.0（2026-09-29）

依据：`CONTEXT.md`、ADR-0012、`plans/studio-v1_3-delivery.md`。v1.2 终审的正式解释已归档于
`experiments/pga-ab-v1_2-final-audited.md`，原始 scored/review/key/technical/preregistration/manifest
没有改写；接手时用户已有未跟踪的审计/评估资料在实现期间只读保留，
后续按用户要求分为评估/冻结资料与终审证据两个原子提交原样入库。

| 实际命令/范围 | 结果 |
|---|---|
| `node --test --test-reporter=spec "tests/**/*.test.js"`（开发源） | 370 PASS、0 FAIL、0 SKIP |
| 同一命令（普通技能 assets/toolkit 目录） | 359 PASS、0 FAIL、6 SKIP（依赖开发仓库安装/发行目录的顶层测试；其子项不展开） |
| `node tests/PGA_AB_BENCHMARK_v1_2/organizer/reviewer-self-test.mjs --repo . --out work/studio-v13-reviewer-isolation` | 9/9 PASS |
| `node tests/PGA_AB_BENCHMARK_v1_2/organizer/self-test.mjs --repo . --out work/studio-v13-material-selftest` | 23/23 PASS，只有机械控制解，无模型调用 |
| `node examples/studio/v13-demo.mjs --out work/studio-v13-demo-final --evidence docs/evidence/studio-v1_3` | A/B 实际链路 PASS，真实 PNG/JSON 入库 |
| 从普通载荷运行同一 demo（out=work/studio-v13-portable-demo） | A/B PASS，无外部开发源依赖 |
| `node tools/release.mjs`、`node tools/release.mjs --check` | 普通载荷 192 文件，全部哈希一致 |
| `node tools/release.mjs --skill procedural-game-assets-loop --check` | 循环载荷 132 文件一致，未重建 |
| `node tests/PGA_CONSTRAINT_BENCHMARK_v0_1/prepare-materials.mjs --check` | D12 64/D13 68 文件一致、控制解合法且像素相同；NOT_RUN |
| `git diff --check` | 通过 |

开发源 339 个既有测试 + 31 个新增测试；未删除断言。因 /3 已正式支持，三处旧版本断言更新
支持列表并把未知版本样本改为 /999，仍验证未知版本拒绝。旧核心、配方、烘焙源相对起点
87db710 无差异；终端/锈爪 hash 与 60 帧旧角色逐像素回归继续通过。未发现旧资产回归。

T05 等价回归精确得到 27px、bounds={x0:7,y0:38,x1:34,y1:39}，operation footprint PASS，
asset contract REJECTED；edit 提前返回 REJECTED_UNSAFE、无候选文件。另构造具有一致文档/hash
但伪报 OK 的候选，commit 重编译仍拒绝。文件 export、工作区 submit 均拒绝非法最终编译。
像素/metadata/node 多类保护独立；restore 保留合同并生成新修订。

Demo A 主体由 20×26 变为 30×18、centerX=23、bottomY=33；底座、仪表、anchor、attachments
保持。Demo B 的非法移动产生 34px 违规，bounds={x0:7,y0:29,x1:25,y1:31}，无合法候选；
合法 resize 后提交保护 PASS。实施者打开实际前后 PNG，仅作工程示意自审，没有独立视觉评级。

新 harness 独立维护在 tools/benchmark，不修改 v1.2 冻结包。测试覆盖缺必要动画播放向总判定
传播 U、严格 schema、五 verdict、镜像解盲和 reviewer 隔离。CONFIRMED 必须有真实宿主输入
关联；合成测试事件不代表真实评审观察。
必要动画还要求每位 reviewer 对每个 clip 的宿主时序图像输入证据；仅有播放自述与
静帧输入证据时，主结果仍为 UNVERIFIED，不能认证完整 taskSuccess PASS。

新实验是 DRAFT_NOT_RUN：12-run 草案、真实旧版本源码载荷、hold-out 与共同最终合同已准备；
没有创建 runs/reviews/results 或执行冻结清单，没有 participant/reviewer 模型调用。
待选定模型/宿主、完成共同计数 runner 与宿主证据通道验证并正式授权后才可冻结运行。
普通技能载荷排除了历史实验包和宿主数据，避免将冻结/私有证据误打进通用发行。

限制：语义变换只支持矩形；角色资产合同、依赖图和多变量最近可行解未实现。safe domain
有限试编译不输出候选图，单独报告成本，不意味着两 arm 等算力。合同不防止有全部文件
写权限的人重写基线及记录。循环版与用户级安装未升级；本轮未 push，不宣称弱 agent 能力改善。

## 自动化测试

| 时间 | 范围 | 结果 |
|---|---|---|
| 2026-09-26（P1） | `node --test`：栅格/变换/ASCII/确定性 | 35/35 |
| 2026-09-26（P2） | + 姿态/烘焙/英雄军团 60 帧逐像素回归（基线见 `tests/fixtures/baseline/`） | 59/59 |
| 2026-09-26（P3） | + 图集打包/清单/导出往返/CLI（中文空格路径、覆盖保护、确定性） | 72/72 |
| 2026-09-26（P4） | + 机械/植被/道具/地形配方与接缝断言 | 83/83 |
| 2026-09-26（P6） | + 消费契约（枪口点落枪端像素、锚点贴脚底、镜像 W-x、剪辑时长） | 87/87 |
| 2026-09-26（P7） | 技能载荷独立运行（`skills/.../assets/toolkit` 与已安装位置 `.codex/skills/...`） | 87/87（两处） |

关键回归：ember + legion 族 60 帧与原项目生成器（提交 bd1cf1a）逐像素一致；
原 38×46 帧底边越界以 `clip:'warn'` 显式声明并逐帧记录诊断。

## 视觉验收

见 `docs/visual-review.md`：P2 角色、P4 四类资产、P5 植入故障、P6 消费样例，
均以实际 BMP/浏览器截图/Godot 截图为据，不以单测通过代替审图。

## Godot 验证（4.6.2-stable）

- 无头导入检查 13 项全过（退出码 0）：清单加载、schema 版本、帧矩形在页面内、
  锚点有限、剪辑帧数与 90ms 时长、附件点局部坐标、AtlasTexture 尺寸、幂等加载。
- 窗口模式 demo 截图人工确认：跑姿贴地面参考线、枪口红点、nearest 无串色。
- 编辑器内人工预览（F5）步骤已写入 `examples/godot/README.md`，本会话未执行。

## 技能安装（P7 + R3 + 入口收敛）

- 唯一发现入口（2026-09-26 收敛后）：
  - 主存储 `C:/Users/admin/.codex/skills/procedural-game-assets`（0.2.1，与开发源逐目录一致）；
  - 发现入口 `C:/Users/admin/.agents/skills/procedural-game-assets`（junction → 主存储）。
  - 两个发现目录内**无任何 backup 残留**（已逐一核实）。
- 备份（发现目录之外，`C:/Users/admin/.codex/backups/skills/procedural-game-assets/`）：
  - `agents-backup-20260926094152`（初版纯文档技能，无 toolkit）
  - `codex-backup-20260926101924`（0.1.0）、`codex-backup-20260926102505`（0.2.0）
  - `codex-backup-20260926112629`、`codex-backup-20260926112814`（0.2.1 两次安装演练）
- 迁移核验：3 个旧备份共 231 个文件迁移前后 sha256 逐文件一致
  （记录 `C:/Users/admin/.codex/backups/skills-migration-record.json`，
  工具 `tools/snapshot-hashes.mjs` / `tools/verify-migration.mjs`）。
- 安装脚本修复（install-core 重构 + install.mjs 瘦 CLI）：
  备份默认落 `<codex-home>/backups/skills`（发现目录之外）；
  junction 探测改 readlink（isSymbolicLink 对 junction 恒 false）；
  入口父目录缺失时先建目录（新环境曾致 junction 静默退回复制）。
  回归测试 `tests/integration/install.test.js` 3 项（载荷中自动跳过）。
- **发现链路待新会话验证**：技能列表刷新需新会话/重启 Codex App 确认。

## 多宿主注册（2026-09-26）

- 核查：各宿主惯例为 `~/.<harness>/skills/<name>` 链接到唯一主存储（参照 anysearch）。
  单一真相源保持 `.codex/skills/procedural-game-assets`。
- 已注册（junction → 主存储，读回均 0.2.1）：
  `.agents/skills`（Codex 插件层）、`.claude/skills`、`.cursor/skills`、`.dsh/skills`、
  `.zcode/skills`、`.workbuddy/skills`、`.grok/skills`、`.kimi-code/skills`。
- OMP：无自有 skills 目录，其 `agent/config.yml` 的 `skills.customDirectories`
  指向 zcode/grok/dsh/workbuddy/cursor 的 skills 目录，间接生效，未另建入口。
- 工具：`skills/procedural-game-assets/scripts/register-harnesses.mjs`
  （幂等；预置真实目录备份到发现目录之外；--dry-run/--list）。
  端到端测试 `tests/integration/register-harnesses.test.js` 2 项（载荷中自动跳过）。
- 曾出错并已修正：注册脚本初版把入口错指到开发仓库，已改为默认指向主存储并重建全部链接。
- **每个宿主需各自重启或新开会话后验证**（本会话无法证明任一宿主的技能列表已刷新）。

## R1–R3（范围校正后，2026-09-26）

| 阶段 | 验证 | 结果 |
|---|---|---|
| R1 网页接入 | adapters/canvas.js CanvasBank（注入工厂、变体缓存、与导出同源）；stub 测试 7 项 | 109/109 |
| R2 模板 | 逻辑层 11 项 + demo-presets 5 项（确定性/碰撞/交互/胜负/暂停重启）；浏览器三预设截图人工确认 | 109/109 |
| R3 技能改版 | 载荷 114 文件哈希一致，两处独立运行 109/109；0.1.0/0.2.0 备份保留 | 通过 |

## R4 首版验收（v2，实施者干净目录复用，非独立 Agent 试验）

目录：`E:/Repos/Tools/pga-acceptance`（提交 7d42571），起点仅为已安装载荷。

- 新角色族 snowowl 两体型、scorp 机械、tundra 地形（与示例明显不同）；
  可玩切片「雪原突击」：移动、射击交互、雪原肃清/任务失败、白闪与粒子反馈。
- 机测 `work/game.test.mjs` 6/6（三预设、确定性、内容契约）；
  浏览器截图：初始 + assault/clear/hit 三预设人工确认。
- 验收发现并已修复：模板帧名硬编码（工具包 0.2.1 改 content.aimFrames）、
  敌人盒高度差 1px、bastion 眉影、子弹浅背景配色。资产核心零修改。
- 无对照组：只声称"复用成功"，不声称质量提升百分比。

## R5 多宿主试验回收（2026-09-26，0.3.0）

来源：首个非 Codex 宿主试验项目 `E:/Repos/Tools/pga-trial-kimi-code`（只读证据，
HEAD f319b7c，结束时复核干净）。其验收报告中的"全部完成"类结论按证据逐条核验，
核验结果见本节与文末未验证项。

### 回收内容

1. **模板输入契约**（`template/logic/input.js`、`game.js`、`main.js`）：
   - 证实试验报告指出的缺陷：点按缓冲 + 布尔边沿检测会把连续两次暂停点按吞成
     true/true（暂停后无法恢复）。修正：pressed 离散事件队列（每动作上限 8 条，
     每次快照每动作消费一条），game.step 优先消费 pressed、无 pressed 字段的旧
     布尔快照保持边沿语义。
   - 另发现上轮换接草稿的缺陷并修正：暂停帧 `clear()` 全清会把同帧双击 Esc 的
     第二条 pressed 误杀；改为 `clear({ except: SYSTEM_ACTIONS })` 只清游戏动作。
   - 失焦清空（blur/visibilitychange hidden）回收自试验项目；被清的键需重新
     按下才生效（防粘键），自动重复不复活。
   - 覆盖测试 10 项（`tests/unit/input.test.js`）：亚帧点按、长按、自动重复、
     快速连按、多物理键同动作、暂停/恢复、重启、blur/hidden/clear/unbind、
     补帧 step(n)、暂停中输入丢弃。
2. **DOM HUD 文字方案**（`template/render/hud.js`、`index.html`）：低分辨率画布
   内 fillText 小字全部移除（护盾格保留），stats/横幅走 DOM，支持中文；
   dbg 行加 `/paused` 标记（回收自试验项目：无 JS 求值的宿主靠 dbg 文本读状态）。
   位图字体作为可选方案写入文档，不维护第二套实现。
3. **携带隔离**（`tools/init-project.mjs` + `tools/release-manifest.mjs`）：
   干净目录初始化把工具包携带到 `vendor/pga/` 并逐文件 sha256 复核，
   项目根建立游戏自身 package.json/CONTEXT.md/README.md，模板复制为 `game/`
   并把 import 改写为相对路径（Node 与浏览器通用）。清单路径根 = vendor/pga/，
   项目根文件不受清单约束——试验项目的"CONTEXT.md 同名撞车例外"就此消除。
   `release.mjs` 拆出共用哈希模块，未新增第二套打包系统。
   测试 4 项（`tests/integration/init-project.test.js`）：迷你载荷全链、
   覆盖保护、缺失/损坏/多出/身份撞名响亮失败、真实载荷链（init→冒烟→
   携带副本全量套件→check→静态服务 HTTP）。
4. **审图与证据规则**回收进 `skills/.../reference/visual-diagnosis.md`（文字、
   状态不只靠颜色、暗背景辨识度、场景语义、证据纪律），按任务要求泛化——
   不强制"背景更暗"/支架吊索，不写"≤10px 一律不合格"式保证；
   空间站专用美术与领航玩法未回收（项目内容层，非通用能力）。

### 本轮验证

- 全量回归 `node --test "tests/**/*.test.js"`：**133/133**（116 基线 + 输入契约 10、
  HUD 2、init 5）。
- 浏览器实际验证（Python Playwright 1.58 headless Chromium，trusted 键盘事件，
  脚本 `tools/browser-check.py` 已入库可复跑）：**行为断言 10/10**——真实按键
  右移/跳跃/射击/暂停/恢复/重启，暂停中输入不补发，同帧双击 Esc 两次切换都完成
  （同步派发保证同帧入队；谓词 `paused && tick>冻结值` 只有两次切换都发生后才成立，
  实测 tick 146→147 后回到暂停），三预设状态与文案断言。截图采集单独计数，
  不计入断言通过率。
- 截图（`output/playwright/r3-*.png`，逐张人工过目）：暂停/胜利横幅中文清晰、
  stats 右上不遮挡；dsf 1.25/1.5 下 DOM 文字清晰（画布像素边缘有非整数缩放的
  固有抖动，如实记录）；320px 原生展示与 420px 窄屏布局不溢出，dbg `/paused`
  标记实测生效。
- 同状态前后对照（`r3-before-*.png`，从修改前提交 4edb7b6 的 git worktree 补采，
  同预设同视图）：`preset=win` 修改前画布内 "MISSION CLEAR" 与中文 "按 R 重启"
  破碎、左上角 tick 小字碎裂，修改后 DOM 文案清晰；320px 下修改前画布固定
  960px 溢出视口且 Esc 点按丢失（dbg 仍 playing，亚帧点按丢失的实测暴露），
  修改后响应式适配且暂停生效。旧 `output/playwright/before-win.png` 内嵌浏览器
  截图未捕获画布，不是有效基线，未覆盖，留作历史文件。
- 干净目录验收：`work/init-check/`（gitignored）由载荷 init 生成——
  项目测试 1/1、携带副本套件全过（宿主安装集成测试自动跳过）、
  `--check` 通过、`game/` 无绝对路径残留（grep 0 命中）、
  浏览器断言 10/10（用项目自己的 `vendor/pga/tools/static-server.mjs` 起服务）。
- 携带身份前置校验实测：`--name procedural-game-assets` 或目录 basename 撞名时
  init 退出 2 且不落任何文件；已有同名 package.json 拒绝且不改动（补修前
  是"init 报成功、--check 才失败"，已由维护者实测复核确认修复）。
- 只读边界复核：`pga-trial-kimi-code`（f319b7c）、原游戏 `others_003`、
  共享安装 `.codex/skills/procedural-game-assets` 均未修改（git 状态与
  哈希复核可查）；本轮只产出开发仓库内的 0.3.0 发行候选，共享安装保持 0.2.1。

### 未验证项（本轮新增/沿用）

- OS 级真实失焦：headless 环境无法复现（试验项目探针结论相同）；
  blur/隐藏监听由合成事件单测覆盖。
- 真人全程试玩与真人单局时长：两轮均无真人试玩，脚本/机器定时通关
  不换算为真人时长。
- 各宿主重启/新会话后的技能列表刷新（沿用）。
- 试验项目的"Kimi 原生技能发现成功"：本轮未在新会话重演，沿用其验收记录。
- 第二个非 Codex 宿主试验：未进行，是否开始由维护者决定。

## R6 资产循环特别版（2026-09-28，0.4.0）

范围：新技能 `procedural-game-assets-loop`，不替换普通网页游戏入口。方法、边界与
来源见 ADR-0006 和 `research/asset-loop-landscape.md`。用户确认首版聚焦 2D，
并明确选择独立上下文 + 禁止读取指令，不要求操作系统隔离。

- 开发源全量 `node --test --test-reporter=spec "tests/**/*.test.js"`：165/165。
  新增盲比像素保留、封存/揭盲、错候选/混批次、缺席位、低分、重大缺陷、材料污染、
  用户停止、冻结文件改动、真实门禁失败、失败复验不得绕过等测试。
- 机器检查的成功词是 `RECORDS_VALID`，测试使用合成报告，只证明记录/文件校验逻辑，
  不证明真正 WOW、模型审美或子代理遵守了指令。
- 新入口复制到临时目录后 CLI 可运行；临时安装保持普通入口不变。独立 Git 测试仓库
  在 `core.autocrlf=true` 下检出，载荷哈希仍一致。修复了 pngjs 被忽略及 Git 转换
  载荷换行的发行风险；两份载荷均从同一个开发源生成，各 127 个被清单管理的文件。
- `skill-creator` 校验通过。Windows 默认 GBK 使首次校验读取中文失败，使用
  `python -X utf8 .../quick_validate.py` 重试通过，没有改动全局 Python 设置或校验器。
- 独立子代理进行启动/对齐前向测试，实际查看用户示例原图，确认是 1536×1024
  不透明展示板，不推断原生精灵尺寸、动画帧序与时长；提出角色复现/原创及交付范围
  两个关键问题。没有启动资产生产或宣称 WOW。其只读探针使用新上下文与单文件
  白名单，已结束，无遗留进程；这不证明操作系统隔离，也不覆盖完整生成循环。

### 用户授权的独立安装

- 主存储：`C:/Users/admin/.codex/skills/procedural-game-assets-loop`。
- 发现入口：`C:/Users/admin/.agents/skills/procedural-game-assets-loop`，junction 指向主存储。
- 使用项目发行安装器，只新增循环版，没有注册或改动其他宿主入口。
- 安装后的 140 个文件与开发仓库循环技能包逐文件哈希一致；载荷清单通过。
  安装位置运行套件：155 通过、5 跳过、0 失败；跳过的是依赖开发仓库发行目录的测试。
- 普通技能安装目录前后 131 文件的整体清单摘要相同：
  `97427c18457ee57481b02ca14ad1341ce54dfd0305d99b64a7a167086bfb3992`。
- 没有修改 Gauntlet 安装、参考原图、原游戏或独立试验项目。

### 当前未验证

- 新会话/重启 Codex App 后的原生发现与自动触发。
- 示例图的完整资产生产、实际两批次 WOW、动画质量及到达标杆所需成本。
- 因而不能声称现有配方已经足以复现该示例图，或循环必然收敛。

## R7 普通版视觉评审升级（2026-09-28，0.4.1）

审查对象为原 `procedural-game-assets` 技能，不把循环版的独立盲审、双批次或无限迭代
加入普通网页游戏制作流程。循环版合同升级方案仍待实施，见
`plans/visual-review-quality-parity.md`；普通版的现行标准为 `visual-quality.md`。

- 已定位并改正的指导缺口：总分 ≥10/12 的批量派生建议、固定局部诊断次序、
  缺少独立整体美学结论、未明确质量同级与外观相似的区别、未明确无标杆验收路径。
- 现行范围同时覆盖单项资产、系列/动画与完整游戏画面。标杆不覆盖的动作或场景按
  独立要求验证；不同原创设计不要求同几何/配色/姿态。技术、玩法和视觉结果分开。
- 全量 `node --test --test-reporter=spec "tests/**/*.test.js"`：166/166。
  新增的 `tests/integration/skill-release.test.js` 实际复制完整普通技能包，验证视觉
  标准在发行清单内、入口/诊断/标准的 Markdown 链接不依赖包外路径且目标存在。
- `skill-creator` 的 `quick_validate.py` 通过（Python `-X utf8`）；普通版发行载荷
  129 个文件哈希校验通过。现有集成测试继续覆盖临时安装、回滚备份、干净目录携带、
  模板测试与静态 HTTP 消费。未改动生成器、游戏运行代码或循环版发行副本。
- 这些结果只证明技能结构、引用、发行完整性和既有功能没有相关回归；本轮没有真实
  标杆对照的生成试验、独立子代理前向测试或人工试玩，不宣称美术质量已实际提升或达标。
- 用户级安装是否升级另按本轮授权与安装记录核实，不由项目发行成功推断宿主已刷新。

## R8 循环版质量同级合同升级（2026-09-28，0.5.0）

范围：仅升级循环版源码、任务书和发行包。依据为 `CONTEXT.md`、ADR-0006/0007
及 `plans/visual-review-quality-parity.md`；普通版发行保持 0.4.1，未更新各宿主安装。

- `pga-loop/2` 分开质量依据、明确设计约束、原创空间与范围/视图；整体美学独立裁决，
  参考支持的维度判断同级，静态参考不支持的动作等按独立要求验收。视觉分数仅诊断。
- 开发源全量 `node --test --test-reporter=spec "tests/**/*.test.js"`：218/218。
  覆盖缺整体结论、整体低档但细项高分、漏范围/视图/约束、动态缺播放、多组盲比、
  原图质量依据遗漏、可选来源猜测、MINOR 非阻塞理由及既有哈希/双批次防误收。
- 旧版真实工具生成的合成记录用于回归只读兼容：历史验证器仍按 v1 判断，不改文件，
  拒绝 snapshot；新版拒绝旧记录及仅改协议号的旧报告。此证据不代表历史真实 WOW。
- 循环载荷 132 个文件哈希校验通过。载荷内套件：207 通过、6 跳过、0 失败；跳过项
  依赖未携带的开发仓库发行目录。集成测试验证独立复制、临时安装、普通版共存、
  Git 换行稳定，以及新任务书与质量标准链接均在包内可读。
- `skill-creator` 的 `quick_validate.py`（Python `-X utf8`）通过。普通版 129 文件
  清单通过，`skills/procedural-game-assets/` 相对本轮起点 `c759984` 无差异。
- 独立新上下文前向测试实际看原图，确认 1536×1024、完全不透明；以原创角色、两套装备、
  待机与跑步的模拟请求形成 5 个范围、25 个视觉支柱、3 个交付支柱、2 对对照的宪章，
  包内 `validateCharter` 校验通过。输出明确区分质量标尺、原创空间和独立动态要求，
  没有将原图身份设为默认约束，也没有生成资产、正式候选或 WOW 裁决。
  原始命令与产物仅留在本地 `work/loop-v2-forward/`，不进入发行包。
- 前向测试发现宪章预检调用不易发现，已在 `references/tooling.md` 增加直接导入
  `validateCharter` 的命令，并在 Windows PowerShell 下用测试宪章实测通过；未增加
  新的 CLI 子命令或修改试验产物。

### 验证边界

- 合成裁决只验证字段、覆盖与文件一致性，不能证明审美判断、实际观看/播放或材料约束
  得到遵守；`RECORDS_VALID` 仍不等于真实 WOW。
- 未执行完整资产生产与两个真实 WOW 批次，也未完成预先校准实图的美学评审对照测试。
  不据此宣称技能已经能稳定生成同级画面、所有 critic 均能区分风格与质量，或循环必然收敛。
- 未修改用户级技能、Gauntlet、用户原图或独立试验项目；各软件安装刷新另行执行与验证。

## S8 Studio 审查修复轮（2026-09-28，R1–R8 + D1）

阶段：按《PGA_STUDIO_REVIEW.md》（0.6.0 独立审查）修复 8 类可靠性缺陷并把 9 个复现场景
转为正式回归测试；统一文档阶段口径；同步 lockfile 版本元数据。
依据：审查 §4（缺陷）/§5（合同）/§8（批次与验收）；ADR-0008–0011。

### 实际完成（按审查 §8 批次）

- 批次 A（R3/R2/R8，提交 c2763ad）：operators/character-ops 各提供 `operationFromExplore`，
  探索记录、候选身份哈希与 commit 重执行共用同一份标准 operation；material.set/ramp.set 探索
  候选可提交。角色像素/元数据/帧尺寸/剪辑变化分别计算；metadata 保护遍历全部帧（含 notCovered
  与仅元数据变化帧）；UNCHANGED 须像素与元数据双不变（renderHash 一致）；checkedPoseKinds 限
  引擎实际支持集（当前仅 rig），作者声明未适配种类按 UNSUPPORTED_SCOPE 拒绝。diffPixels 按
  像素计（四字节一组），通道级差异另列 changedChannels。
- 批次 B（R1/R6，提交 5a9b3cc）：_mutate 锁内重读 head/seq 与台账后再校验；同名修订仅允许
  逐字节相同否则 REVISION_CONFLICT；state() 每次重读磁盘 head。台账两阶段 pending→done：
  重放 pending 时既定效果在链上且内容匹配则补写 done 返回原结果，无效果则幂等前滚，
  槽位被他人内容占据则 STALE_REVISION。
- 批次 C（R4/R5/R7，提交 9faa73a）：validatePreserve 严格 schema（文档级与请求级共用）；
  CLI 命令级选项白名单；commit 从基准重取文档级 constraints 并重算候选身份比对；
  requestId/revision/candidateId 白名单 + 工作区遏制复查。
- 批次 D（D1）：阶段状态表统一为"技术实现完成/部分完成/验证待办/明确不做"；
  `package-lock.json` 版本 0.5.0 → 0.6.0；studio-cli.md 合同同步；ADR-0009/0011 增补修订段。

### 实际执行的命令与结果

- `npm test`：**339/339**（312 基线 + 27 新增回归，零回归；新增
  `tests/unit/studio-review-unit.test.js` 13 项、`tests/integration/studio-review.test.js` 14 项）。
- 复现脚本重放 `node work/review-diag/diag.mjs`（Pass 1 隔离诊断脚本，沙箱自清理）：
  R1 STALE_REVISION；R2 REJECTED（12 帧附件点保护命中）且提交 CANDIDATE_INVALID；
  R3 候选 OK、提交 r2；R4 INVALID_DOCUMENT；R5 篡改提交 CANDIDATE_INVALID；
  R6 重试恢复原结果（r2）；R7 UNSAFE_PATH；R8 报告 7 = 实际 7。
- 基线说明：本轮起点 312/312（4 次全量复跑中 1 次出现 1 项偶发失败，未能复现定位，保持观察；
  不据此宣称存在已知回归）。

### 技术结论

- 审查 §8 最低验收逐条落实：复现场景全部转为断言正确行为的正式测试；六类操作（geometry/
  material/ramp/palette/rig/art.set）均完整走过 edit 与 explore → commit → 重开 → 导出
  （含 v2 局部色阶对象）；旧实例不覆盖历史；错误候选不移动 head；提交中途失败后同 requestId
  可恢复原结果；非法保护与非法 ID 明确拒绝；元数据独立受保护。

### 未做/边界（如实记录）

- **未发行**：本轮只改开发源、测试与文档；载荷未重建（`skills/*/assets/toolkit` 保持 0.6.0 既有内容），
  用户级安装未升级；修复版发行需明确授权后经 `tools/release.mjs` 生成并校验。
- **本地完整性 ≠ 访问控制**：R5 类校验发现不一致即拒绝，但不防御拥有工作区完全写权限的对手
  （审查 §4 口径）；本地单写者恢复合同不扩展到多写者协同。
- M3 A/B 对照评测仍未做（沿用 S3 口径，不宣称弱 agent 收益）；视觉结论不变——本轮无美术改动，
  渲染锚点（终端 `f645726c:6cebd809`、锈爪 `11c587dd:d890d15f`）经套件回归未变。
- 旧格式候选（无 preserveRequest）与旧格式台账按安全方向处理（拒绝提交/视为完成记录），
  既有工作区的未提交候选需重新 edit/explore 生成。

## S7 普通版 0.6.0 多宿主安装（2026-09-28，用户授权）

范围：经用户明确授权，把普通版技能 0.6.0 安装/更新到各宿主 agent 软件。
循环版安装未动；开发仓库与载荷在授权前已提交并推送（`4613da5`，master → origin）。

### 实际执行与结果

- `node skills/procedural-game-assets/scripts/install.mjs`：主存储
  `C:\Users\admin\.codex\skills\procedural-game-assets` 由 **0.4.1 升级到 0.6.0**；
  旧版本备份于 `~/.codex/backups/skills/procedural-game-assets/*-backup-20260928130929`（发现目录之外）。
  安装后验证通过：SKILL.md、入口一致性、载荷哈希。
- `register-harnesses.mjs`：8 个宿主 junction 均已指向主存储（保留），无需重建。
- 版本读回（各入口 `assets/toolkit/package.json` 实测）：`.agents`（Codex 插件层）、`.claude`（Claude Code）、
  `.cursor`、`.dsh`（DeepSeek Harness 原生）、`.zcode`、`.workbuddy`、`.grok`（Grok build）、
  `.kimi-code`（Kimi Code CLI）——**全部 0.6.0**。
- OMP：无自有 skills 目录，其 `~/.omp/agent/config.yml` 的 `skills.customDirectories`
  指向 workbuddy/zcode/grok/dsh/cursor 的 skills 目录——随这些入口间接获得 0.6.0（配置实测）。
- 主存储载荷 `verifyTree` 与发行清单一致；从**安装副本**实际运行
  `examples/studio/smoke.mjs` 通过（documentHash 56963f46、renderHash f645726c:6cebd809，
  与开发仓库逐位一致）。

### 未验证/边界

- 各宿主重启或新会话后的技能列表刷新：本机脚本无法代替验证（沿用既有记录口径）。
- 循环版技能安装保持现状（其载荷本轮未重建、未升级）。
- 备份回滚路径：删除主存储与入口后把上述备份目录改回原名。

## S6 PGA Studio M6（2026-09-28，0.6.0）

阶段：M6（发行、文档与现有流程接入——有限范围 alpha 发布）。
依据：HANDOFF M6/§16、`tools/release.mjs`、ADR-0003/0006/0007、AGENTS.md 发行规则。
本轮目标：Studio 能力经发行脚本进入普通版技能载荷并干净目录验证；
范围如实标注；循环版与用户级安装不随动。

### 实际完成

- 载荷白名单核对：`bin`/`src`/`tests`/`docs/adr` 为整体携带，Studio 代码与 ADR-0008–0011 已自动进载荷；
  缺口为 `examples/studio/`（样例与演示入口）与 `docs/studio-cli.md`（agent 合同），已增补进
  `tools/release.mjs` 的 PAYLOAD（开发源改动，非手改载荷）。
- `skills/procedural-game-assets/SKILL.md` 新增"PGA Studio（0.6.0 alpha）"章节：
  入口命令、当前支持范围（道具 /1-/2 与锈爪角色、编辑事务、观察与播放页）、
  明确边界（不是严格循环、无 GUI/MCP/云服务、样例为工程示意图）。
- 版本 0.5.0 → 0.6.0；`node tools/release.mjs` 重建普通版载荷：**169 文件**（0.5.0 时 129），
  生成器 `procedural-game-assets@0.6.0`、来源提交 5ae763a，复制后校验通过。
- 循环版不随动：`node tools/release.mjs --skill procedural-game-assets-loop --check` 通过（132 文件未变），
  不因根版本变化自动升级循环版（HANDOFF 规则）。
- 干净目录验证：`init-project work/release-check`（169 文件携带 + sha256 复核一致）；
  干净目录 `npm test` 1/1、`npm run check` 通过；在干净目录内经 `vendor/pga/` 实际运行
  `examples/studio/smoke.mjs`（documentHash/renderHash 与开发仓库逐位一致，跨位置确定性）、
  `bin/pga-studio.mjs create/explore`（24:OK 26:UNCHANGED 28:OK）、`m5-demo.mjs`（六步全过，含播放页）。

### 实际执行的命令与结果

- `node tools/release.mjs`：载荷 169 文件生成并校验通过。
- `node tools/release.mjs --skill procedural-game-assets-loop --check`：132 文件一致（未动）。
- `npm test`（开发仓库）：312/312。
- 干净目录（work/release-check）：init 复核一致；npm test 1/1；npm run check 通过；smoke/CLI/m5-demo 实际运行通过。

### 技术结论

- 普通版技能载荷自包含 Studio 全链路（代码、样例、指南、测试、播放页），干净项目可可靠使用；
  发行范围如实标注为 0.6.0 alpha（见 SKILL.md Studio 章节）。

### 未做/边界（如实记录）

- **用户级安装未升级**：各宿主技能安装保持原版本，升级须用户明确授权（AGENTS.md 只读规则）。
- **循环版载荷未动**：Studio 代码未进入循环版；严格资产循环的准出条件、预算约定与独立评审规则未变；
  Studio 创作候选不等于循环版冻结候选，本轮无 WOW 声明。
- `skill-creator` 的 quick_validate.py 本机未找到（R7/R8 曾用），技能结构校验由
  `tests/integration/skill-release.test.js`（套件内通过）覆盖。
- A/B 对照评测、MCP、M4 留空项（尺度规则/正反例）与 M5 留空项（帧覆盖/任意骨架）仍未做。

### 下一项可执行任务

M0–M6 技术实现全部完成；验证待办：M3 A/B 对照评测（未做）、各宿主技能列表刷新确认（本机无法代替）。
建议下一维护项：在获得用户授权后升级各宿主普通版技能安装并复核发现链路（已于 S7 执行）；
或按 HANDOFF §10 在拿到独立评测资源时补 A/B 对照试验。

## S5 PGA Studio M5（2026-09-28，ADR-0011）

阶段：M5（角色、跨帧与资产族）。
依据：HANDOFF M5、ADR-0008–0010、ADR-0011、`docs/studio-cli.md` §5。
本轮目标：一个已有角色（锈爪）及其现有剪辑的结构化数据面；修改跨帧一致传播；
受影响帧/附件点自动报告；未适配姿态明确不支持；实际播放材料与真实观看播放验证。

### 实际完成

- `src/studio/character-doc.js`：`pga-studio/character/1` 校验/规范化/能力声明（调色板键、骨架范围、姿态/剪辑引用、metadata-only 保护）。
- `src/studio/character-compiler.js`：文档 → 内存 CharacterSpec → 既有 `bakeHumanoid`；逐帧定位（anchor/attachments/bounds/pixels/checked）、renderHash（全帧+剪辑）、notCovered 标记。
- `src/studio/character-ops.js`：`palette.set` / `rig.set`（含 guns.<aim>.<len|back>）/ `art.set` 与同基准探索。
- 跨帧检查 `checkCharacterCandidate`：结构下钻核对、锚点/接地不变量、受影响帧与附件点 delta、受影响剪辑、notCoveredChanges、metadata 保护命中。
- `src/studio/dispatch.js`：store/CLI 文档类型无关化（/1、/2、character/1 统一修订/候选/幂等/恢复语义）。
- 播放材料：`observe.buildCharacterViews` 逐帧 PNG + 自包含 `player.html`（data URL 内嵌、剪辑毫秒时长、暂停/步进/切剪辑）；计时改墙钟累加 + rAF/interval 双驱动（实证修复隐藏标签页 rAF 暂停导致的不前进）。
- 样例 `examples/studio/rustclaw.studio.json`（由配方具体化生成）与 `examples/studio/m5-demo.mjs` 六步演示。
- 新测试 19 项（character-doc 7、character 9、integration-m5 2）；全套件 312/312。

### 实际执行的命令与结果

- `npm test`：312/312（293 前轮 + 19 新增，零回归）。
- 等价性锚点：样例文档编译与 `bakeHumanoid(rustclaw)` 13 帧逐字节一致（renderHash `11c587dd:d890d15f`）。
- `node examples/studio/m5-demo.mjs --out work/studio-m5`：palette.set V（12 rig 帧 + dead notCovered，4 剪辑，锚点/接地保持）→ 提交 r2；rig.set thigh 探索（OK/UNCHANGED/OK，接地保持）→ 提交 r3；guns.fwd.len 7→9（恰 8 个 fwd 帧，muzzle Δ≈(+2,0)，留作未提交候选证据）；恢复 r1 → r4 哈希精确一致；导出 13 帧 4 剪辑 manifest 过既有校验。
- 浏览器播放验证（真实 Chromium 经 HTTP 打开 player.html）：剪辑 run_fwd 帧计数 1/6 → 4/6（wait_for 命中）→ 2/6（截图），实际观看播放并留截图；随后关闭标签页、停止静态服务。

### 产物与复现

- `work/studio-m5/`：demo-summary、revisions r1–r4、candidates（含枪口联动证据）、previews（逐帧 PNG + player.html）、export（多帧 manifest）。
- 复现：`node examples/studio/m5-demo.mjs --out work/studio-m5`；播放：`node tools/static-server.mjs work/studio-m5 <port>` 后浏览器打开 `previews/r1-base/r1-base.player.html`。

### 技术结论

- M5 验收逐条实测通过：同一修改在约定动作中保持身份、接地、附件关系与材质一致；
  报告自动且精确到帧/附件点；未适配姿态明确列出；播放材料真实播放。

### 视觉结论与评审来源

- 实施者自审（非独立评审）：查看 r1/r2 stand_fwd 对比（目镜带 青#39d0c4 → 金#ffd23d，其余逐像素不变）；
  浏览器实际观看 run_fwd 播放（帧前进、接地稳定、无闪烁抖动）。美术维持既有配方水平，不宣称提升或同级。

### 未验证项/限制

- 帧覆盖（逐帧参数）、任意姿态/骨架/生物、角色 pixels/structure 保护类别、APNG/GIF 编码导出均未实现（如实记录）。
- prone/dive/ball 姿态样例未覆盖（模板支持绘制但未适配不变量检查，按 notCovered 处理）。
- 播放页在极端慢速设备上的观感未测；跨浏览器仅 Chromium 实测。

### 与原计划的偏差

- 接地不变量从"整个包围盒"修正为"底缘"（顶缘随腿长/体高合法变化，初版误报实证后修正）；
  播放器计时改墙钟累加（隐藏标签页实证驱动修复）。两处均属实现期正确性修正，语义更准。

### 下一项可执行任务（M6 第一项）

核对 `tools/release.mjs` 载荷白名单：`src`/`bin` 已整体携带，但 `examples/studio/`、
`docs/studio-cli.md` 与 ADR-0008–0011 不会自动进载荷；先跑 `node tools/release.mjs --check`
记录现状差异并按已批准发布范围决定携带方式，不重建载荷。

## S4 PGA Studio M4（2026-09-28，ADR-0010）

阶段：M4（风格与构造能力）。
依据：`docs/PGA_STUDIO_IMPLEMENTATION_HANDOFF.md` M4/§8.3、ADR-0008/0009/0010、`docs/studio-cli.md`。
本轮目标：版本化风格词汇与许可、色阶局部覆盖、第二种结构明显不同的资产、
有限体积概括、留出组合检验。

### 实际完成

- `pga-studio/2`：`poly`（3–8 整数顶点单环，可凹）与 `disc`（整数 cx/cy/rx/ry）几何，
  按类型隔离几何字段；`shade-diag` 材质（包围盒对角四带体积概括，如实声明为风格化概括）；
  节点 `ramp` 支持 `{ shades }` 局部覆盖；`style.meta`（license/source/focusRamp/notes，参与 styleHash）。
  /1 冻结共存：/1 文档拒绝全部 /2 词汇，终端 renderHash 锚点 `f645726c:6cebd809` 不变。
- 编译器：按类型绘制算子 + 声明 bbox（`nodeRect`）；同值局部覆盖与共享引用渲染逐像素一致（锚点测试）。
- 操作：`geometry.set` 按类型字段（含 poly vertices）、`ramp.set` 双取值形式；explore 支持 vertices（CLI 接受 JSON 数组）。
- 样例 `examples/studio/wrench.studio.json`（poly 手柄/凹口钳口 + disc 螺栓 + shade-diag + style.meta）与 `examples/studio/m4-demo.mjs` 四步演示。
- 新测试 22 项（document-v2 8、compiler-v2 5、studio-m4 6、integration-m4 3）；全套件 293/293。
- 指南更新：/2 词汇、保守保护语义警示、过窄 poly 丢像素边界、--preserve 元素格式、vertices 探索传参。

### 实际执行的命令与结果

- `npm test`：293/293（271 前轮 + 22 新增，零回归）。
- `node examples/studio/m4-demo.mjs --out work/studio-m4`：创建 → 非矩形剪影断言（23/38/12 px 均 < bbox）→ 钳口局部覆盖提交（共享 style 逐字节不变）→ 钳口顶点探索（UNCHANGED/OK）→ 手柄平移被螺栓保护捕获（区域内 1px 透变，CANDIDATE_INVALID）→ 导出 manifest 过既有校验。
- 留出组合试点（隔离子代理，仅凭更新后指南，单轮）：
  - H1（未见组合新建：disc+panel+poly 壁挂仪表 + style.meta + 指针局部覆盖）：PASS。客观核验：head=r2、共享 style 不变（styleHash r1→r2 同）、指针为局部覆盖、manifest 0 错误。
  - H2（未见组合编辑：poly 手柄上端缩短 2px，钳口/螺栓不变）：PASS。客观核验：head=r2、handle.vertices=[[5,21],[7,19],[13,14],[11,12]]、jaw/bolt 字段不变、manifest 0 错误。
- `smoke.mjs`（/1）与 `edit-demo.mjs`（M2）重跑通过，两版本共存。

### 产物与复现

- `work/studio-m4/`（demo-summary、revisions r1–r3、candidates、previews、export）；
  `work/pilot/h1/`（gauge 文档/工作区/导出/轨迹）、`work/pilot/h2/`（同上）。

### 技术结论

- M4 验收成立：共享风格、轮廓/构造/功能标识明显不同的资产（箱体终端 vs 扳手 vs 仪表）成立，不是换色；
  局部覆盖写时复制不污染共享风格；保守像素保护语义有真实捕获证据；留出任务由独立 agent 完成且未写进模板参数。

### 视觉结论与评审来源

- 实施者自审（非独立评审）：查看了扳手 r1/r2（钳口局部覆盖变深可见）、仪表 display、M2 前后图；
  资产可辨识且与文档声明一致。美术质量维持示意样例级（NOT_YET，无标杆不宣称同级）。
- H1 指针过窄（声明 8px 高、落像 8 像素）为能力边界实例：过窄 poly 栅格化丢像素，已写入指南。

### 未验证项/限制

- 比例/细节尺度建议规则、正反例库、构造件库未做（M4 范围内如实留空）。
- 跨帧（M5）、发行核对（M6）、A/B 对照评测、MCP 均未做。
- 凹多边形仅经偶奇填充验证，未支持自交/孔洞（校验不禁止，语义未定义，建议不使用）。

### 与原计划的偏差

- 无实质偏差；`--values` 增 JSON 数组形式与保守保护语义说明属试点驱动的文档/小能力补全。

### 下一项可执行任务（M5 第一项）

选择已有角色配方（如 rustclaw）与既有待机/移动剪辑，冻结"跨帧一致修改"的最小合同：
资产级共享字段 vs 节点字段 vs 帧覆盖的优先级规则草案与 ADR，先在纸面冻结再实现 solvePose 复用。

## S3 PGA Studio M3 首轮试点（2026-09-28）

阶段：M3 第一个增量——真实宿主接入验证（预注册试点）。完整 A/B 对照评测未做。
依据：`docs/plans/agent-studio-m3-pilot.md`（执行前预注册的任务、判据与口径）、
`docs/studio-cli.md`（agent 面对的合同）、HANDOFF §9 M3 / §10。

### 实际完成

- 预注册 4 个试点任务（P0 冷启动新建 / P1 探索与接受 / P2 材质修改＋保护 / P3 保护冲突处理），
  各由独立子代理（隔离上下文、同模型、单轮、无重跑润色）仅凭 CLI 指南完成。
- 指南与协议先行：`docs/studio-cli.md`（与实现逐条核对）、试点协议含客观判据与失败分类。

### 试点结果（客观核验，不看 agent 自述）

| 题 | 结果 | 核验证据 |
|---|---|---|
| P0 冷启动新建 | PASS | 文档一次过校验；head=r1；manifest 过既有校验器（0 错误）；帧 26×26=24+2 正确 |
| P1 探索与接受 | PASS | head=r2 且 shell.w=28；w=26 被识别 UNCHANGED 排除；接受候选与 M2 demo 逐位一致（确定性跨会话佐证）；屏幕保护通过 |
| P2 材质修改＋保护 | PASS | head=r2 且 side_panel.material=flat、几何未变；edit diff.pixels=34 且 outside=0（变化区与屏幕区不相交） |
| P3 保护冲突处理 | PASS（按预注册判据） | ramp.set 受保护屏幕被 CONSTRAINT_CONFLICT 前置拒绝；agent 未绕过（未手改文件/未改保护声明）；head 保持 r1；正确指出合法路径（作者层调整保护声明） |

- 图像真实到达模型：4 个 agent 均在轨迹中逐图记录 ReadMediaFile 查看结论（P0 三张、P1 三张候选、P2 三张、P3 六张），
  轨迹文件 work/pilot/p*/trace.md 共 523 行可复查；我也独立查看了 P0 的 agent 自创作渲染。
- 仓库完整性：试点后 `git status` 仅新增协议/指南两份文档，样例文档与工作区文件未被手改。
- 失败分类：不认识目标/不会选参数/看不到图/判断错误/参数空间不足/工具保护失效——**均为零**。
  命中的全部是**指南缺陷**（4 处）与 1 处工具误导字段。

### 试点驱动的修复（已实施并回归）

- 指南：create 预览落盘位置（工作区根目录 vs previews/）与裸文件名约定；返回坐标为最终帧坐标（+1/+2）的说明；
  图集 margin 默认 2px 与页面尺寸关系；可选字段与默认值明确；commit 后预览语义（被接受候选预览即 head 渲染，可用 inspect --ws --out 重生成）。
- 工具：删除误导性 `diagnostics.constraintsEnforced: 0`（执行证据本就在候选 checks）；样例文档 constraints note 从"v1 仅声明"更正为"edit/explore/commit 时强制执行"（renderHash 不变，仅文档哈希变）。
- 全套件 271/271；smoke 与 M2 demo 重跑通过。

### 技术结论

- 预注册口径内的结论：在单一宿主（Kimi Code 子代理）、同一模型、单轮条件下，agent 仅凭 CLI JSON 合同与指南
  能完成结构新建、候选探索接受、材质修改与保护冲突处理；图像经"返回路径 + 自主读图"真实到达模型。
- 按 HANDOFF M3 验收只宣称：**接口可用 / 技术试验完成**。未做 A/B 组对照、未隔离模型强弱，
  不宣称帮助弱 agent 已获证实；4 题规模只够筛查问题，不足以证明普遍有效。

### 视觉结论与评审来源

- 实施者自审（非独立评审）：P0 的 agent 自创作终端（红色倒角机箱 + 扫描线屏幕）可辨识、与文档声明一致；
  P1 接受候选屏幕区域逐像素不变。美术质量维持 S1 结论（示意样例级，NOT_YET，无标杆不宣称同级）。

### 未验证项/限制

- A/B/C/D 四组对照、12 任务 × 多次重复、跨模型/跨宿主、MCP 真实宿主验证均未做。
- 试点 agent 与实施者同模型同宿主，"工具收益 vs 模型能力"未分离。
- 指南修复后未重跑试点（修复仅文档与一处诊断字段，不改变行为语义）。

### 与计划/协议的偏差

- 无实质偏差；P3 的"未成功完成任务"是预注册判据中的预期保护行为，按判据记 PASS。

### MCP 决策（M3 阶段决策点）

当前宿主下 CLI＋文件读图已成立且可复查，按 HANDOFF"需要 MCP 时才添加薄适配"——**暂不添加 MCP**；
待出现不能直接读本地文件的目标宿主时再评估，届时核对官方协议/SDK 版本。

### 下一项可执行任务（M4 第一项）

为第二种结构明显不同的静态资产扩展有限几何算子：在非箱体式道具（如条形/斜面件）上验证
"同一版本化风格包 + 不同轮廓/构造"能成立，并建立留出组合检验（不把所有测试写成已知模板参数）。

## S2 PGA Studio M2（2026-09-28，ADR-0009）

阶段：M2（局部编辑、候选探索和回退——首个可用 MVP）。
依据：`docs/PGA_STUDIO_IMPLEMENTATION_HANDOFF.md`（方案）、`docs/plans/agent-studio.md`、ADR-0008/0009。
本轮目标：三个有限操作、同基准候选探索与去重、独立影响区域与三类保护、
接受/恢复/过期拒绝、幂等与失败不污染 head、必做演示真实运行。

### 实际完成

- `src/studio/operators.js`：`geometry.set`/`material.set`/`ramp.set` 纯函数变换 + plan（目标与逐字段旧/新值）；同基准 `exploreOperation`（非法取值逐条返回不中断，上限 16）。
- `src/studio/protect.js`：结构（非目标节点与资产级字段逐字段不变、目标只许声明字段变）、像素（允许区域 = 旧∪新几何 + 1px 描边邻域 − 未变更高层支持掩码遮挡；声明区域单独核对）、元数据（anchor/attachments/frameSize）；前置 CONSTRAINT_CONFLICT 与其余 CANDIDATE_INVALID 分开。
- 编译器新增 per-node 支持掩码（内画布坐标），像素绘制与遮挡计算同源；M1 记录的 sceneMap 掩码缺口补齐。
- `src/adapters/studio-store.js`：修订/候选/head/幂等台账/单写者锁；临时文件 + 原子替换；残留可识别不自动删；commit 用基准＋操作重新推导+重编译+重新执行保护检查（不信落盘状态）；恢复为引用旧内容的新修订。
- `bin/pga-studio.mjs` 新增 state/edit/explore/commit 与工作区模式 inspect/export；退出码增 6（冲突）/7（占用）。M1 文档模式与输出文件保持兼容。
- `examples/studio/edit-demo.mjs`：必做演示九步；`smoke.mjs` 增加工具目录自重清（create 现在拒绝覆盖已有工作区）。
- 新测试 23 项：operators 7、protect 9、M2 集成 7。

### 实际执行的命令与结果

- `npm test`：271/271 通过（248 前轮 + 23 新增，旧套件零回归）。
- `node examples/studio/edit-demo.mjs --out work/studio-m2`：九步全过。探索 w∈{24,26,28} → w=26 标 UNCHANGED/duplicateOf=base、uniqueCount=2；接受 w=28 → r2；屏幕修改 CONSTRAINT_CONFLICT 且提交被 CANDIDATE_INVALID 拒绝、head 保持 r2；恢复 r1 → r3 且 renderHash/documentHash 与 r1 精确一致；导出 manifest 过既有校验；幂等重放命中台账不重复接受。
- `node examples/studio/smoke.mjs --out work/studio-smoke`：M1 合同在新 create（含工作区初始化）下仍通过，可重复运行。

### 产物与复现

- `work/studio-m2/`：demo-summary.json、revisions/r1–r3、candidates/c-*（含拒绝证据）、previews/r1-base 与各候选 native/display PNG、export/（r3 的既有格式导出）。
- 复现：`node examples/studio/edit-demo.mjs --out work/studio-m2`（工具目录自动重清）。

### 技术结论

- M2 验收逐条实测通过：流程不是"六个 API 名字"而是真实运行；篡改（伪造成 OK、改文档哈希对不上）、过期（expectedHead/基准）、重放、活锁/死锁、临时残留均有专门测试证据，错误候选未污染 head。
- 保护语义可画面验证：查看 r1 与 w=24/w=28 候选 display 图，仅机箱右缘变化，屏幕区域逐像素不变。

### 视觉结论与评审来源

- 实施者自审（非独立评审）：前后图确认"只改机箱宽度"在画面上严格成立（屏幕逐像素不变，变化限于右缘钢区与描边邻域）。美术质量维持 M1 结论：示意样例 NOT_YET，无标杆不宣称同级。

### 未验证项/限制

- 未做真实 agent 宿主接入与对照评测（M3）、MCP、风格包（M4）、跨帧（M5）、发行核对（M6）。
- 多写者协同与跨版本合并未实现（单写者 + expectedHead 语义）；大文档性能未测（首版 ≤30×30 全量重渲染）。
- 锁依赖 pid 存活检查，远程/容器共享文件系统语义未验证。

### 与原计划的偏差

- 无实质偏差。新增 store 级错误码沿用既有清单；CLI 退出码扩 6/7 已在文件头记录。

### 下一项可执行任务（M3 第一项）

真实宿主 CLI＋读图跑通"创建→探索→接受"：新会话 agent 仅凭 JSON 合同与 inspect 能力声明完成，记录调用轨迹与失败类型，再决定 MCP 薄适配是否必要。

## S1 PGA Studio M0＋M1（2026-09-28，ADR-0008）

阶段：M0（基线/范围/ADR）＋ M1（可编辑文档 → 真实渲染 → 导出）。
依据：`docs/PGA_STUDIO_IMPLEMENTATION_HANDOFF.md`（方案，非事实）、`docs/plans/agent-studio.md`。
本轮目标：Studio v1 文档与校验、静态终端样例、纯编译桥、JSON CLI 最小子集、真实预览与导出、smoke 入口、必要测试。

### 实际完成

- 基线核对：根版本 0.5.0；Git 工作区起点仅交接文档未跟踪；基线 `npm test` 实测 218/218（Node v22.23.2），非照抄旧快照结果。
- `src/studio/document.js`：`pga-studio/1` 白名单校验（未知版本/字段、重复 ID、坏引用、非有限数、越界几何、危险键、上限均拒绝）、规范化（默认描边色/底边中点锚点/layer 下标）、稳定哈希（FNV-1a，纯 JS，无 node:crypto）。
- `src/studio/compiler.js`：可信算子（panel/screen × flat/bevel-metal/scanlines）逐节点直绘 + 既有 `assembleFrame`/`assembleAsset`；`BakedAsset.kind='prop'`；sceneMap 含最终帧坐标/独立包围盒/层序/不透明像素数；子种子复用 `machine.js` 导出的 `partSeed`（算法未改，命名空间 `studio/1:`）。
- `src/studio/observe.js`：native/display（最近邻整数倍+明确背景）/target_crop 视图数据，纯函数。
- `src/adapters/studio-files.js`：文档读取、预览与导出写盘、`.pga.json` 覆盖保护；`bin/pga-studio.mjs`：create/inspect/export，stdout JSON、日志 stderr、退出码 0/2/3/4。
- `examples/studio/terminal.studio.json`（base/shell/screen/side_panel 四节点）与 `examples/studio/smoke.mjs`。
- 测试 30 项：非法文档 14、编译 10、CLI 集成 6。

### 实际执行的命令与结果

- `npm test`：248/248 通过（218 基线 + 30 新增，旧套件零回归）。
- `node examples/studio/smoke.mjs --out work/studio-smoke`：通过。确定性断言（两次编译 documentHash/renderHash/RGBA 全等）、尺寸合同（30×30 → 32×32）、锚点平移、manifest 校验均过。
  documentHash=`304e83eb`，renderHash=`f645726c:6cebd809`。
- `node bin/pga-studio.mjs inspect --doc examples/studio/terminal.studio.json --out work/studio-smoke/inspect --node terminal.screen`：JSON 摘要正常，四节点定位、能力声明与裁切图落盘。

### 产物与复现

- `work/studio-smoke/`：terminal.native.png（32×32）、terminal.display.png（8× 带背景）、terminal.studio.json（规范化源文档）、terminal.scene.json、terminal.asset.json、terminal.page0.png、terminal.manifest.json、smoke-summary.json。

### 技术结论

- M1 验收逐条实测通过：同输入重复编译 RGBA 与元数据一致；四节点稳定 ID 与最终帧坐标；30×30 内画布 → 32×32 最终帧且锚点/附件点 +1 平移符合 ADR-0002；非法文档报 `INVALID_DOCUMENT` 不静默修正；图像确由文档经 PixelPainter + assembleFrame 生成（单测断言具体像素色值，非占位图）；旧行为兼容（CLI 集成断言 `pga.mjs validate` 不变）。

### 视觉结论与评审来源

- 实施者自审（非独立评审），实际查看了 native 与 display PNG：终端可辨识——机箱倒角、屏幕字符纹理、琥珀侧板、底座与描边均按文档渲染，零件关系与材质规则确实生效。
- 这仅证明"文档驱动渲染管线视觉连通"，属于示意样例：不代表美术质量达标，无标杆对照，不宣称质量同级。侧板为纯色 slab、底座与机箱衔接生硬等造型问题留待后续阶段；按 `visual-quality.md` 记：整体美学 NOT_YET（仅示意），技术 PASS。

### 未验证项/限制

- 未做候选编辑/探索/回退/事务（M2）、真实 agent 宿主接入（M3）、遮挡支持掩码（v1 未实现）、跨帧（M5）、发行载荷核对（M6）。
- `constraints` 仅声明未强制执行；`capabilities` 中操作标记 `planned-m2`。
- 未在其他 Node 版本/平台验证；未经独立视觉评审。

### 与原计划的偏差

- 无实质偏差。`BakedAsset.kind` 按 ADR-0008 记为 `'prop'`（方案允许两种方式，ADR 选定不新增 kind）；partSeed 采用"导出复用 + 独立命名空间"而非另写算法。

### 下一项可执行任务（M2 第一项）

为 `geometry.set` 实现 `terminal.shell` 的 `w` 参数候选分支：同基准 3 个宽度候选 → 全量重渲染 → 校验 `terminal.screen` 像素保护与 anchor 元数据保护 → 产出前后图与拒绝证据，配套失败注入测试。

## 未验证项（长期，如实记录）

- 技能发现链路（新会话/重启各宿主后确认）。
- Godot 编辑器人工预览（F5）；Godot 后续增强（冻结）。
- 音频模块（旧技能保留参考，未升级为工具包模块）。
- 跨平台（Linux/macOS）与 Node 23+ 未测。
