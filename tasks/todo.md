# 任务清单 — procedural-game-assets

现行计划：`../docs/PLAN.md`（范围校正版 v2）。
术语与边界：`../CONTEXT.md`；长期决策：`../docs/adr/`。

## 已完成（验证记录见 docs/verification.md）

## S9 Studio v1.3（2026-09-29）

依据：`../CONTEXT.md`、`../docs/PLAN.md`、ADR-0001/0002/0008–0012；无 CONTEXT-MAP.md。

- [x] v1.2 superseding audited interpretation，旧 scored/raw/review/key/freeze 全部保留
- [x] /3 资产级合同、T05 27px 回归、metadata/node 独立保护、commit/submit 最终编译重验
- [x] 矩形三语义 transform，有限试编译安全域、修订绑定、非法探索提前拒绝
- [x] 共享 crop/contact sheet/diff overlay，与最终资产分离
- [x] 新 harness 的严格 review schema、动画传播、真实宿主 vision 分类；旧隔离自检 9/9
- [x] 两份全新 demo 实际运行，PNG/JSON 见 `../docs/evidence/studio-v1_3/`
- [x] PGA_CONSTRAINT_BENCHMARK_v0_1 草案、真实旧源码冻结与新 hold-out；未运行
- [ ] 正式冻结模型/宿主、共同计数 runner、宿主输入证据通道及执行授权后才可运行 12-run
- [ ] 视觉/弱 agent 能力收益：本轮没有实验结论，不宣称改善

## P0–P7 历史

- [x] P0 基线与契约（cfac45e）
- [x] P1 无 DOM 像素核心（05598a8）
- [x] P2 角色闭环：60 帧逐像素回归、rustclaw、最低画廊（3b966dc）
- [x] P3 图集与清单：PNG、稳定打包、manifest、CLI export（cf87bbd）
- [x] P4 配方扩展：机械/植被/道具/地形（见 git log）
- [x] P5 视觉工作台：变体/场景/对比、四植入故障演练（4772227）
- [x] P6 消费与集成：Canvas 切片、Godot 4.6.2 实测（ad9f5fa，Godot 现降为可选）
- [x] P7 技能封装：SKILL.md、载荷、安装（ec9d402，发现链路待新会话验证）
- [x] 范围校正：ADR-0004/0005、PLAN.md v2、CONTEXT 修订

## R1 网页接入（ADR-0004）

- [ ] `src/adapters/canvas.js`：注入式 Canvas 工厂、CanvasBank、按需变体（镜像/白闪）
- [ ] Node 测试（stub canvas）+ 浏览器 smoke（启动烘焙路径实际画面）
- [ ] 与导出路径的像素一致性验证（共享烘焙实现）

## R2 Canvas 模板（ADR-0005）

- [ ] `template/logic/`：固定步长、输入、暂停/重启、镜头、AABB 碰撞、射击交互、粒子/白闪、固定种子、step/state 接口（无 DOM）
- [ ] `template/render/`：场景/自发光/HUD 层序，消费 CanvasBank
- [ ] canvas-slice 升级整合 + node 测试 + 浏览器验证 + 运行说明

## R3 技能改版（已完成）

- [x] SKILL.md 主用途改为网页游戏；Godot 降可选（reference/godot.md 保留）
- [x] toolkit-api.md 增加 adapters/canvas 与模板接口
- [x] 差异核对：旧载荷自洽，变更在源树；版本 0.2.0，PLAN.md 入载荷
- [x] 重装完成：114 文件哈希一致；0.1.0 备份保留（backup-20260926101924）；发现链路待新会话验证

## R4 新验收（已完成，实施者验收，非独立 Agent 试验）

- [x] 「雪原突击」可玩切片：移动、射击交互、雪原肃清/失败、白闪/粒子反馈
- [x] 三预设 assault/clear/hit 浏览器截图 + work/game.test.mjs 机测 6/6
- [x] 验收发现并修复：模板帧名硬编码（0.2.1 content.aimFrames）、敌人盒高度、bastion 眉影、子弹配色
- [x] pga-acceptance 提交 7d42571；README 含运行步骤与如实验收记录

## 冻结

- Godot 增强、音频模块化、Unity、网络服务：见 PLAN.md 冻结项

