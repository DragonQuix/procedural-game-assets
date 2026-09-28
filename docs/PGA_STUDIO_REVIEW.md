# PGA Studio 0.6.0 独立审查报告

审查对象：用户上传的 `procedural-game-assets-master(1).zip`。  
对照依据：上一版本 ZIP、`PGA_STUDIO_IMPLEMENTATION_HANDOFF.md`、新仓库中的规则、计划、ADR、实现与测试。  
本报告是审查与修复任务书，不是已经修复的项目，也不包含应直接覆盖回仓库的补丁。

## 1. 结论

**实现方向基本正确，已经形成真实可运行的 alpha；不符合“完整方案已验收完成”的表述。**

应保留现有架构继续修复，不需要推倒重写。最重要的缺口有两层：

1. **可靠性缺口**：局部编辑闭环存在可复现故障，包括旧工作区实例覆盖历史、角色元数据保护失效、材质/色阶探索结果不能提交、请求级保护与工作区路径校验不足、提交失败后的幂等恢复不完整。
2. **产品验证缺口**：尚未通过对照实验证明，同一个较弱 agent 使用 Studio 能比直接写绘图代码更稳定或更高效地产出高质量资产。

现有 312 项测试全部通过，但本次增加的 **9 个独立复现场景命中了 8 类缺陷**。两条材质/色阶复现归为同一类问题。它们没有写回项目测试目录，不包含在原有 312 项中。

### 审查边界

- ZIP 没有 `.git` 历史。本次能够核对最终快照和相对旧版的文件变化，不能独立核验“九次提交”的顺序、原子性与各提交当时的状态。
- 仓库的 M3/H1/H2 试点、宿主安装和部分播放验证是实施者记录。本 ZIP 没有其中引用的 `work/pilot/.../trace.md` 等原始轨迹；本次不将这些记录自动视为已经独立复验。
- 本次实际查看了程序生成的终端、扳手和角色静态图及前后对照。动画 HTML 已生成；当前环境 Chromium 对 `file://` 和本地 HTTP 导航均报 `ERR_BLOCKED_BY_ADMINISTRATOR`，因此**实际动画播放复验为 UNVERIFIED**。未尝试绕过该限制。
- 本次没有调用收费模型，没有开展新的跨模型实验，没有升级任何用户级安装。
- 所有检查在隔离解压副本中进行；最后逐文件核对 ZIP 原有文件，**源文件改动数为 0**。

## 2. 本次实际执行了什么

环境：Node `v22.16.0`、npm `10.9.2`。新快照根版本 `0.6.0`。
使用发行载荷自带的 `pngjs@7.0.0` 放入隔离副本的 `node_modules`，没有把这一步冒充为联网 `npm ci`。

| 检查 | 本次结果 | 证据文件 |
|---|---|---|
| `npm test` | 312 tests，312 pass，0 fail，0 skipped | `evidence/npm-test.log` |
| `node examples/studio/smoke.mjs --out <隔离目录>` | 通过，生成真实 PNG 与资产 | `evidence/smoke.log` |
| `node examples/studio/edit-demo.mjs --out <隔离目录>` | 通过 | `evidence/edit-demo.log` |
| `node examples/studio/m4-demo.mjs --out <隔离目录>` | 通过 | `evidence/m4-demo.log` |
| `node examples/studio/m5-demo.mjs --out <隔离目录>` | 通过，生成帧、候选和播放页 | `evidence/m5-demo.log` |
| `node tools/release.mjs --check` | 普通版 169 文件哈希一致 | `evidence/release-check.log` |
| `node tools/release.mjs --skill procedural-game-assets-loop --check` | 循环版 132 文件哈希一致 | `evidence/loop-release-check.log` |
| 从普通版载荷初始化干净项目 | 169 文件携带成功 | `evidence/clean-init.log` |
| 干净项目 `npm test` / `npm run check` | 1/1，通过；携带哈希一致 | `evidence/clean-test.log`、`evidence/clean-check.log` |
| 在干净项目携带的工具包中运行 Studio smoke | 通过 | `evidence/clean-smoke.log` |
| 9 个额外独立复现场景 | 全部复现对应缺陷；脚本退出码 1 表示命中缺陷 | `evidence/results.json`、`evidence/regressions.log` |
| 原生图和显示预览 | 已实际查看 | `evidence/visual-contact-sheet.png` 及原始小图 |
| 本次浏览器实际播放 | UNVERIFIED，环境阻止导航 | `evidence/browser-playback.json` |

