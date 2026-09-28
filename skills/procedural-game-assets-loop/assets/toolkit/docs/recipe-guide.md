# 配方指南 — 四类资产模板的参数、范围与边界

每类配方给出：参数含义、有效范围、推荐起点、已知不适用情况。术语见 `../CONTEXT.md`，坐标约定见 `../docs/adr/0002-coordinate-contract.md`。

通用规则：

- 所有配方只接收显式参数与种子；同配方同种子同输出。
- 帧尺寸是显式约束：内容越界默认抛 `RasterClipError`；有意裁剪必须写 `clip: 'warn' | 'allow'` 并在注释里说明理由。
- 调色板修改一处作用于全部帧；先定轮廓与比例，再调纹理细节。

## humanoid（人形角色）— `src/recipes/humanoid.js`

| 参数 | 含义 | 有效范围/建议 |
|---|---|---|
| `frame` | `{ w, h, feetY, bodyX }` 帧约束 | `h` 建议比 `feetY` 多 2px（粗笔刷余量）；`bodyX` 留足左侧枪托空间 |
| `rig.thigh/shin` | 大腿/小腿长（px） | 4–9；总长决定腿的比例 |
| `rig.thick` | 四肢线粗 | 2–4；3 标准，4 重装 |
| `rig.guns` | 各瞄准方向 `{ grip, dir, back, len }` | dir 单位向量；len 太长会插进地面或越界，烘焙会报错 |
| `art.head/torso` | ASCII 像素图 | 头 7–9 宽、躯干 9–13 宽；识别特征（围巾/目镜）放高对比色 |
| `poses` | `rig/prone/dead/dive/ball` | 特殊动作用独立 kind；球形态锚点用 `ballCenterY` |

推荐起点：复制 `examples/recipes/rustclaw.mjs` 改调色板与 `art`。
不适用：非双足体型（四足、漂浮体）——骨架只有两条腿；需要新配方。

## machine（机械）— `src/recipes/machine.js`

| 参数 | 含义 | 有效范围/建议 |
|---|---|---|
| `parts[].draw` | `(painter, { palette, rng, direction, state })` 绘制函数 | 可信 JS；用几何原语按语义部件画（机身/座舱/标识） |
| `parts[].directions` | 方向变体 | `'right'/'left'`（镜像）；任意角度在 draw 里按参数重画，不要旋转像素 |
| `parts[].states` | 状态变体 | `'intact'/'damaged'`；damaged 为共享后处理（压暗+烧灼+剥落，种子确定） |
| `attachments` | 命名关键点（炮管安装点、舱门） | 帧内像素边界坐标，镜像/损坏后随动 |

推荐起点：复制 `examples/recipes/turret.mjs`，机身一件 + 每向炮管一件。
不适用：需要平滑任意角度旋转的部件——首版只有镜像与 90° 旋转像素变换。

## vegetation（植被）— `src/recipes/vegetation.js`

| 参数 | 含义 | 有效范围/建议 |
|---|---|---|
| `trunk` | `{ x, yBottom, width, height, lean }` | lean 为全高总偏移 px，|lean| ≤ height/4 较自然 |
| `canopy` | 树冠团 `{ cx, cy, rx, ry, tone, jitter }` | tone 0 暗(后)→2 亮(前)；结构由数据决定，jitter 建议 ≤1 |
| `speckle` | 叶面高光 `{ density, color }` | density 0.05–0.15；只落在已有叶面上 |
| `seed` | 细节种子 | 换种子只变斑点与 jitter 内位置；要不同结构请改 canopy |

推荐起点：复制 `examples/recipes/trees.mjs`。
不适用：风摆动画（首版静态帧）；藤蔓等悬挂结构需自画 draw——用 machine 的函数配方代替。

## prop（道具）— `src/recipes/prop.js`

| 参数 | 含义 | 有效范围/建议 |
|---|---|---|
| `shell` | 外壳（ASCII 或绘制函数） | 共享外壳保证一族道具统一感 |
| `icon` + `iconBox` | 图标与放置区 | 图标形状必须因种类而异（不只用颜色区分）；iconBox 居中放置 |
| `frame` | 帧约束 | 小件 8–16px |

推荐起点：复制 `examples/recipes/supply.mjs`，加新图标行。
不适用：大型载具（用 machine）；需要动画的道具（首版单帧，可自加 clips 数据）。

## terrain（地形）— `src/recipes/terrain.js`

| 参数 | 含义 | 有效范围/建议 |
|---|---|---|
| `tile.size` | 正方形块边长 | 8/16/32；与世界网格一致 |
| `bake[].worldX/worldY` | 块左上角的世界像素坐标 | **接缝连续性的关键**：相邻块坐标必须连续 |
| `bake[].edge` | `'top'` 顶边地表；`'left'/'right'/'bottom'` 裸露侧边 | 角部传数组 `['top','left']` |
| `palette.fill` | 填充色族 | 明度相近（色差小），防噪点跳跃 |
| `noise` | 亮/暗噪点密度 | ≤0.15；过花就降 |

推荐起点：复制 `examples/recipes/ground.mjs`。
不适用：斜坡与圆角块（只有直边）；自动邻接推断（v1 由 bake 列表显式声明边）。
