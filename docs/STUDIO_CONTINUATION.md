# Studio 临摹路线续接说明

更新时间：2026-10-01。适用起点：工具包 0.10.0 / Studio v1.5 alpha。
本文件是清空会话后的工作入口，不替代领域合同或验证记录。

## 先读与执行边界

实施 Agent 先读根 AGENTS.md、CONTEXT.md、docs/PLAN.md、docs/studio-raster.md，
以 CONTEXT.md 和 docs/adr/ 为术语、模块边界和架构决策来源。
重点 ADR：0001 核心/IO、0002 坐标、0004 共享烘焙、0009 事务、0014 位图、0015 尺寸草稿。
当前没有 CONTEXT-MAP.md；若以后建立则按其定位子域。
方向见 docs/plans/studio-reference-translation.md；实际证据见 docs/verification.md S11–S11.5。

- Windows/PowerShell，中文交流、文档和提交；本地文件优先 FastCtx，手工编辑用 apply_patch。
- 不默认启动子代理，不改用户级技能安装、循环版载荷、旧实验或参考原图。
- 开发源先改，普通载荷只用 node tools/release.mjs 生成，不手改派生产物。
- 每轮按职责原子提交。用户本次已要求提交并推送；先核对远端，不强推、不 amend、不覆盖他人改动。
- 运行目的是改进项目，**不是获得满意的运行结果**。允许继续打磨样图，前提是过程或发现
  能沉淀为通用工具、技能指导、支持边界或维护判断；不能误读为“禁止打磨样图”。
  补证前说明项目收益与信息缺口，证据足够就停止；不以全绿、截图数量或样图漂亮程度为目标。

## 用户要的能力

Agent 实际看用户角色设计，通过 Studio 创建和修改，再用自身看图能力检查并决定接受/回退。
允许空白绘制、现有配方、PNG 导入或外部生成，不要求全部在 Studio 内完成。
不把 Studio 变成自动理解/评审模型，不要求任意角色套固定 humanoid 模板。
明确临摹时保留角色身份，画风/造型变换按用户授权；质量标杆和身份参考不是同一概念。
技术通过不等于视觉通过，也不默认套循环版双批次独立评审。

## 已交付

- 0.9.0：pga-studio/raster/1，单帧、边长 1..256、二值 alpha、内嵌规范化 RGBA。
  空白/PNG 创建、region+mask 下的绘制/透明擦除/替换、anchor/attachments、候选/恢复/幂等/导出。
  PNG 最多 4 MiB，部分颜色管理/朝向/动画语义拒绝；不自动缩放、去背或量化。
  无跨修订区域冻结，protection=NOT_CONFIGURED；不是任意图层/动画编辑器。
- 0.9.1：path 连续折线、显式 canvas-pixels 输入；默认仍为 region-local-pixels。
  path 2..128 点，默认不闭合，closed=true 也不填充；每次 line/path 合计最多 512 线段。
  原身体修整轨迹只读回放从 148 条压到 70 条，可由两次编辑合为一次，文档与像素完全相同。
  这只证明表达简化，不证明视觉质量或模型成功率提升。
- 0.9.2：位图 edit 接受前直接返回 light/silhouette/observation；绘制/替换还返回
  selection/crop/cropDisplay。基准裁切按候选隔离；JSON 绑定 revision、candidateId 和哈希。
  旧候选及幂等请求不自动补材料；重新 edit 用新 request-id，不能直接修改历史。
- 0.9.3：从 hand-a 局部试改回收 cropLight/cropSilhouette，edit/inspect 在原裁切及 2px 邻域内
  提供不透明浅底，显出深色描边、透明断口和连接处。crop/cropDisplay 保留透明，观察背景不进资产。
  指导补充隔离试改、裁切原点/倍率换算和接缝检查；没有新增绘制操作或自动造型判断。
- 0.10.0：raster.resample 显式等比例最近邻尺寸草稿，width/height 和 sampling=nearest 必填。
  锚点/附件点按边界坐标联动且不取整；constraints 不变，保护、候选接受和恢复共用既有事务。
  跨尺寸 diff.total/outside=null / FRAME_SIZE_CHANGED，不是区域外零变化；observe 差分和候选裁切
  为 NOT_COMPARABLE / FRAME_SIZE_MISMATCH，不暗中套用基准 crop。实际细节重构仍由 Agent 看图后绘改。

