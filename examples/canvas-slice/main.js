/**
 * examples/canvas-slice/main.js — 模板演示引导（浏览器侧）
 *
 * 接入路径 1（ADR-0004）：启动时烘焙配方 → CanvasBank 缓存 → 运行时 drawImage。
 * 从仓库根目录启动静态服务后打开本页：
 *   node tools/static-server.mjs . 47850  →  http://127.0.0.1:47850/examples/canvas-slice/
 */
import { bakeHumanoid } from '/src/recipes/humanoid.js';
import { bakeMachine } from '/src/recipes/machine.js';
import { bakeTerrain } from '/src/recipes/terrain.js';
import { createCanvasBank } from '/src/adapters/canvas.js';
import ember from '/examples/recipes/ember.mjs';
import turret from '/examples/recipes/turret.mjs';
import ground from '/examples/recipes/ground.mjs';
import { createGame, TICK_MS } from './template/logic/game.js';
import { makeLevel } from './template/logic/collision.js';
import { bindKeyboard, SYSTEM_ACTIONS } from './template/logic/input.js';
import { startLoop } from './template/logic/loop.js';
import { createRenderer } from './template/render/renderer.js';
import { updateHud } from './template/render/hud.js';

const VIEW = { w: 320, h: 180 };

// 1. 启动烘焙（路径 1）：配方 → BakedAsset → CanvasBank
const assets = [bakeHumanoid(ember), bakeMachine(turret), bakeTerrain(ground)];
const bank = createCanvasBank({
  assets,
  makeCanvas: (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  },
});

// 2. 关卡与内容（数据，不含逻辑）
import { DEMO_SEED, DEMO_LEVEL_ROWS, DEMO_PLAYER, DEMO_ENEMIES, PRESETS } from './template/demo-content.js';

const level = makeLevel(DEMO_LEVEL_ROWS);

const frameData = new Map(assets.flatMap((a) => a.frames.map((f) => [f.id, f])));

const game = createGame({
  seed: DEMO_SEED,
  level,
  content: {
    frames: frameData,
    view: VIEW,
    player: DEMO_PLAYER,
    enemies: DEMO_ENEMIES,
  },
});

// 3. 渲染与循环
const cv = document.getElementById('cv');
const display = cv.getContext('2d');
const scene = document.createElement('canvas');
scene.width = VIEW.w;
scene.height = VIEW.h;
const renderer = createRenderer({ ctx: scene.getContext('2d'), bank, level, view: VIEW, night: true });

function render() {
  renderer.draw(game);
  display.imageSmoothingEnabled = false;
  display.drawImage(scene, 0, 0, cv.width, cv.height);
  const s = game.state();
  updateHud(document.getElementById('hud'), s);
  document.getElementById('dbg').textContent = `${s.status}${s.paused ? '/paused' : ''}  tick=${s.tick}  x=${s.player.x}  shield=${s.shield}  enemies=${s.enemies.filter((e) => e.alive).length}  particles=${s.particles.count}`;
}

const keyboard = bindKeyboard(window);

// 可复现的浏览器验收预设：?preset=fight|win|contact 时先按脚本推进再定格渲染
//（不启动 rAF 循环），供截图与状态断言；无预设时正常交互。预设数据见 demo-content.js。
const preset = new URLSearchParams(location.search).get('preset');
if (preset && PRESETS[preset]) {
  for (const input of PRESETS[preset]) game.step(1, input);
  render();
  console.log(`preset=${preset} 定格：`, JSON.stringify(game.state()));
} else {
  startLoop({ game, input: () => {
    const snap = keyboard.snapshot();
    // 暂停中及暂停/恢复/重启当帧丢弃游戏输入（含已缓冲点按），避免恢复后补发；
    // 保留 pause/restart 队列——同帧双击 Esc 的第二次按下不会被误吞。
    if (game.paused || snap.pressed.pause || snap.pressed.restart) {
      keyboard.clear({ except: SYSTEM_ACTIONS });
      for (const key of ['left', 'right', 'up', 'fire', 'jump']) {
        snap[key] = false;
        snap.pressed[key] = false;
      }
    }
    return snap;
  }, render });
}

// 测试与调试接口：可手动逐帧推进、读状态、暂停
window.__game = {
  step: (n, input) => {
    game.step(n, input);
    render();
  },
  state: () => game.state(),
  setPaused: (b) => game.setPaused(b),
  tickMs: TICK_MS,
};
render();
console.log('启动烘焙完成：', bank.frameIds().length, '帧入缓存；__game.step(n, input) 可手动推进');
