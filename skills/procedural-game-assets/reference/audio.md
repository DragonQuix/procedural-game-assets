# 音频线参考骨架（audio）

最小可移植骨架，提炼自来源项目的 `src/audio/`。零音频文件：音效与配乐全部由合成器实时生成，曲谱是纯数据、可在无音频环境下测试。

## 1. 总线与引擎骨架

```
AudioContext
  ├─ sfxBus ─┐
  ├─ musicBus ┼─ master ─ 压缩器(DynamicsCompressor) ─ destination
  ├─ ambBus ─┘
  └─ reverb(Convolver) ─ 混响增益 ─ master
```

- **噪声缓冲**：共享一份，用线性同余发生器填充（`seed = (seed*1103515245 + 12345) & 0x7fffffff`），每次运行字节级一致。
- **混响脉冲响应**：同样用 LCG 噪声 × `(1 - t)^decay` 逐声道合成，不加载 IR 文件。
- **解锁**：AudioContext 只能在真实用户手势回调里 resume；未 running 时所有 `play()` 直接返回；记录 pending 曲目，解锁后补播。

## 2. 两个合成原语 + 配方表

```js
// 振荡器音：频率 f0 → f1（指数或线性滑动），增益 attack 后指数衰减；可选混响发送。
tone({ type = 'square', f0, f1 = f0, dur, vol, attack = 0.002, at = 0, bus, rev = 0 })

// 滤波噪声：共享噪声源循环播放，双二阶滤波 q0 → q1 扫频，同样的包络。
hiss({ dur, vol, filter = 'lowpass', q0, q1 = q0, Q = 0.8, attack = 0.002, at = 0, bus, rev })
```

音效 = 一两条 tone/hiss 的组合，表驱动 `SFX[name](engine, opts)`：

| 音效 | 配方 |
|---|---|
| 步枪 | 方波 900→180Hz / 0.07s + 高通噪声 2400Hz / 0.05s |
| 激光 | 锯齿波 1600→260Hz + 正弦 2600→900Hz，混响 0.3 |
| 爆炸 | 低通噪声 2600→70Hz + 正弦 120→32Hz，按时长随 size 缩放 |
| 拾取 | 一串三角波琶音（523/659/784/1047Hz，各错开 55ms） |
| 雷声 | 环境总线：低通噪声 520→60Hz / 2.6s + 正弦 60→28Hz，近/远两档音量 |

纪律：

- **节流合并**：同名音效间隔小于阈值（30–90ms，按音效定）直接丢弃——连射时声音不堆叠爆音。
- **循环环境声**（雨、旋翼）：噪声 + 滤波 +（旋翼加 LFO 调幅），`setLoop(name, level)` 用 `setTargetAtTime` 平滑跟随强度，强度 0 自动淡出。

## 3. 前瞻排程音序器

```js
const LOOKAHEAD = 0.12, TICK_MS = 25;
// setInterval 25ms：
//   落后超过 0.25s（后台标签页回来）→ 直接跳到 currentTime + 0.02，不补排积压音符；
//   while (nextTime < ctx.currentTime + LOOKAHEAD) { playStep(step, nextTime); nextTime += stepDur; step++ }
// 主线程卡顿只影响检查时机，不影响已排程音符的精确度——节奏不走样。
```

音色：

- 脉冲波主旋律：`PeriodicWave` 按占空比生成，`real[k] = 2/(kπ)·sin(kπ·duty)`（0.25 / 0.125 / 0.5 三种味道）。
- 贝斯：三角波 + 半频正弦次低音。
- 铺底：每个和弦音一对 ±9 cents 失谐锯齿波，过低通。
- 鼓组全合成：k=扫频正弦 150→42Hz+噪声点击；s=带通噪声+三角波；h/o=高通噪声短/长；c=高通噪声 1.1s；t=三角波扫频。

## 4. 记谱 DSL + 和弦生成伴奏

```
每小节 16 步（十六分音符），空格分隔：
  音名（C4、F#5）= 起音；'.' = 延续上一个音；'-' = 休止；音名后加 '!' = 重音。
鼓点小节是 16 字符字符串：'k...s...k...s.ss'
段落 = { chords: ['Em','C','G','D'], lead: [...16 步字符串], drums: [...16 字符] }
曲目 = { bpm, gain, order: [段落序列], loopFrom, sections, channels }
```

channels 里只有旋律与鼓点是手写数据，其余由和弦符号生成：

```js
// 贝斯：模式串 R=根音(低八度) O=高八度 F=五度，如 'R . O . R . O . R . O . F . O .'
// 琶音：按和弦音循环，shape = [0,1,2,3,2,1] 控制走向，every 控制密度
// 铺底：每小节一个和弦长音，三音齐发
// compile(song) → 按步索引的事件表 { stepDur, totalSteps, channels[].events[] }
```

**曲谱模块是纯数据 + 纯函数，不 import 任何音频 API**，因此可在 node 里测试：

- 音名/和弦解析（A4=440Hz；非法音名、非法和弦 throw）；
- 每小节必须 16 步；
- 全部曲目可编译、事件表长度一致、频率全部落在 20–5000Hz；
- 每段旋律小节数与和弦数一致、鼓点小节 16 字符。

## 5. 移植映射

| 平台 | 映射 |
|---|---|
| Web Audio | 本骨架原样适用 |
| Unity | `OnAudioFilterRead` 逐采样合成，或用 `AudioClip.Create` 预生成短采样；音序器用 `AudioSettings.dspTime` 前瞻排程 |
| Godot | `AudioStreamGenerator` + `AudioStreamGeneratorPlayback.push_frame`；混响用 `AudioEffectReverb` |
| 其他 | 任何能逐采样/逐事件发声的环境都可；DSL、compile、前瞻调度算法与平台无关，先移植这三样 |