这些结果说明功能主干和携带路径真实存在；不能推出全部编辑操作、保护承诺和异常恢复都正确。

## 3. 与原实施方案的符合度

| 阶段 | 本次判断 | 理由 |
|---|---|---|
| M0 基线和边界 | 快照层面基本符合 | 有规则、计划、ADR 和可执行测试；Git 历史不在附件内。 |
| M1 文档到渲染/导出 | 基本符合 | 数据文档、稳定节点、编译、定位、CLI、真实图片和旧资产格式都存在且跑通。 |
| M2 安全局部编辑闭环 | **未通过关键验收** | 主演示能跑，但材质/色阶探索提交、历史保护、请求保护与异常重试有实测缺陷。 |
| M3 agent 接入与收益验证 | **只完成记录中的接口试点，产品命题未完成** | 文档明确 A/B/C/D 对照未做；原始试点轨迹不随 ZIP 提供。暂不添加 MCP 本身不违约。 |
| M4 风格与构造 | 有限范围实现基本成立 | 加入 poly/disc、局部色阶覆盖、shade-diag 和第二类形状。尚不是完整美术规则包，留出试点只见实施记录。 |
| M5 角色跨帧 | **有限功能存在，但保护合同未通过** | 复用 bakeHumanoid、跨帧改色/骨架/ASCII 部件确实可用；纯元数据变化会漏报并绕过保护。未适配姿态采用“修改但未检查”的语义，需要收紧。 |
| M6 发行携带 | 打包路径通过；不能等同稳定性验收 | 普通版、循环版校验和干净目录 smoke 通过。当前缺陷也随普通版载荷发布；文档状态有矛盾。 |

**不应额外判为违约的事项**：没有完整 GUI、MCP、扩散生成后端、任意骨架、Godot 首版接入、GIF/APNG，并不是本方案首版强制要求。尤其不能为了“补齐里程碑”现在急着加入这些系统。

## 4. 必须先修的缺陷

优先级说明：

- **P1**：影响核心编辑链路、历史/约束正确性或本地写入边界，应在继续扩大使用前修复。
- **P2**：诊断、评测或维护问题，可以与修复版一同完成。
- 这里不是外部攻击面评分。工具目前是受信本地程序；特别是磁盘篡改测试不等于声称它已具备远程攻击入口或应该抵御拥有完全文件系统权限的对手。

### R1 / P1：旧工作区实例能覆盖已经提交的历史版本

位置：
- `src/adapters/studio-store.js:99–110`：打开时缓存 head/seq。
- `src/adapters/studio-store.js:236–246`：锁内没有重新读取持久化 head，也没有在锁内再次核对台账。
- `src/adapters/studio-store.js:374–417`：根据缓存 head 判断 expectedHead。
- `src/adapters/studio-store.js:151–165`：按缓存 seq 产生修订名，并使用可覆盖的 rename 写入。

复现 `stale-writer-overwrites-revision`：
1. 两个实例 A、B 同时持有初始 `r1` 状态。
2. A 准备机箱宽 28 的候选；B 准备宽 24 的候选。
3. A 提交，生成 `r2`，机箱宽 28。
4. B 仍以 `expectedHead=r1` 提交。
5. B 没有收到 STALE_REVISION，反而也返回 `r2`，把已有 `r2.json` 改成机箱宽 24。

**影响**：不只是返回值过时，而是已接受历史被覆写。两个提交可以先后获得锁，所以“有锁”并不能防止这个问题。CLI 也存在从 open 到取得锁之间的状态窗口；本次确定性复现使用两个公开 Store 实例，不需要不稳定的并发时序。