## S0/S1 PGA Studio M0＋M1（2026-09-28，ADR-0008）

依据：`../docs/PGA_STUDIO_IMPLEMENTATION_HANDOFF.md`（方案）、`../docs/plans/agent-studio.md`。

- [x] 基线核对：根版本 0.5.0、工作区干净（仅交接文档未跟踪）、全量测试 218/218（Node v22.23.2）
- [x] ADR-0008（文档 v1/编译桥/子种子复用/sceneMap/CLI 分层）与 plans/agent-studio.md
- [x] `src/studio/document.js`：`pga-studio/1` 校验、规范化、稳定哈希（documentHash/styleHash）
- [x] `src/studio/compiler.js`：可信算子直绘 + `assembleFrame`/`assembleAsset`，sceneMap 与 renderHash
- [x] `src/studio/observe.js`：native/display/target_crop 视图数据（纯函数）
- [x] `src/adapters/studio-files.js`：文档读取、预览与导出写盘、覆盖保护（IO 层）
- [x] `bin/pga-studio.mjs`：create/inspect/export JSON CLI（stdout JSON、日志 stderr）
- [x] `examples/studio/terminal.studio.json` 静态样例（base/shell/screen/side_panel）
- [x] `examples/studio/smoke.mjs`：单命令确定性 smoke（`--out work/studio-smoke`）
- [x] 新测试：非法文档、确定性、尺寸/padding、锚点、CLI 与旧行为兼容

## S2 PGA Studio M2（2026-09-28，ADR-0009）

- [x] ADR-0009（候选事务、独立影响区域保护、工作区存储、幂等台账）
- [x] `src/studio/operators.js`：geometry.set/material.set/ramp.set 纯变换 + plan
- [x] `src/studio/protect.js`：结构/像素/元数据三类保护；允许区域独立计算（含层序遮挡）
- [x] 编译器 per-node 支持掩码（sceneMap 掩码缺口补齐）
- [x] `src/adapters/studio-store.js`：修订/候选/head/台账/锁；commit 重新校验不信落盘
- [x] CLI state/edit/explore/commit + 工作区模式 inspect/export；退出码 6/7
- [x] `examples/studio/edit-demo.mjs` 必做演示九步全过；失败注入/过期/重放/重启恢复测试
- [x] 全套件 271/271；前后图实际查看（屏幕逐像素不变，变化限于机箱右缘）

## S3 PGA Studio M3 首轮试点（2026-09-28）

- [x] 预注册试点协议 `docs/plans/agent-studio-m3-pilot.md` 与 agent 合同 `docs/studio-cli.md`
- [x] 4 个隔离子代理试点（P0 新建/P1 探索接受/P2 材质保护/P3 冲突处理）全部 PASS
- [x] 客观核验：head/修订/manifest/轨迹 523 行；图像真实到达模型；head 未被污染
- [x] 试点驱动修复：指南 5 处、误导诊断字段 1 处、样例约束 note 更正；回归 271/271
- [x] MCP 决策：当前宿主 CLI＋读图成立，暂不添加薄适配（见 verification S3）
- [ ] M3 完整对照评测（A/B 组、12 任务×重复、跨模型/宿主）：未做，不宣称

## S4 PGA Studio M4（2026-09-28，ADR-0010）

- [x] ADR-0010（版本化词汇 / 局部覆盖 / shade-diag / 保守保护语义）
- [x] `pga-studio/2`：poly/disc 几何、shade-diag、ramp 局部覆盖、style.meta；/1 冻结共存
- [x] `examples/studio/wrench.studio.json` 非箱体式样例 + `m4-demo.mjs` 四步演示
- [x] 新测试 22 项；全套件 293/293；/1 渲染锚点 f645726c:6cebd809 不变
- [x] 保守保护语义实证（bbox 透明角透变 1px 捕获）
- [x] 留出组合试点 H1（仪表新建＋局部覆盖）/ H2（poly 顶点缩短）均 PASS，客观核验
- [x] 指南更新（/2 词汇、保护语义警示、过窄 poly 边界、--preserve 格式）
- [ ] M4 留空：比例/细节尺度规则、正反例库、构造件库

