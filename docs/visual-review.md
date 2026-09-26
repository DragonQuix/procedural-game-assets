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

## 后续阶段待查

- P3 后：图集导出资产与画廊同源对照。
- P5：深浅背景实际场景可读性、植入故障的诊断演练。