修复方向：
- 在锁内从磁盘重新读取并校验 head/seq，再核对 expectedHead、候选基准和请求台账。
- 已存在的修订文件不能静默替换；如果相同修订名已经存在，只能核实完全相同或明确报冲突。
- 用唯一事务/修订身份或可恢复的版本分配，处理崩溃后留下的孤立修订。
- `state()` 和长生命周期实例的读取也要给出清晰的新鲜度合同。
- 增加“两个预先打开实例”的测试；不能仅在同一个实例中修改 expectedHead 来代替这个覆盖面。

### R2 / P1：角色元数据改变而像素不变时，保护失效

位置：
- `src/studio/character-compiler.js:137–165`：是否计入 affectedFrames 只看 RGBA 差异。
- `src/studio/character-compiler.js:177–195`：显式 metadata 保护只遍历 affectedFrames。
- `src/studio/character-compiler.js:203–212`：UNCHANGED 也仅由像素差异判定。

复现 `character-metadata-only-protection-bypass`：
1. 使用锈爪文档中的 `stand_fwd` 帧，声明保护 `attachments.head`。
2. 在 head ASCII 顶部添加一行同宽的透明 `.`。
3. 既有布局会将部件原点上移，原有像素行恰好回到相同显示位置。
4. RGBA 完全不变，但 `attachments.head` 从 `(17,21)` 变为 `(17,20)`。
5. 返回 `status=UNCHANGED`、`affectedFrames=[]`；commit 仍成功。

**影响**：视觉 agent 仅看图片根本发现不了，但游戏附件点发生变化。这直接违反“保护元数据”和“自动报告受影响帧”的要求。

修复方向：
- 分别计算 `pixelChanged`、`metadataChanged`、`frameSizeChanged`、`clipChanged`；受影响范围不能只由像素变化决定。
- metadata 保护应独立遍历所有相关帧，不以“已经列入像素变化帧”作为前提。
- `UNCHANGED` 的合同必须明确：不能将输出元数据已改变的候选标成整体无变化。
- 报告中可以区分“像素变化帧”“仅元数据变化帧”，方便 agent 判断。
- 加入本例，以及仅附件点变化、增加/丢失附件点、未适配帧被显式保护等测试。

### R3 / P1：material.set / ramp.set 的探索候选显示 OK，却不能提交

位置：
- `src/adapters/studio-store.js:332–339`：prop 探索记录统一写成 `params: { [field]: value }`。
- `src/adapters/studio-store.js:393–402`：提交会重新执行保存的 operation。
- `src/studio/operators.js` 中 `applyOperation`：material.set 读取 `operation.material`，ramp.set 读取 `operation.ramp`。

复现：
- `explore-commit-material.set`：探索机箱 `material=flat`，候选 OK；提交报“材质 undefined 不支持”。
- `explore-commit-ramp.set`：探索机箱 `ramp=amber`，候选 OK；提交报“色阶收到 undefined”。

**影响**：三个首批操作中，只有 geometry.set 的探索提交链路正确。agent 已经花时间看图选择，最后仍然无法接受选中的候选。

修复方向：
- 在纯操作层提供统一的“探索项 → 标准 operation”转换。
- 用同一份规范 operation 进行试验、存储、哈希和重新执行，不在 Store 里再手工拼一次。
- 对 geometry/material/ramp，以及三个角色操作，逐个覆盖 edit 与 explore → commit → reopen → export。
- 为 v2 局部色阶对象增加同样的端到端检查。

### R4 / P1：请求级 preserve 未校验，拼错后被静默忽略

位置：
- `bin/pga-studio.mjs:198–208`：`--preserve` JSON 直接传给 Store。
- `src/adapters/studio-store.js:285–292`：直接合并请求级保护。
- `src/studio/protect.js:113–116`：按 kind 过滤，未知 kind 被丢弃。
- `src/studio/protect.js:174–176`：某些找不到的目标会被跳过。
- 角色保护也只过滤 metadata，不验证请求级未知类别。

