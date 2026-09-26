# 视觉验收记录 — procedural-game-assets

美术验收以"看实际图像与动画"为准，单元测试通过不能代替审图。每轮记录检查项、证据与结论。

## P2：人形角色闭环（2026-09-26）

检查方式：

- `node bin/pga.mjs bake <recipe> --out work/review --bmp --scale 4` 导出 4 倍 BMP（深色底 `#202028`）。
- `node bin/pga.mjs gallery --dir work/review` + 浏览器截图：4 倍网格、锚点十字、附件点、深/浅/棋盘背景、URL 复现状态。
- 跑步动作同时看连续条 BMP（`clip_run_fwd.bmp`）与画廊逐帧。

### ember（兼容样本）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 轮廓与比例 | 通过：与原版一致（逐像素回归 60 帧哈希相等） | `tests/integration/compat-characters.test.js`；`work/review/ember/p_stand_fwd.bmp` |
| 跑步动作 | 通过：6 帧相位正确、身体起伏自然、枪不漂 | `clip_run_fwd.bmp` 连续条 |
| 趴下/翻滚/倒地/潜水 | 通过：p_prone 枪平指、球形态逐帧旋转 | `p_prone.bmp` 等 |
| 脚底与枪口 | 通过：画廊叠加层锚点在脚底中心，muzzle 红点随姿态移动；数值与原 `muzzleOffset` 公式一致 | 画廊截图（ember 4 倍深色） |
| 诊断 | 原 38×46 帧底边笔刷越界（每帧 3–6px，p_prone 含左缘 23px）以 `clip:'warn'` 显式声明并随帧记录 | `pga validate` 输出 |

### legion / legion-sniper / legion-heavy（兼容样本）

- 26 帧逐像素回归通过。重装兵粗四肢长枪、狙击长枪与原版一致；heavy 底边越界两行（y=46–47）已声明显式裁剪。
- heavy_fire、run 连续条人工看过：体态与枪口正确。

### rustclaw（新角色，本库原创）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 轮廓辨识度 | 通过：矮壮体型 + 风帽 + 全覆式青色目镜带，与 ember（高瘦、红围巾）一眼可区分 | `work/review/rustclaw/stand_fwd.bmp` |
| 比例 | 通过但记下：腿 4+4 极短，跑动接近"重步挪动"——符合拾荒者设定，批量派生前如做敏捷型需改腿长 | 同上 |
| 装备 | 通过：短粗铆钉枪（heavyGun 厚 4）与纤细步枪明显不同；枪口红点不脱离 | 画廊截图（浅色背景） |
| 动作 | 通过：站立 3 向瞄准、跑步 6 帧、下落 2 向、brace 跪姿压制、倒地；脚底锁定成立 | `clip_run_fwd.bmp`、`brace.bmp`、`dead_ground.bmp` |
| 帧约束 | 通过：新配方帧高比脚底多 2px，无裁剪声明（默认 error 策略下烘焙成功）——证明新角色不必继承历史裁剪 | `pga validate` 输出 |
| 深浅背景 | 通过：深色底下描边清晰；浅色底下背包可读 | 画廊棋盘/浅色截图 |
| 已知 1 分项 | 深色底下背包与描边色相接近（都偏暗），1 倍时不够醒目；如需强化再调 `B/b` 色阶 | 本轮接受 |

### 工具验证

- 画廊 URL 状态复现：`?asset&frame&zoom&bg&clip` 刷新后视图一致（棋盘背景截图即由 URL 直接打开）。
- 服务器只绑回环，`..` 路径与非法资产名返回 404；Windows 下 URL 路径不做 OS 规范化（已修一处路由 bug）。
- CLI 覆盖保护：非空且无 `.pga.json` 标记的目录拒绝写入（退出码 4）。

### 本轮修复记录

1. rustclaw `down` 枪长 8→6：fall_down 姿态厚笔刷向下枪口越界 2px（插进地面）——改配方数据，不改核心、不加裁剪声明。
2. BMP 测试索引错位、CLI validate 模板变量笔误、画廊 Windows 路由 bug——均为测试/工具层，核心算法未因验收改动。

## P4：机械、植被、道具、地形（2026-09-26）

检查方式：`pga bake --bmp --scale N` 导出 BMP 人工查看；自动化断言见
`tests/unit/machine.test.js`、`tests/unit/recipes-p4.test.js`（83/83 通过）。

