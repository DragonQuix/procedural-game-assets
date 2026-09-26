# 工具包 API 速查

完整注释在各模块头部；坐标与清单的长期约定见 `docs/adr/`。
核心零 DOM/FS/网络依赖，可在 `node --test` 全量验证。

## 模块地图

```
src/core/      raster（绘制原语+裁剪诊断）、color、ascii、transform（像素与点变换）、rng、hash
src/geometry/  humanoid.js：solvePose 姿态求解（纯几何）
src/bake/      frame（描边/锚点平移/包围盒）、asset（校验）、variants（镜像/损坏/放大）
src/recipes/   humanoid / machine / vegetation / prop / terrain 五类配方
src/export/    png（pngjs 封装）、atlas（稳定打包）、manifest（版本化清单+校验）、bmp
bin/pga.mjs    validate / bake / export / gallery
```

## 常用调用

```js
import { bakeHumanoid } from './src/recipes/humanoid.js';
import { packAtlas, renderAtlasPages } from './src/export/atlas.js';
import { buildManifest, validateManifest } from './src/export/manifest.js';
import { encodePNG } from './src/export/png.js';

const asset = bakeHumanoid(spec);                    // spec 见 recipes 头注
const packed = packAtlas(asset.frames, { maxPage: 1024, margin: 2 });
const pages = renderAtlasPages(packed, new Map(asset.frames.map(f => [f.id, f])));
const manifest = buildManifest(asset, packed, { generator: 'your-tool@x.y' });
validateManifest(manifest);                          // [] 为合法
```

## 坐标（ADR-0002 摘要）

- 像素边界坐标：左上 `(0,0)`，y 向下，像素中心 `(i+0.5, j+0.5)`。
- 锚点=脚底中心（角色），附件点同坐标系；相对偏移 `attachment - anchor`。
- 镜像：点 `W-x`，像素 `W-1-i`；顺时针 90°：点 `(H-y,x)`，尺寸变 `(H,W)`。
- ASCII marker 是像素中心（索引+0.5）；脚底等边界位置用显式 anchor。

## 清单（ADR-0003 摘要）

`schemaVersion=1`；帧含 `rect`（图集矩形）与 `source`（未裁剪源尺寸）、
`anchor`、`attachments`；`clips` 毫秒时长；`hints: { filter:'nearest', mipmap:false, timeUnit:'ms' }`。
无时间戳、无绝对路径；schema 不兼容时 `validateManifest` 直接报错。