主要实现：src/studio/raster-doc.js、src/adapters/studio-store.js、src/adapters/studio-files.js、
src/studio/dispatch.js、src/studio/observe.js、bin/pga-studio.mjs。
通用样例：examples/studio/raster-mark.draw.json、examples/studio/raster-path.draw.json。

已完成原子提交：

- 1e321c6：0.9.0 开发源；5037835：0.9.0 普通载荷。
- 2f64f51：0.9.1 开发源；42bcff5：0.9.1 普通载荷。
- 6438537：0.9.2 开发源；6e30f01：0.9.2 普通载荷。
- 6b4a4f5：0.9.3 开发源；99ba9f9：0.9.3 普通载荷。
- ccb8784：0.10.0 开发源；6f2330f：0.10.0 普通载荷。
- ff200f9：非空尺寸迁移组合回归；a2c0bb3：透明替换与留出材料指导；
  0b39216：普通载荷同步。运行时与 schema 未改，版本仍为 0.10.0。

当前分支 master，远端 origin 为 https://github.com/DragonQuix/procedural-game-assets.git。
本轮从干净的 master/2c899e3 起步，并用 ls-remote 核实 origin/master 同 SHA；
缺少第二张合适设计，只做合成输入的有限探针，收尾更新验证/交接文档并普通推送。
续接时以 git status / git log / 远端查询核实实际状态，不把本文当成永久的同步证明。

## 历史样图与只读证据

用户原图：C:/Users/admin/Downloads/0000.png，只读。
Agent 已看图：暗甲、橙色面甲/装甲纹路、长黑发、交叉背带、袍面符文、护膝。
当前选择 128×256 正面单帧透明背景；不是用户锁死的最终尺寸，可按使用要求重新评估。

以下路径均相对仓库，位于 gitignored 的 work，不会随 Git 推送：

- work/reference-knight/workspace：Studio 工作区，head=r6。
- work/reference-knight/export/ember-knight.studio.json：自包含编辑源。
- work/reference-knight/final/ember-knight.native.png 与 ember-knight.display.png：最后资产图。
- work/reference-knight/reference-R.png：原图副本。
- work/reference-knight/pilot-evidence.json、refinement-evidence.json：修订、局部修复与判断记录。
- work/reference-knight/browser-preview.png：实际 CanvasBank 静态预览截图，1x 完整、2x 局部。
- work/raster-reference-pilot.mjs、raster-reference-refine.mjs、raster-reference-finish.mjs：
  一次性试验脚本，只作轨迹来源，不直接重跑（会继续修改工作区/覆盖报告），不当通用维护模块。

最终 documentHash=3b0918c5，renderHash=0b9b5119:8e0cacc3。
三次局部修改选区外差分均为 0；Agent 自检 **NOT_YET**：手部块状，材质、头发、面甲粗略。
不是独立认证，未证明普遍可靠临摹、尺寸迁移、风格迁移或动画。临时浏览器标签和服务器已关闭。
work 文件如缺失，不要求重建整套样图证据；先用通用 fixture 处理可复用问题。

## 手部局部修整（0.9.3，新工作区）

以下路径相对仓库，同样位于 gitignored 的 work，不随 Git 推送：

- work/studio-local-refinement-20260930/workspace：从旧自包含编辑源创建的新工作区，head=r2。
- 该目录的 hand-a.draw.json、hand-a-connected.draw.json：两次直接 JSON 操作，没有专用绘制脚本。
- 候选 c-c65c055a：373 像素变化，选区外 0；技术 OK，但看完整浅底图发现腕部断口，未接受。
- 候选 c-61d5b316：393 像素变化，选区外 0；接受前看 cropLight/cropSilhouette/native/display，
  腕部连接完整、掌甲和指节更可辨，仅接受为局部草稿。图像在 workspace/previews/c-61d5b316/。
- export/ember-knight.studio.json：本轮草稿编辑源；evidence.json：假设、图像输入、判断和只读文件哈希。

当前 documentHash=5410e14e，renderHash=6521a4dc:8e0cacc3。**整张角色仍为 NOT_YET**：
hand-b 未修整，hand-a 手型仍简化，材质、头发与面甲粗略。未补浏览器预览、人工试玩或独立认证。
原图、旧 r6 head、旧编辑源与两份旧 evidence 的 SHA-256 前后相同；旧候选没有补写新视图。
本轮已回答手部试改的有限操作与观察问题，不为把样图修完而继续重画或对称复制到 hand-b。

