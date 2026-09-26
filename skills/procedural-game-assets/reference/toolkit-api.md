# 工具包 API 速查

完整注释在各模块头部；坐标与清单的长期约定见 `docs/adr/`。
核心零 DOM/FS/网络依赖，可在 `node --test` 全量验证。

## 模块地图

```
src/core/      raster（绘制原语+裁剪诊断）、color、ascii、transform（像素与点变换）、rng、hash
src/geometry/  humanoid.js：solvePose 姿态求解（纯几何）
src/bake/      frame（描边/锚点平移/包围盒）、asset（校验）、variants（镜像/损坏/放大）
src/recipes/   humanoid / machine / vegetation / prop / terrain 五类配方
src/adapters/  canvas.js：CanvasBank 启动烘焙缓存（路径 1，注入式 Canvas 工厂）
src/export/    png（pngjs 封装）、atlas（稳定打包）、manifest（版本化清单+校验）、bmp
bin/pga.mjs    validate / bake / export / gallery
examples/canvas-slice/  轻量 Canvas 网页游戏模板（template/logic 无 DOM + render + demo-content）
```

## 启动烘焙（路径 1，ADR-0004）

```js
import { bakeHumanoid } from './src/recipes/humanoid.js';
import { createCanvasBank, clipFrameAt, attachmentWorld } from './src/adapters/canvas.js';

const bank = createCanvasBank({
  assets: [bakeHumanoid(spec)],
  makeCanvas: (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; },
});
const s = bank.sprite('stand_fwd', 'flip'); // 'orig'|'flip'|'flash'|'flashFlip'，按需缓存
ctx.drawImage(s.canvas, x - s.anchor.x, y - s.anchor.y);
clipFrameAt(bank.clips.run_fwd, nowMs);     // 剪辑毫秒时长取帧
attachmentWorld(frame, 'muzzle', pos, facing); // 附件点世界坐标
```

## 模板逻辑接口（ADR-0005）

```js
import { createGame } from './template/logic/game.js';
const game = createGame({ seed, level, content });
game.step(n, { right: true, fire: true }); // 逐 tick 推进
game.state();                              // 可 JSON 断言快照
game.setPaused(true); game.reset();
```

## 键盘输入绑定（template/logic/input.js）

```js
import { bindKeyboard, SYSTEM_ACTIONS } from './template/logic/input.js';
const kb = bindKeyboard(window);           // 测试可传 EventTarget
const snap = kb.snapshot();                // 每 tick 取一次
// snap.left / fire / ...：held 或有未消费点按
// snap.pressed.fire / ...：本次快照消费到一条点按（离散事件）
kb.clear();                                // 清空全部按住与点按队列（blur/隐藏/unbind 自动走这里）
kb.clear({ except: SYSTEM_ACTIONS });      // 只清游戏动作，保留暂停/重启队列
kb.unbind();                               // 移除全部监听并清空
```

契约要点：点按按动作入队（每动作上限 8），每次 snapshot 每动作消费一条——
连续两次点按暂停键会产生两个 pressed 事件，不会被布尔快照的 true/true 吞并；
暂停/重启在 game.step 里按 pressed 离散消费（每次 step 调用只在首 tick 应用一次），
无 pressed 字段的旧布尔快照保持边沿语义。clear 后被清掉的键需重新按下才生效（防粘键）。
DOM 文字 HUD（template/render/hud.js）替代画布内小字：`updateHud(root, state)`。

## 离线导出（路径 2，可选部署）

```js
import { packAtlas, renderAtlasPages } from './src/export/atlas.js';
import { buildManifest, validateManifest } from './src/export/manifest.js';
import { encodePNG } from './src/export/png.js';
// 与路径 1 同源：packAtlas(bank 同款 asset.frames)；往返切回帧逐像素一致
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