| 资产 | 检查项与结果 | 证据 |
|---|---|---|
| turret-mole（机械） | 通过：基座/平射管/高射管分件可读；损坏态压暗+烧灼+剥落明显；左向镜像锚点随动 | `work/review-p4/turret-mole/*.bmp` |
| tree-broadleaf（植被） | 通过：树冠暗/中/亮分层清晰，斑点不破坏轮廓 | `work/review-p4/tree-broadleaf/` |
| tree-deadpine（植被变体） | 通过：稀疏枯枝、斜干，与阔冠树结构明显不同（非同结构换种子） | `work/review-p4/tree-deadpine/` |
| pod-scatter/laser/missile（道具） | 通过：共享舱体外壳，图标形状各异（弹丸/光条/火箭）；外壳像素一致性有断言 | `work/review-p4/pod-*/` |
| medkit（道具变体） | 通过：不同外壳（白箱红十字），一眼可辨 | `work/review-p4/medkit/` |
| ground-cliff（地形） | 通过：3 块水平相邻填充块无可见接缝（另有色差断言）；草皮顶边跨块连续；顶+左角部组合正确 | `work/review-p4/ground-strip.bmp`、`top_left.bmp` |

修复记录：turret 高射管初版帧高不足（重画角度后越界）→ 按"画不下就放大帧"原则
改帧约束与原点；平射管笔刷端部越界 → 帧宽 16→18。均为配方数据修正，未改核心。

## P5：植入故障诊断演练（2026-09-26）

画廊补齐：变体（原图/镜像/白闪/剪影/灰度）、夜间与日间场景背景、
对比视图（同帧 ID 优先、同位置兜底）、资产元信息（kind/种子/帧数/像素内存/生成器）。
四个植入故障（`examples/faults/`）逐一验证"工具能显示问题，按表能定位修复"：

| 故障 | 工具暴露路径 | 证据 | 修复方向 |
|---|---|---|---|
| A 枪口被裁（gunLen 20 超 38 帧宽） | 裁剪诊断 20 次越界；muzzle=(40,29) 超出 40 宽帧；视觉上枪管在右缘截断 | 画廊截图（fault-clipped-muzzle） | 放大帧或缩短枪长；烘焙默认 error 本应在第一步拦截 |
| B 镜像帧附件点未随镜像 | 附件点红点明显脱离枪管（左向帧红点浮在角色右侧） | 画廊截图（stand_fwd_left） | 用 bake/variants.js flipVariant 联动变换，不手工拼帧 |
| C 敌弹与夜景色太近 | 夜间场景背景 + 对比视图：敌弹暗淡、玩家弹明亮，可读性差距直接可见 | 画廊截图（bullet-enemy-bad vs bullet-player） | 提高明度差 + 换色相；危险物在深背景下单独验收 |
| D 滑步跑动（6 帧全站立腿姿） | 剪辑连续条 6 帧完全重复；与正常跑步条（相位+起伏）对照 | `clip_run.bmp` vs ember `clip_run_fwd.bmp` | 用 runLegs 相位表；跑步必看连续条与播放 |

诊断顺序沿用：轮廓与比例 → 动作和附件 → 色阶与可读性 → 纹理与特效。
原图、修改图与问题描述均已保留在本节及 `examples/faults/` 头部注释；
未用新截图覆盖任何旧基线。

## P6：Canvas 与 Godot 消费（2026-09-26）

| 样例 | 验证 | 结果 |
|---|---|---|
| Canvas 切片（`examples/canvas-slice/`） | 浏览器截图：夜景站立（锚点贴地、枪口附件点红点在枪端）、日景切换；消费公式机测 | 通过。清单/锚点/附件点/毫秒时长均来自导出产物；镜像帧用预翻页 + W-x 点镜像 |
| Godot 工程（`examples/godot/`） | 无头导入检查 13 项（退出码 0）；窗口模式 demo 截图：跑姿贴地面参考线、枪口红点、nearest 无串色 | 通过。**验证版本 Godot 4.6.2-stable**，不宣称全 4.x；编辑器人工预览步骤已写入 README 但未执行（无头与截图已覆盖导入与渲染） |

修复记录：GDScript 三处 `:=` 推断失败与 class_name 全局缓存依赖 → 改 preload
显式类型；MainLoop._process 返回语义（true=退出）修正。

## R2/R4：模板与验收切片（2026-09-26）

| 切片 | 浏览器验证 | 结果 |
|---|---|---|
| 模板演示（canvas-slice，ember + 炮塔 + 夜林） | 初始 + ?preset=fight/win/contact 截图：白闪、粒子、HUD、无敌帧闪烁、MISSION CLEAR、残骸 | 通过（机测 demo-presets 5 项同源） |
| 雪原突击（pga-acceptance，snowowl + scorp + 冻原白天） | 初始 + ?preset=assault/clear/hit 截图：尾炮挂接、琥珀子弹浅背景可读、雪原肃清、接触粒子、护盾格减少 | 通过（机测 work/game.test.mjs 6/6 同源） |

视觉修复：bastion 眉影（目镜读作面甲缝）、验收子弹改琥珀色（浅背景）、
敌人盒与枪口高度差 1px（机测锁定后修内容）。contact 预设玩家不可见属
无敌帧闪烁设计（tick%4==3 隐藏帧），已在文档注明。

## 后续阶段待查

- P3 后：图集导出资产与画廊同源对照。
- P5：深浅背景实际场景可读性、植入故障的诊断演练。