## S5 PGA Studio M5（2026-09-28，ADR-0011）

- [x] ADR-0011（角色数据面 / 跨帧不变量 / 播放材料）
- [x] `pga-studio/character/1` 校验与能力；锈爪样例与 bakeHumanoid 逐字节等价（锚点 11c587dd:d890d15f）
- [x] palette.set / rig.set / art.set 跨帧一致；受影响帧/附件点/剪辑自动报告；dead 姿态 notCovered
- [x] 锚点/接地（底缘）不变量；metadata 保护命中实证（attachments.muzzle）
- [x] dispatch 统一分派；store/CLI 文档类型无关；player.html 播放材料（墙钟计时修复）
- [x] 新测试 19 项；全套件 312/312；m5-demo 六步全过
- [x] 真实浏览器播放验证：run_fwd 帧计数前进并截图；改色前后对比图实际查看
- [ ] M5 留空：帧覆盖、任意骨架/生物、角色 pixels/structure 保护、APNG/GIF

## S6 PGA Studio M6（2026-09-28，0.6.0）

- [x] 白名单增补：examples/studio + docs/studio-cli.md 入 PAYLOAD（src/bin/tests/adr 本已整体携带）
- [x] SKILL.md Studio 章节（alpha 范围与边界如实标注）；版本 0.6.0
- [x] `node tools/release.mjs` 重建普通版载荷 169 文件并校验通过（来源 5ae763a）
- [x] 循环版不随动：`--skill procedural-game-assets-loop --check` 132 文件一致
- [x] 干净目录验证：init-project 携带复核、npm test/check、smoke/CLI/m5-demo 实际运行全过
- [x] 全套件 312/312；哈希跨位置确定（干净目录 == 开发仓库）

## S7 普通版 0.6.0 多宿主安装（2026-09-28，用户授权）

- [x] 推送 master 到 origin（`4613da5`）
- [x] install.mjs：主存储 0.4.1 → 0.6.0（旧版备份 *-backup-20260928130929）
- [x] 8 宿主 junction 复核；版本读回：Codex/ZCode/DeepSeek Harness/Kimi Code/workbuddy/cursor/Grok build/Claude Code 全 0.6.0
- [x] OMP 经 customDirectories 间接生效（config 实测）
- [x] 主存储载荷 verifyTree 一致；安装副本 smoke 实跑通过
- [ ] 各宿主重启/新会话后的技能列表刷新验证（本机无法代替，沿用既有口径）

## S8 Studio 审查修复轮（2026-09-28，R1–R8 + D1）

依据：`../docs/PGA_STUDIO_REVIEW.md`（0.6.0 独立审查）§4/§5/§8/§9；实测见 `../docs/verification.md` S8。

- [x] 批次 A（c2763ad）：R3 探索项统一标准 operation（六类操作 edit/explore→commit→重开→导出全链路）、R2 角色元数据独立保护（含 notCovered 帧、UNCHANGED 双不变、checkedPoseKinds 收紧）、R8 diffPixels 按像素计
- [x] 批次 B（5a9b3cc）：R1 锁内重读 head/台账、同名修订不覆盖（REVISION_CONFLICT）、state() 新鲜度；R6 台账两阶段 pending→done 与崩溃恢复（原结果恢复/幂等前滚/冲突 STALE）
- [x] 批次 C（9faa73a）：R4 preserve 严格校验（文档级与请求级共用 + CLI 选项白名单）、R5 commit 重载权威 constraints 并重算候选身份、R7 文件 ID 白名单与路径遏制
- [x] 批次 D：阶段口径统一（技术实现完成/部分完成/验证待办/明确不做）、package-lock 版本同步 0.6.0、verification.md S8、studio-cli.md 合同同步、ADR-0009/0011 修订段
- [x] 9 个复现场景全部转为正式回归测试（新增 27 项）；全套件 339/339；复现脚本重放确认正确行为
- [ ] 修复版载荷发行与用户级安装升级（需明确授权；本轮未发行、未升级）
- [ ] M3 A/B 对照评测（沿用 S3 口径：未做，不宣称）

### 后续可选

- A/B 对照评测（待独立评测资源）、M4/M5 留空项、MCP（待有不能读文件的宿主）

