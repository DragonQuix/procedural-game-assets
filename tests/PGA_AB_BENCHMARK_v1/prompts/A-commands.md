# A组命令速查

在本次独立目录运行，Node版本遵循项目package.json（本包在Node 22.16.0上验证）。

```bash
node run.mjs render
node run.mjs submit
```

`render` 从 `candidate.mjs` 的 `build(api)` 构建BakedAsset，结果写入 `previews/state-001/`、后续编号递增。打开其中 `*.native.png`、`*.dark.png`、`*.light.png` 或 `viewer.html`。它只渲染，不为你修图或自动择优。

`submit` 写出一次性 `final/`，包含源文件、RGBA、PNG、元数据和viewer。已存在final时拒绝覆盖；不要在任务中途submit。需要比较不同代码版本，使用普通文件备份，分别渲染，完整计数。

`api` 提供现有PixelPainter、packColor、Rng、partSeed、assembleFrame、assembleAsset、bakeHumanoid、PNG编解码等。源码可在toolkit中查阅。初始代码已具备完整烘焙路径，不要求安装依赖或搭建工程。