## 尺寸草稿与面甲重组（0.10.0，新工作区）

路径相对仓库，均在 gitignored work/studio-size-probe-20260930，不随推送携带：

- source：从上一轮编辑源新建工作区，r1=128×256，当前 head=r3=64×128。
- external-draft、draft-64.png、visor-draft：前期外部缩图探针，只作缺口证据，不重跑或覆盖。
- source/previews/c-1d19dd9e：尺寸候选，接受前实际查看 native/light/display；仅接受为 r2 底稿。
  documentHash=30480cc7，renderHash=9381b820:adec6bf2；size-observe.json 记录跨尺寸不可比较。
- visor-small.draw.json：现有 poly/path/line、canvas-pixels 共 10 条指令，不是专用绘制脚本。
  region={id:visor-small,x:20,y:3,w:25,h:21}；候选 c-3c4f9c33 改变 67 像素、选区外 0。
  接受前实际看 cropLight/cropSilhouette/native/display，眼缝与橙色眉甲更易区分，接受为 r3 局部草稿。
- export/ember-knight.studio.json：本轮自包含编辑源；evidence.json：假设、图像输入、判断和范围。
  当前 documentHash=2e0c2b09，renderHash=2cc1c0e5:adec6bf2；anchor=(32,125)，
  head=(32,13)、handA=(8,68)、handB=(55.5,68)。点位是几何缩放，不是自动部件识别。

整张角色仍为 **NOT_YET**：手部简化、袍面纹路破碎、头发与材质粗略。未做本尺寸的 Canvas 场景验收、
人工试玩、第二种角色或独立认证，不能把 T1 标为完成。现有操作能表达本例的色块重组，停止继续重画。
原图、旧 r6 head、上一轮 head 和编辑源 SHA-256 与本轮起点相同；循环版与用户级安装未改。

## 非空尺寸迁移合成探针（0.10.0 维护，新工作区）

没有新的用户参考；本轮 Agent 自绘的 Probe S 不是留出设计，不计入 T1。
收益是补非空 PNG 到非整数尺寸草稿、掩码替换与候选观察的组合证据，回收操作指导。
路径相对仓库，位于 gitignored `work/studio-structure-probe-20261001`，不随推送携带：

- `design`：blank + source.draw.json 制作的 48×72 合成输入；`workspace`：从其 PNG 创建，
  当前 head=r3、32×48，1x/3x，浅底及 `#263a42` 整体背景。特征与一句假设见 `brief.json`。
- 尺寸候选 c-3037358f 仅接受为 r2 底稿；宽檐帽、外扩斗篷和单侧挎包可辨，一像素暗缝丢失。
- 掩码替换 c-52b820a3 技术 OK，22 像素变化、选区外 0；看局部浅底/剪影及整体后发现
  透明补丁抹掉五个斗篷连接像素，**未接受**。head 仍为 r2，没有把失败候选当作后续基准。
- 直接四条 path/rect 的 c-368aea5d 改变 10 像素、选区外 0，无透明擦除；看相同视图后
  仅接受为局部草稿 r3。documentHash=8893192e，renderHash=2a253ef5:55ba8711。
- `export/structure-probe.studio.json` 与 `reopened`：自包含重开及图集切回像素一致；
  `evidence.json`、`technical-audit.json`：看图路径、裁决、范围与 12 个只读文件的 SHA-256 前后记录。

结论已回收入普通技能和 studio-raster.md：透明替换是擦除，不是叠加；需保留底层时选 draw、
mask=0 或带回基准，不新增 API、不继续完善样图。背景图是 PNG 观察，不是 Canvas 场景验收。
**T1 仍未完成**：缺少未用于调工具的另一种设计；没有完整尺寸迁移、临摹质量、泛化或独立认证结论。
旧骑士仍为 NOT_YET，三套旧 head/编辑源/证据、原图与循环清单保持不变，用户级安装未改。

## 测试事实