复现 `misspelled-preserve-silently-ignored`：
传入 `{"kind":"pixel","target":"terminal.shell"}`（应为 pixels），随后修改机箱宽度。
实际返回 OK，机箱有 95 个像素改变，响应中的有效保护没有用户请求的机箱。

**影响**：弱 agent 正是更可能拼错字段或目标的使用者。工具不能把未理解的保护要求当成“没有保护要求”。

修复方向：
- 文档与请求级保护共用严格 schema 校验。
- 拒绝未知 kind、未知/不存在 target、错误数组形状和未支持范围。
- CLI 使用命令级选项白名单，避免错误选项悄悄变成无效参数。
- 对不支持的角色 pixels/structure 保护应明确失败，而不是忽略。
- 不需要猜测用户意图；应该返回可修正的结构化错误。

### R5 / P1：提交重检依赖候选文件中的保护列表，未重新加载权威约束

位置：
- `src/adapters/studio-store.js:393–405`，特别是 `preserve: record.preserve`。
- 与创建候选时“文档 constraints + 请求 preserve”的逻辑不对称。

复现 `candidate-removes-authoritative-protection`：
1. 修改受文档 pixels 保护的屏幕，候选正确 REJECTED。
2. 仅在该候选记录中清空 preserve，并把 checks.status 改成 OK；不改基准文档或候选文档中的 constraints。
3. 提交重新执行操作并重算像素后，仍然接受了这个候选。

**影响**：仓库声称“不信落盘 checks、提交重新校验”，但重新校验本身仍然信任同一记录中的保护列表。这个测试与项目已有的“篡改候选 checks”测试属于同一完整性合同的补充，不是要求对抗完全控制工作区的恶意用户。

修复方向：
- 提交时从基准修订重新取出文档级 constraints，这些约束不能由候选记录删掉。
- 请求级保护要与规范请求内容和候选身份绑定，并核对不可变来源。
- 比较规范 operation、文档、基准和请求记录的一致性；发现不一致拒绝。
- 明确本地完整性校验不等于访问控制，不夸大安全保证。

### R6 / P1：head 已更新、请求台账尚未写入时失败，重试不能恢复原结果

位置：
- `src/adapters/studio-store.js:236–244`：先执行变更，再写请求台账。
- `src/adapters/studio-store.js:410–417`：修订和 head 在返回结果前已经持久化。

复现 `commit-crash-before-ledger`：
在 commit 的 `_writeLedger` 处注入异常，精确模拟 head 更新后、台账落盘前的失败窗口。
首次调用报错，但磁盘 head 已是 r2。重新打开工作区，用同一 requestId 和同一请求重试，得到 STALE_REVISION，而不是原提交结果。

**影响**：调用者不能可靠区分“失败且没改动”与“其实已经成功”。既有测试只覆盖正常完成后重新打开，不覆盖事务中途失败。

修复方向：
- 用轻量事务意图记录/提交日志，在更新 head 前持久化足够的恢复信息。
- 重启后可判断事务是否已提交，并恢复同一 requestId 的结果。
- 不要仅把写台账简单移到写 head 前：那会产生“台账说成功、head 还没提交”的相反窗口。
- 增加 head 前后、台账前后、修订写入后的故障注入与重开测试。
- 不需要建设分布式数据库；本地单写者也可以实现明确的恢复合同。

### R7 / P1：requestId 可以穿越工作区目录

位置：
- `src/adapters/studio-store.js:216–232`：直接将 requestId 放入 `requests/<id>.json`。
- CLI 和 Store 均没有约束 requestId 为安全的叶子名称。

复现 `request-id-escapes-workspace`：
给请求传入形如 `../../escape-path-xxx` 的 ID，操作成功，在工作区之外创建了请求台账文件。本次复现将文件限制在审查证据目录内，没有触碰用户其他文件。

