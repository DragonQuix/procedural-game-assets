# ADR-0001：平台解耦——核心无 DOM，IO 全部在适配层

日期：2026-09-26。状态：已接受。

## 背景

来源项目 `others_003` 的 `PixelPainter` 直接 `import { makeCanvas } from './renderer.js'`，`SpriteBank.add()` 在烘焙时立即产出四份 Canvas 对象（原图、镜像、白闪、镜像白闪）。这使得烘焙无法在 Node 中运行、无法做无浏览器测试，也无法离线导出 PNG。

## 决定

- `src/core/` 不访问 DOM、文件系统、网络和时钟；不 import 任何平台模块。
- 烘焙输出普通数据（`Uint8ClampedArray` RGBA + 元数据），不创建 Canvas。
- Canvas 输出、PNG 编码、文件 IO、Godot 导入均放在 `export/`、`adapters/` 边界层。
- 变体（镜像、白闪）按需生成，不在入库时无条件预生成四份。

## 后果

- 核心可在 `node --test` 下完整验证；画廊与导出共享同一烘焙实现。
- 原项目的 `toCanvas()` 能力由适配层重建，逐像素一致由基线回归测试保证（见 `docs/provenance.md` 的基线）。
- 首版不为"零依赖"自实现 PNG 编码器；PNG 库属于 IO 边界，可锁版本引入。

## 备选方案（已否决）

- 在 Node 中用 Canvas polyfill 继续直接跑原 `SpriteBank`：把平台依赖藏进测试环境，违背解耦目标，且无法产出离线数据格式。