- 0.10.0 本轮维护：开发源与实际普通载荷目录各运行
  node --test "tests/unit/studio*.test.js" tests/unit/frame-observation.test.js "tests/integration/studio*.test.js"，
  各 **200 PASS / 0 FAIL / 0 SKIP**；技能携带检查另 **1 PASS / 0 FAIL**。
  日志为 work/studio-structure-probe-20261001 的 `{source-tests,payload-tests,skill-release-tests}.log`。
  普通清单 220 文件一致，循环版只读校验 132 文件一致；不是全套重测。
- 0.10.0 首次尺寸草稿开发源与普通载荷各运行
  node --test "tests/unit/studio*.test.js" tests/unit/frame-observation.test.js "tests/integration/studio*.test.js"，
  各 **199 PASS / 0 FAIL / 0 SKIP**；
  技能携带检查另 **1 PASS / 0 FAIL**。日志位于 work/studio-size-probe-20260930 的
  source-tests.log、payload-tests.log、skill-release-tests.log。普通清单 220 文件，循环版只读校验仍为 132 文件。
- 0.9.3 开发源与普通载荷各运行：
  node --test "tests/unit/studio*.test.js" tests/unit/frame-observation.test.js "tests/integration/studio*.test.js"
  各 **191 PASS / 0 FAIL / 0 SKIP**；开发仓库技能携带检查另 **1 PASS / 0 FAIL**。
  日志为 work/studio-local-refinement-20260930/{source-tests,payload-tests,skill-release-tests}.log。
- 0.9.2 开发源运行：node --test "tests/unit/studio-raster*.test.js" "tests/integration/studio*.test.js" tests/integration/skill-release.test.js
  74 PASS / 0 FAIL。载荷目录同范围但不含 skill-release：73 PASS / 0 FAIL。
  日志 work/studio-raster-preview-source-tests.log、studio-raster-preview-payload-tests.log。
- 0.9.3 普通发行清单为 216 文件；循环版保持原 132 文件，只读核对、不重建。
- 0.9.0 曾跑较广回归：过滤旧断言后 433 PASS；普通载荷 406 PASS / 8 SKIP。
  不是 0.9.2/0.9.3/0.10.0 的全套重测结果。0.9.1 的 20/19 相关回归见 S11.1。
- 已知旧断言：tests/integration/benchmark-e2e-v03.test.js 中
  “24 participants / 12 pairs / 24 independent reviewers planned; no formal data”
  仍要求正式实验数据不存在，但提交 376f563 已归档数据。未为凑绿删除数据或改旧测试。
  如运行全套应如实报告此边界，不能宣称全部通过，也不接管旧实验。

## 建议的下一步

1. 手部观察、尺寸草稿事务与一次面甲重组已有限验证。不为补齐样图或完整报告继续重画其它部位；
   如继续打磨，先说明新的可回收收益与证据缺口，不把允许打磨误读为禁止，也不以视觉通过为唯一目标。
2. 下一步优先按 T1 用未参与调工具的另一种角色/服装结构检查复用性，先实际看设计，
   声明目标尺寸、显示倍率和少数必须保留/允许概括的特征，写一句待验证假设。
   本轮仍缺该材料；先请求用户附图或准确路径，不扫描无关目录，不把合成输入计入留出验收。
   透明替换探针已回答本轮操作与指导问题，未发现新缺口时不为补齐 T1 继续制作合成样图。
   实施者以 CONTEXT.md 和 ADR-0001/0002/0004/0009/0014/0015 为术语与架构来源；当前没有 CONTEXT-MAP.md。
   新建 work，保留已有三套证据，优先沿用空白/PNG 创建、resample 草稿、poly/path/replace 和候选观察。
3. 完整尺寸迁移仍未验收。重采样后重新定位选区和关键点、重组必要细节，不沿用原尺寸的视觉裁决。
   原尺寸、局部浅底/剪影和背景整体都要实际看；不能用跨尺寸 null 差分证明区域保护或视觉保真。
4. 先定位操作、观察或指导中可复用的真实缺口，再决定改代码；不预设必须加 API。
   证据足够支持维护判断就停止，必要测试只回答关键问题。不提前扩展动画、任意比例变换或自动审美服务。

保持方向：用户提供设计后，Agent 能通过可观察、可修改、可回退的工具把它翻译成游戏资产。
不要把工作重新引向通用关系求解器、完整 GUI、强制模型服务、无限评审或漂亮报告。