**影响**：本地写入边界不可靠。这里证实的是“能在工作区外写请求记录”，不扩展声称已证明任意格式文件覆盖或远程利用。

修复方向：
- 统一校验 requestId、revision、candidateId 的类型、长度和允许字符。
- 不允许路径分隔符、绝对路径或 `..` 路径段。
- 在 IO 边界额外核实 resolve 后的路径仍在工作区；明确符号链接处理策略。
- 校验应在 CLI 与 Store 的共享边界进行，不能只修 CLI 留下模块 API 的旁路。

### R8 / P2：角色 diffPixels 实际统计的是变化通道数

位置：`src/studio/character-compiler.js:137–145`。

复现 `character-diff-counts-channels-not-pixels`：
锈爪 `palette.V` 改成 `#ffd23d`，实际是 91 个像素发生改变，工具报告 273。
原因是逐字节比较 RGBA，三个颜色通道分别累计。

修复方向：
- 以四字节为一组，任一通道变化只计一个像素。
- 若通道数也有诊断价值，另设 changedChannels 字段。
- 全透明像素是否纳入比较保持既有 RGBA 一致性合同，不在修计数时顺手改变定义。

## 5. 另外需要明确的合同与维护问题

### 5.1 “已修改但未检查”的姿态不能被理解为全部通过

角色编译器把未在 checkedPoseKinds 内的变化列入 notCoveredChanges，但仍允许顶层 status=OK 并提交。

这比隐瞒未覆盖情况好，但与原任务书“未适配姿态明确返回不支持”的要求并不完全相同。还需要注意：`character-doc.js:118–119` 允许作者声明任意已知姿态种类为 checkedPoseKinds；检查覆盖范围应由引擎实际适配器决定，而不能只由文档作者自报。

建议：
- 将 `canRender`、`canEdit`、`canValidate` 分开。
- 引擎声明真实检查能力；任务只声明需要哪种覆盖。
- 默认要求本次修改影响的必要帧均已覆盖；允许局部覆盖时需要调用者明确选择，并保持可见的 UNVERIFIED 状态。
- 对所有帧的显式 metadata 保护都应生效，不能因为某帧不在美术/姿态不变量适配范围就忽略元数据。

这不要求立刻实现所有姿态，而是要求正确表达有限能力。

### 5.2 阶段状态有矛盾

- `docs/plans/agent-studio.md:20` 仍写 M6 未做。
- `docs/verification.md` S6 的“下一项”写“M0–M6 全部落地”。
- `tasks/todo.md` 与验证记录又明确 M3 对照未做。
- 根 `package.json` 是 0.6.0，根 `package-lock.json` 的项目版本仍是 0.5.0。

建议建立同一阶段状态表，使用“技术实现完成 / 部分完成 / 验证待办 / 明确不做”，而不是不同文档给不同结论。同步 lockfile 是维护修正，不应将这个版本元数据问题夸大成已经证明的安装故障。

### 5.3 评测记录可追溯性不足

M3 文档记载四个试点都通过，也明确没有 A/B 对照；这部分边界说明值得保留。但本次附件没有它引用的 523 行原始轨迹，因此不能独立确认每一次看图调用与选择过程。

不建议把全部 work 目录提交进 Git。保留最小、脱敏、可复查的记录即可：任务、固定模型/宿主版本、完整必要调用、候选对应关系、结果与费用、图片/日志哈希。没有证据的历史内容继续标为实施者记录，不补写虚假的回溯轨迹。

## 6. 哪些设计值得保留

1. **复用旧核心正确**：新功能主要位于 src/studio 与 IO 适配层，没有重写 PixelPainter。machine.js 的变化主要是导出既有 partSeed，算法未被改写。
2. **可编辑源与渲染产物分开**：文档、节点、样式引用、sceneMap、预览与导出形成真实链路。
3. **前瞻计算影响区域的方向正确**：protect.js 不是将所有实际差异事后解释成允许变化，而是从旧/新目标范围和遮挡计算区域。
4. **检查与视觉结论有所区分**：验证文档多处写明示意图水平、NOT_YET、非独立美术评审、不宣称弱 agent 收益已经证实。
5. **发行路径真实**：普通版携带 Studio，循环版不自动随动；干净目录初始化和 smoke 可复现。

