# PGA A/D 对照实验素材包 v1.1
> **维护更新：** v1.1 已对最新修复快照验证通过技术预检；只适配 crash-retry 的两个故障阶段，不改实验素材或评分。先读 `LATEST_REVIEW_AND_NEXT_STEPS_CN.md` 和 `MAINTENANCE_V1_1_CN.md`，下一步给协调会话的提示词在 `NEXT_COORDINATOR_PROMPT_CN.md`。必须在自己的实际环境重跑，不能用附带报告冒充本机结果。

**本包是实验任务、源素材、执行提示词与验收工具，不是项目修复补丁，也不是已经跑出的模型成绩。**
对象是：同一个视觉agent直接改代码（A），对比使用Studio语义编辑与有限探索（D）。

## 1. 先拿哪个文件给谁
| 材料 | 用途 | 给谁 |
|---|---|---|
| 本完整master包 | 设计、准备、验证、私有机械控制样本 | 主持人/开发者；不要给参试agent |
| `prepare.mjs`输出的一个trial目录 | 单任务、单组的独立可运行材料 | 对应执行agent |
| `blind.mjs`输出的`reviewer/` | 匿名X/Y图像、任务、盲评提示词 | 独立视觉评审 |
| `key.json` | X/Y与组别的映射 | 只归主持人 |

只是把controls藏在同目录深处，不算盲测隔离。运行会话只挂载trial目录；不能访问master和其他组。把整个项目和master交给协调agent可以，但这个协调会话不再参试。

## 2. 已做好的素材
T01 局部焦点：终端主屏幕与过亮侧板。  
T02 轮廓比例：细长设备改成重装设备，镜头/徽标/底座保护。  
T03 材质层级：夹口金属体积，手柄退后，铆钉保护。  
T04 功能图标：占位徽标改成无文字医疗用品识别标记。  
T05 结构重组：五个既有零件重组成便携救援信标，不增加节点。  
T06 跨帧一致：待机+六帧跑动，恢复暖琥珀目镜，保护全部非目镜像素与元数据。

每项有TASK.md、task.json、原生PNG、深浅背景4倍PNG、RGBA/元数据、允许修改遮罩、A低层源码与D结构化文档。起点均已验证两组RGBA和关键元数据一致。共12个原生帧。T01–T05为新组合素材；T06由上传角色配方衍生，排除了未覆盖的非rig姿态。

`public/STARTING_ASSETS.png`是总览。没有唯一“正确目标图”。`organizer/controls`只是测试脚本的机械合法样本，不是美术标杆或评分答案。

## 3. 准备环境
需要完整项目源码和其已安装的pngjs；运行环境遵循项目package.json。本包实际在Node v22.16.0上测试。prepare会复制所需toolkit与pngjs到独立trial；若项目根未装依赖，会尝试使用原项目发行载荷自带pngjs。不联网安装、不改用户级配置。

以下命令从本包根目录运行；把示例绝对路径换成自己的路径。输出用新空目录。所有source代码应在受信、隔离环境中执行；脚本不是恶意代码沙箱。

## 4. 先预检，再计分
```bash
node organizer/preflight.mjs --repo "/path/to/project" --out "/path/to/preflight" --run-tests
node organizer/self-test.mjs --repo "/path/to/project" --out "/path/to/selftest"
```

preflight：
- 核对六项A/D起点一致且匹配本包冻结图像；
- 运行来自独立审查的9个行为探针（原8类问题，其中两种探索操作单独测试）；
- 运行项目全部.test.js；
- 输出readiness.json。只有READY_TECHNICAL允许prepare的scored模式。

历史v1基于未修复的0.6.0快照得到NOT_READY；旧结果保留在evidence中，不代表最新修复版。
新上传快照根版本仍是0.6.0，但源码指纹已经不同。v1.1在该修复快照上得到READY_TECHNICAL：339项项目测试、9项行为探针（含两个crash-retry子场景）均通过。以源码指纹而非根版本号区分；核验边界见维护说明。

探针对旧接口有明确依赖；如果新版本更改API或私有故障注入钩子，返回UNVERIFIED，需要有记录地适配等价断言，不得伪造PASS。READY_TECHNICAL仅覆盖这些技术检查，不代表视觉或完整可靠性已证明。

self-test：
- 创建12个机械控制trial，走A/D实际提交及独立验收；
- 核对6个合法输出对齐；
- 检出原样交付、保护区外修改、纯元数据修改、提交内容篡改；
- 测试匿名导出。
本次23项通过。不调用模型、不评美术。准备期见到这些控制样本的agent不能参加正式实验。

