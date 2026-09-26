# Godot 消费参考

示例工程在 `assets/toolkit/examples/godot/`（已验证 Godot 4.6.2-stable）。
要点摘录，细节见其 README.md：

1. **只消费产物**：`PGAManifest` Resource 读 manifest JSON + 图集 PNG，
   `schemaVersion` 不兼容即报错；不在 Godot 里重写生成器。
2. **显式帧播放器**（`@tool PGASprite`）：`Sprite2D` + `AtlasTexture`，
   `offset = -anchor`、`centered = false`；附件点局部坐标 = `attachment - anchor`；
   剪辑毫秒时长在 `_process` 推进；编辑器内只显示静态帧。
3. **采样**：工程 `default_texture_filter=0`（nearest），节点固定 nearest，
   图集不带 mipmap。导入后纹理区域不应串色。
4. **验证**：`godot --headless --path examples/godot --script res://tools/import_check.gd`
   退出码 0 = 通过；`tools/capture.gd` 出 demo 截图人工核对。
5. 换 `AnimatedSprite2D` 前，先统一 clip 画布或显式处理每帧偏移。