下一轮应修补这些设计的实现漏洞，而不是换一个框架重新开始。

## 7. 关于“高质量图像引擎”的实际进度

本次静态图显示：终端、机械工具和已有角色都可以被构造与编辑。它们主要证明工程功能，而不是证明美术质量已经被引擎显著抬高。

当前能力更接近：
**有版本、有保护检查的程序化资产参数编辑器。**

距离原始目标还需要验证两件事：
- **更容易画对**：同一 agent 的错误率、返修量和无意破坏是否显著减少。
- **更容易画好**：部件与风格规则是否真的减少了对 agent 手写顶点、ASCII 像素图和自行设计光影的依赖。

当前 poly 仍需要顶点；art.set 仍需要 ASCII 像素图；shade-diag 是按包围盒对角分带，不是按不同形体/材质设计的完整表现规则。这些都可以作为有限能力存在，但不能仅通过循环次数得到“高质量”的保证。

### 推荐的后续产品改进顺序

**先补可靠性，再做受控对照，最后根据失败原因扩展美术能力。**

第一项产品验证可先缩小为同模型 A vs D：直接写代码＋看图，对比 Studio 语义编辑＋有限探索。在少量预先确定的新建/局部修复/保护任务上重复运行；两组拿到可比的资料、初始资产和预算。记录全部候选与失败，不只展示最好结果。确有收益后再扩展到原计划 A/B/C/D 和更多任务。

成本包括模型调用、图像读取、额外评价者和生成所有候选的开销。视觉按现有质量合同判断，允许“无明显差异”或“都未达标”，不以像素复杂度或颜色数量当作好看的替代指标。

扩展美术能力时优先选择：
- **可执行风格规则**：比例/明暗焦点/细节尺度/材质表现规则与前后例子，而不仅是 meta 与调色板。
- **有限结构替换或附着操作**：在同一文档与版本历史内改变构造，不让较大设计变化只能重新手写整个 JSON。
- **更低成本的观察**：内置同尺度候选对照、差异图、目标定位和元数据变化摘要，而不要求每次手动打开很多文件。

不要同时建设新 GUI、MCP、云服务、模型训练与通用图层系统。只有真实宿主或任务失败明确要求时才增加对应能力。

## 8. 下一轮开发任务安排

### 修复批次 A：核心链路与角色保护
修 R3、R2、R8。先写失败测试，统一操作序列化；建立像素/元数据分离的变化检测与保护检查。

### 修复批次 B：事务与历史
修 R1、R6。锁内重读、无覆盖修订、事务恢复记录、重试恢复。至少覆盖两个旧实例和真正的提交中途失败窗口。

### 修复批次 C：输入与完整性
修 R4、R5、R7。共享请求校验器、权威约束重载、安全 ID、路径边界，补入 CLI 和模块 API 两侧测试。

### 修复批次 D：合同、文档和发行
明确未覆盖姿态的行为；收敛阶段状态；同步版本元数据。按当前授权范围决定是否发行修复版，并通过现有脚本生成普通版载荷。不得手改载荷，不默认升级循环版或用户级安装。

这四批是职责划分，不是强制每批恰好一个提交；遵守仓库中文原子提交规则即可。不能通过删除保护、放宽状态或把错误改写为成功来“修复”测试。

### 修复完成的最低验收

- 原有测试无回归。
- 本报告每个复现场景被转化为正式测试，断言正确行为，而不是只断言“工具有返回值”。
- geometry/material/ramp 及角色操作都能完整走过 edit/explore、接受、重开、导出。
- 旧实例不覆盖历史；错误候选不改变 head；部分提交失败后同 requestId 可恢复原结果。
- 非法保护与非法 ID 明确拒绝；元数据独立受保护。
- 技术结果和视觉结果继续分开。
- 修复后的源代码与发行载荷若都发布，必须同源生成并验证。