## 5. 先跑4次流程演练
```bash
node organizer/prepare.mjs --repo "/path/to/project" --task T01 --arm A --repeat 1 --mode smoke --out "/path/to/runs/T01-A-smoke"
node organizer/prepare.mjs --repo "/path/to/project" --task T01 --arm D --repeat 1 --mode smoke --out "/path/to/runs/T01-D-smoke"
```
同样给T02准备两组。每个trial有自己的PROMPT.md、HOW_TO.md、input、toolkit、run.mjs。A的toolkit不包含Studio服务，D包含Studio。两组保留相同底层核心与中性查看/导出包装。
在独立会话中只给出对应trial，复制PROMPT.md。执行agent使用：
```bash
node run.mjs render
node run.mjs submit
```
D组的编辑通过：
```bash
node run.mjs studio state
node run.mjs studio inspect
```
其他真实调用格式见各自HOW_TO.md。D工作区已初始化为r1。不要强制探索、不要把起点再算一次付费候选，不要用无法打开的路径冒充看图。

## 6. 正式计分
先填协议中的preregistration副本，确认相同模型/配置/宿主/预算和真实图像能力，再运行：
```bash
node organizer/prepare.mjs --repo "/path/to/project" --task T01 --arm A --repeat 1 --mode scored --readiness "/path/to/preflight/readiness.json" --out "/path/to/runs/T01-A-r1"
```
D组同理。按protocol/pair-order.json完成6任务×2组×3次重复=36次运行。上限每次12个已渲染不同候选状态；token/费用/时间上限由用户事先设定，两组相同。所有未知统计留空。
本试点不保证统计功效，也不覆盖任意风格或资产类型。三次重复主要观察不稳定性，而不是制造“显著”。

## 7. 回收、独立验收、匿名盲评
保留整个trial目录、宿主工具/模型原始轨迹，不只回收最佳PNG。
```bash
node organizer/evaluate.mjs --repo "/path/to/project" --run "/path/to/runs/T01-A-r1" --out "/path/to/eval/T01-A-r1"
node organizer/evaluate.mjs --repo "/path/to/project" --run "/path/to/runs/T01-D-r1" --out "/path/to/eval/T01-D-r1"
node organizer/blind.mjs --repo "/path/to/project" --left "/path/to/runs/T01-A-r1" --right "/path/to/runs/T01-D-r1" --out "/path/to/reviews/T01-r1"
```
evaluate从源重新渲染，核对实际提交、确定性、保护像素、alpha、尺寸、锚点、全部附件点、剪辑及必要变化。输出technical.json和真实差异图。它故意把visualStatus/protocolAdherence/budgetStatus留为UNVERIFIED，须独立盲评和宿主核查。
blind输出reviewer与key.json。只给评审reviewer，复制其PROMPT.md。建议2位新会话独立评审，保留分歧。T06打开自含compare.html实际播放；无法播放则运动项UNVERIFIED。

## 8. 怎么读结果
主指标是完整任务成功，不是代码测试数：技术＋工具/预算合规＋视觉目标通过。失败、工具受阻、超预算、未验证、基础设施故障均保留。
同时记录视觉偏好、越界误改、候选数、实际调用/费用/用时及失败类型；按任务展开，再看配对差异。模板内知识与接口同时变化，所以不能把收益全归因于接口抽象，后续B/C消融另做。
不要用controls的像素相似度、颜色数量、细节密度或“更像参考”来判美术高低。当前没有商业品质标杆，所以不宣称“已商业级”。

## 9. 不要做的事
- 不要在A和D之间复用会话上下文。
- 不要把master、controls、映射表或另一组成绩给执行者。
- 不要在计分中现场修工具、绕过约束、改任务或删除失败；要修就开新版本批次。
- 不要把12个候选预算改成12个shell命令，也不要把一个explore的多个候选只算一次。
- 不要以生成HTML代替已看动画，不要以路径返回代替模型已看图。
- 不要将本包覆盖到项目源码或现有技能目录。它是外部测试包。

## 10. 冻结与来源
SHA256SUMS.json记录本包文件哈希。material-build.json记录用于生成素材的源码指纹。不得在正式批次中修改冻结图。
`organizer/build-materials.mjs`是主持人维护工具：只有准备新版本实验时才有意运行它，不能拿它自动覆盖与新渲染器不匹配的旧基线而继续混算。
新增脚本与静态几何为本次实验制作；部分公共色阶和T06配方来自用户上传项目，遵守其provenance与原有声明。图片不含外部品牌、人物或网络参考。字体只用于已栅格化总览，没有打包字体文件。

先把 `prompts/organizer.md` 发给新的协调agent；不要让它继续扮演参试制作者。
