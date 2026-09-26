# PGA 轻量 Canvas 网页游戏模板（演示切片）

ADR-0005 的参考实现：最低必要的网页游戏骨架，**不是通用引擎**。
接入路径 1（ADR-0004）：启动时烘焙配方 → CanvasBank 缓存 → 运行时 drawImage，无导出文件。

## 运行

```powershell
cd <工具包根目录>
node tools/static-server.mjs . 47850
# 打开 http://127.0.0.1:47850/examples/canvas-slice/
```

操作：←/→ 移动，↑ 朝上瞄准，J 射击，K/空格 跳跃，Esc 暂停，R 重启。
目标：击毁全部 3 座炮塔（MISSION CLEAR）；被碰到 3 次或坠落则 MISSION FAILED。

可复现的验收预设（定格渲染，不启动循环，供截图与断言）：
`?preset=fight`（战斗中：子弹在途、敌受击白闪、粒子）、
`?preset=win`（MISSION CLEAR）、`?preset=contact`（接触受伤：护盾-1、粒子、无敌帧闪烁）。

## 结构

```
template/logic/    无 DOM 逻辑层（node --test 可全量验证）
  game.js          createGame：step(n, input) / state() / view() / setPaused / reset
  collision.js     字符行关卡 + AABB 分轴解算（前缘解算，出生点勿嵌实心）
  particles.js     种子粒子系统（独立随机源，不污染逻辑序列）
  input.js         键盘 → 输入快照（逻辑只认快照，测试直接注入）
  loop.js          固定步长循环（累加器，最多补 4 tick，无 tick 不重绘）
template/render/   表现层：场景/自发光/HUD 层序，消费 CanvasBank
template/demo-content.js  演示内容数据与验收预设（与机测共用同一份）
main.js            引导：启动烘焙 + 组装游戏 + 循环
```

## 用模板做自己的游戏

1. 写配方（参考 `../recipes/` 与 `docs/recipe-guide.md`），画廊审图。
2. 复制本目录，改 `main.js`：换配方、改 `demo-content.js` 的关卡/敌人/手感参数。
3. 逻辑层加规则只放 `template/logic/`（保持无 DOM 可测）；表现只放 `render/`。
4. 测试：`__game.step(n, input)` 与 `__game.state()` 就是测试接口——
   机测见 `tests/unit/template.test.js` 与 `tests/integration/demo-presets.test.js`。

限制（有意为之）：无音频、无存档、无网络、无关卡编辑器；
子弹撞图块即毁；敌人无 AI（静态靶）；敌人与玩家无物理碰撞（只触发伤害）。