## 9. 可直接发给开发 agent 的提示词

```text
继续维护 procedural-game-assets 的 PGA Studio。请阅读我提供的《PGA_STUDIO_REVIEW.md》和配套独立复现证据包，对当前最新仓库核对后直接修复，不要重新做竞品调研或扩建 M7。

先读取 AGENTS.md、CONTEXT.md、ADR-0008 至 0011、docs/studio-cli.md、tasks/todo.md、docs/verification.md。确认 Git 状态，不覆盖我的未提交修改。审查对象是此前 0.6.0 快照；以当前代码为准，不照抄旧测试数字为本轮结果。

审查已在隔离副本确认 312 项既有测试全过，但 9 个独立复现场景暴露 8 类缺陷：
R1：Store 缓存 head 未在锁内刷新，旧实例能覆盖已有 r2。
R2：角色像素不变但 attachments.head 变化时，保护漏检、误记 UNCHANGED 并允许提交。
R3：material.set/ramp.set 探索保存成 params，候选 OK 却不能 commit。
R4：请求级 preserve 的拼写/类别/目标错误被静默忽略。
R5：commit 信任候选文件的 preserve，未重载基准文档的权威 constraints。
R6：head 写入后、请求台账写入前失败，同 requestId 重试无法恢复原提交结果。
R7：requestId 路径穿越，可把台账写出工作区。
R8：角色 diffPixels 统计 RGBA 通道数而不是像素数。

请先在隔离 work 目录运行复现脚本并检查结果，把这些案例转为正式回归测试，再按职责修复。不要为了让脚本返回成功而吞掉异常或改变既有保护语义。复现脚本不是替代全部产品验收的评分器。

必须：
- 统一探索项到 operation 的规范转换，并对六类操作覆盖完整提交链路。
- 像素变化、元数据变化、检查覆盖、可提交性分别计算。
- 在锁内重读持久化 head/台账；历史修订不得静默覆盖。
- 使用可恢复的事务记录处理 head/ledger 崩溃窗口，不只是简单交换写入顺序。
- 严格校验请求级保护及所有文件 ID；提交从基准重新加载文档级约束。
- 为未适配姿态定义清楚的拒绝/显式局部覆盖合同，不让作者自报已检查能力。
- 收敛文档中的 M3/M6 状态，修正根 package-lock 版本元数据。
- 保持现有坐标、种子、PixelPainter、共享烘焙核心及 pga-loop/2 评审合同。

本轮默认只修开发源、测试和必要文档；不升级用户级安装，不调用收费 API，不新增 GUI/MCP/云生成系统。发行按已有明确授权和脚本执行，禁止手改派生载荷；无发行授权则说明还未发行。

直接执行，不要只给计划。按仓库规则做中文原子提交，不 amend、不 push。
结束汇报每个 R 项的实际复现、修复、测试结果，列真实命令和产物路径。
技术通过不等于视觉通过；M3 对照试验没运行就继续写未验证。
```

## 10. 如何使用证据包

解压审查证据包，在已经可以运行项目依赖的环境中执行：

```bash
node /path/to/review/reproduce-regressions.mjs /path/to/current-repository /path/to/isolated-output
```

- 脚本不修改仓库源文件；会在指定输出目录建立全新测试工作区。
- 有一例故意修改测试候选记录，有一例故意将台账写出该测试工作区，但仍限制在指定审查输出目录内。不要将输出位置指向生产资产目录。
- 退出码 1 表示发现缺陷或意外设置错误；查看结果中的 `bugReproduced` 和 `setupError`。
- 本次运行结果是 9 项 `bugReproduced: true`，没有 setupError。
- 修复后应把场景转为正式正确性断言；不能单靠这个用于取证的脚本决定最终发布。
- `audit-manifest.json` 记录输入文件 SHA-256 与环境，便于确认审查针对哪个快照。
- 图片对照仅做最近邻放大与排版，没有重绘、美化或生成新资产。