## 发现入口与备份收敛（2026-09-26，单独任务）

- [x] 核查：4 个同名入口（0.2.1 / 0.1.0 / 0.2.0 / 初版文档）按内容定版
- [x] 3 个旧备份（231 文件）移至 `.codex/backups/skills/procedural-game-assets/`，迁移前后 sha256 逐文件一致
- [x] 安装脚本修复：备份落发现目录之外；junction 探测（readlink）；入口父目录创建；install-core 重构 + 集成测试 3 项
- [x] 唯一入口核实：`.codex/skills` 与 `.agents/skills` 各仅一个 procedural-game-assets
- [x] 载荷重建（115 文件，新测试在载荷中自动跳过）并重装，开发源==安装副本
- [ ] 发现列表刷新验证：待新会话/重启 Codex App（本会话无法证明）

## 多宿主入口注册（2026-09-26）

- [x] 实机核查 9 宿主惯例（anysearch 参照：skills/<name> 链接到唯一主存储）
- [x] register-harnesses.mjs：8 宿主 junction → .codex/skills 主存储（读回均 0.2.1），OMP 经 customDirectories 间接生效
- [x] 修正脚本"错指开发仓库"缺陷并重建全部链接；幂等验证 8/8
- [x] 端到端测试 register-harnesses.test.js 2 项；载荷 116 文件重装
- [ ] 各宿主重启/新会话后的技能列表验证（本会话无法证明）

## R5 多宿主试验回收（2026-09-26，0.3.0）

- [x] 输入契约：pressed 离散事件（每动作队列上限 8）、失焦清空防粘键、暂停帧只清游戏动作；测试 10 项
- [x] DOM HUD 替代画布内小字（中文横幅/stats），dbg 加 /paused；位图字体记为可选方案；测试 2 项
- [x] 携带隔离：init-project 干净目录初始化（vendor/pga/ + 哈希复核 + 项目身份 + import 改写）；测试 4 项
- [x] 审图与证据纪律回收进 reference/visual-diagnosis.md（泛化，不照搬空间站美术）
- [x] 浏览器验证脚本 tools/browser-check.py 入库；行为断言 10/10（真实按键/预设/
  同帧双击 Esc 确定性断言），截图采集 11 张另计（含 320px 原生与窄屏）
- [x] 同状态修改前截图：从 4edb7b6 worktree 补采 r3-before-*（win 预设文字破碎、
  320px 溢出与点按丢失实测）
- [x] init 项目名写入前校验（撞工具包名拒绝且不落文件；维护者实测复核确认）
- [x] 干净目录验收 work/init-check：测试、--check、携带副本套件、浏览器断言 10/10、无绝对路径
- [x] 0.3.0 发行候选：载荷重建校验（仅开发仓库；共享安装保持 0.2.1 不动）
- [ ] OS 级真实失焦（环境限制，监听路径由合成事件覆盖）
- [ ] 真人全程试玩与真人时长（无真人证据，不编造）
- [ ] 第二个非 Codex 宿主试验（待授权与前置条件确认）

## R6 2D 资产循环特别版（2026-09-28，0.4.0）

依据：`../CONTEXT.md` 与 ADR-0001/0004/0005/0006；当前无 CONTEXT-MAP.md。

- [x] AnySearch 调研同类技能/MCP与视觉程序优化方法，正文核验五类来源并记录边界
- [x] 独立技能入口：标杆评估、宪章、独立 builder/critic、两阶段盲比、双批次 WOW、默认无上限
- [x] 按用户要求采用指令级材料约束，不强制操作系统隔离
- [x] 候选哈希、匿名图、封存/揭盲与准出记录校验；开发源套件 165/165
- [x] 同源双载荷、Git 检出字节稳定与 pngjs 携带、可搬移安装回归
- [x] 独立启动/对齐前向测试；只作技能行为验证，不冒充资产 WOW
- [x] 用户授权安装循环版：主存储与 .agents 入口、140 文件一致、安装套件 155 通过/5 跳过
- [x] 原普通技能安装的 131 文件哈希未变；Gauntlet 与用户原图只读
- [ ] 新会话发现验证
- [ ] 完整资产循环的真实视觉准出与收敛能力验证（本轮未启动）
