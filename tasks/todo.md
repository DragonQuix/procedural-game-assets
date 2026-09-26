# 任务清单 — procedural-game-assets

依据：`E:/Repos/Games/ForOthers/others_003/docs/PROCEDURAL-ASSETS-IMPLEMENTATION-PLAN.md`（下称"方案"）。
术语与边界：`../CONTEXT.md`；长期决策：`../docs/adr/`。

## P0 基线与契约

- [x] 检查目标路径与 Git 状态；建立新仓库（2026-09-26，原项目 `bd1cf1a` 工作区干净，目标路径不存在）
- [x] 记录来源提交与抽取文件：`docs/provenance.md`
- [x] 建立 `CONTEXT.md`（术语与边界）
- [x] ADR：平台解耦（0001）、坐标契约（0002）、离线清单（0003）
- [x] 授权与来源检查：记入 `docs/provenance.md`
- [x] 采集 111 精灵基线（RGBA、尺寸、锚点、名称）→ `tests/fixtures/baseline/`
- [x] P0 提交（cfac45e）

## P1 像素核心（方案 §7 P1）

- [x] `core/raster.js`：绘制原语 + clip 诊断（error/warn/allow）+ 输入校验 + floor 取整
- [x] `core/color.js`、`core/ascii.js`、`core/transform.js`、`core/rng.js`、`core/hash.js`、`core/diagnostics.js`
- [x] 单元测试 35 项：栅格、变换（镜像/旋转/锚点附件点联动）、ASCII、确定性（2026-09-26 全过）
- [x] P1 提交

## P2 角色闭环（方案 §7 P2）

- [x] `solvePose` / `drawPose` 分离，显式帧约束（`geometry/humanoid.js`、`recipes/humanoid.js`）
- [x] 人形配方 + 原角色兼容样本（ember 34 帧、legion 族 26 帧，60 帧逐像素回归通过）
- [x] 新角色 rustclaw（矮壮、风帽目镜、铆钉枪；站立/跑/瞄准/下落/brace，无需修改核心）
- [x] 最低画廊（1/2/4/8 倍、网格、深浅/棋盘背景、锚点/附件点/包围盒、剪辑播放、URL 复现）
- [x] CLI：validate / bake（含覆盖保护与 BMP 导出）/ gallery（回环服务器）
- [x] 视觉验收记录：`docs/visual-review.md`（看实际 BMP 与浏览器截图，非单测代替）
- [x] node --test 59/59 通过（2026-09-26）
- [x] P2 提交

## 发现（供后续阶段参考）

- 原 38×46 角色帧底边系统性越界（腿部笔刷 1–3px/帧，p_prone 左缘 23px，heavy 两行）：
  兼容样本以 `clip:'warn'` 显式声明并逐帧记录；新配方帧高留 2px 余量即可在 error 策略下通过。
- legion 族（普通/狙击/重装）证明"换数据不换核心"可派生体型差异；rustclaw 进一步验证全新配方。

## P3 图集与清单（方案 §7 P3）

- [x] `export/png.js`：pngjs@7.0.0（MIT）薄封装，版本锁定并记入 `docs/provenance.md`
- [x] `export/atlas.js`：稳定排序货架打包（不旋转、不裁边、透明边距、多页）
- [x] `export/manifest.js`：schemaVersion=1 版本化清单 + 导入校验（不兼容即失败）
- [x] CLI `export`：图集 PNG + 清单落盘；与画廊共享同一烘焙实现
- [x] 往返测试：图集按清单切回帧与烘焙逐像素一致（ember/rustclaw 全帧）
- [x] CLI 测试：中文/空格路径、覆盖保护（退出码 4）、重复导出字节一致
- [x] node --test 72/72 通过（2026-09-26）
- [x] P3 提交

## P4 配方扩展（方案 §7 P4）

- [x] 机械（machine）：分件 + 正常/损坏状态 + 方向变体（turret-mole，12 帧）
- [x] 植被（vegetation）：轮廓/树冠分组先行，种子只改受控细节（broadleaf + deadpine 两种结构）
- [x] 道具（prop）：共享外壳 + 形状各异图标（scatter/laser/missile）+ 换壳变体（medkit）
- [x] 地形（terrain）：世界坐标纹理、顶边、裸露侧边、角部组合；跨块接缝断言 + 人工审图
- [x] 模板文档：`docs/recipe-guide.md`（参数含义、有效范围、推荐起点、不适用情况）
- [x] node --test 83/83 通过（2026-09-26）；P4 审图记录见 `docs/visual-review.md`
- [x] P4 提交

## P5 视觉工作台（方案 §7 P5）

- [x] 画廊补全：变体（镜像/白闪/剪影/灰度）、夜间/日间场景背景、对比视图、资产元信息
- [x] 植入故障资产 ×4：被裁枪口、错误镜像附件点、低对比敌弹、滑步跑动
- [x] 诊断演练：四故障均被工具暴露并记录修复方向（`docs/visual-review.md`）
- [x] P5 提交

## P6 消费与集成（方案 §7 P6）

- [x] Canvas 切片：移动、动作切换、射击交互（枪口附件点）、日夜对照；只消费导出产物
- [x] 消费契约集成测试（`tests/integration/consumer-contract.test.js`）：枪口点落枪端像素、锚点贴脚底、镜像 W-x 连续、剪辑时长
- [x] Godot 4 工程：PGAManifest Resource + @tool PGASprite 显式帧播放器 + demo 场景
- [x] 无头导入检查通过（Godot 4.6.2-stable，退出码 0）；demo 截图人工确认
- [x] node --test 87/87 通过（2026-09-26）
- [x] P6 提交

## P7 技能封装（方案 §7 P7）

- [ ] 升级现有技能、发行打包、安装脚本与回滚

## P8 复用与发布验收（方案 §7 P8）

- [ ] 干净目录操作验收（无独立 Agent 授权时由实施者完成，不冒充）
- [ ] 验收记录与版本归档
