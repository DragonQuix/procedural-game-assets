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
  hud.js           DOM 文字 HUD（stats/banner），不经过低分辨率画布放大
template/demo-content.js  演示内容数据与验收预设（与机测共用同一份）
main.js            引导：启动烘焙 + 组装游戏 + 循环
```

## 输入契约（input.js + game.js 配套）

- `held` 按物理键跟踪：同动作映射多键（← 与 A）时松开一个不清掉另一个；
  自动重复（按住产生的重复 keydown）不改变状态、不重复入队。
- 点按是离散事件：keydown 边沿入队（每动作上限 8 条，超出丢弃），每次
  `snapshot()` 每动作消费一条；`snap.pressed[k]` 表示本次消费到一条。
  连续两次点按暂停键 = 两个 pressed 事件，不会被布尔 true/true 吞并。
- `game.step(n, input)`：input 带 pressed 字段时暂停/重启按离散事件消费
  （每次 step 调用只在首 tick 应用一次）；不带时退回布尔边沿（旧注入快照兼容）。
- `clear()` 清空按住与队列（blur、页面隐藏、unbind 自动触发）；被清掉的键
  即使仍物理按住也不恢复，直到重新按下（防粘键）。
- `main.js` 循环在暂停中及暂停/恢复/重启当帧 `clear({ except: ['pause','restart'] })`
  并把快照游戏键清零：暂停期间的射击/移动不会在恢复后补发，暂停/重启键自身的
  点按队列保留（同帧双击 Esc = 暂停后恢复，两个事件都算数）。

## 文字方案

场景画布是 320×180 低分辨率再放大，画布内 `fillText` 小字会破碎（结构性问题）。
文字走 DOM HUD：横幅（暂停/胜利/失败）与右上 stats 保持 CSS 像素尺寸，支持中文；
画布内只留护盾格等图形元素。需要画布内文字的项目可自备位图字体模块
（整数坐标 fillRect 逐像素绘制；本模板不内置，验收仍以实际截图为准）。

## 用模板做自己的游戏

0. 干净目录起步（推荐）：`node <工具包>/tools/init-project.mjs <目录> --name <游戏名>`
   会把工具包携带到 `vendor/pga/`（含哈希复核）、建立项目身份、把本模板复制为
   `game/` 并改写好 import——下面 1–4 步在 `game/` 上进行。
1. 写配方（参考 `../recipes/` 与 `docs/recipe-guide.md`），画廊审图。
2. 复制本目录，改 `main.js`：换配方、改 `demo-content.js` 的关卡/敌人/手感参数。
3. 逻辑层加规则只放 `template/logic/`（保持无 DOM 可测）；表现只放 `render/`。
4. 测试：`__game.step(n, input)` 与 `__game.state()` 就是测试接口——
   机测见 `tests/unit/template.test.js` 与 `tests/integration/demo-presets.test.js`。

限制（有意为之）：无音频、无存档、无网络、无关卡编辑器；
子弹撞图块即毁；敌人无 AI（静态靶）；敌人与玩家无物理碰撞（只触发伤害）。
