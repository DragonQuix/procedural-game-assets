# PGA Canvas 消费切片

纯浏览器消费示例：**只读离线导出产物**（manifest + 图集 PNG），不碰烘焙器。

```powershell
# 1. 导出资产
node bin/pga.mjs export examples/recipes/ember.mjs --out examples/canvas-slice/assets
# 2. 启动静态服务
node tools/static-server.mjs examples/canvas-slice 47850
# 3. 打开 http://127.0.0.1:47850/
```

检查清单（方案 §7 P6）：移动（←/→）、一个动作切换（↑朝上瞄准）、
一种交互（J 射击：子弹从枪口附件点出膛）、日夜背景对照（B 切换）。

消费契约：

- 绘制位置 = 世界坐标 `- anchor`（锚点对齐脚底）；
- 附件点世界坐标 = `pos + facing × (attachment - anchor)`；
- 镜像帧 = 预翻页 + 锚点点镜像 `W-x`（ADR-0002）；
- 剪辑按清单毫秒时长播放；`schemaVersion` 不兼容即抛错。

`assets/` 为派生产物（git 忽略）。机器可验证部分见
`tests/integration/consumer-contract.test.js`。
