# PGA Godot 消费示例

消费离线导出产物（manifest JSON + 图集 PNG），**不重写生成器**。

已验证版本：**Godot 4.6.2-stable (official.71f334935)**，Windows，Forward+（RTX 4090）。
不宣称覆盖全部 4.x；其他版本请重跑下文检查。

## 准备与验证

```powershell
# 1. 从工具包导出资产（生成 assets/ember.manifest.json 与 ember.page0.png）
node bin/pga.mjs export examples/recipes/ember.mjs --out examples/godot/assets

# 2. 无头导入检查（清单、图集、帧矩形、锚点、附件点、剪辑时长、幂等加载）
godot --headless --path examples/godot --script res://tools/import_check.gd

# 3. 演示场景截图（窗口模式，约 1 秒后自动退出）
godot --path examples/godot --script res://tools/capture.gd

# 4. 人工编辑器预览：用 Godot 打开 examples/godot，运行主场景（F5）
```

## 结构

- `addons/pga/pga_manifest.gd`（`PGAManifest` Resource）：加载清单与图集；
  `schemaVersion` 不兼容即报错不猜测；`manifest_path` 变更触发 `changed`。
- `addons/pga/pga_sprite.gd`（`@tool PGASprite` Node2D）：`Sprite2D` + `AtlasTexture`
  显式帧播放器。锚点实现为 `sprite.offset = -anchor`（`centered = false`）；
  附件点局部坐标 = `attachment - anchor`（`current_attachment_local()`）；
  剪辑毫秒时长在 `_process` 显式推进；编辑器内只显示静态选择帧，不推进动画；
  setter 经延迟合并刷新，节点未 ready 由 `_ready` 补刷。
- `scenes/demo.tscn`：跑动示例 + 枪口附件点标记 + 地面参考线。
- `tools/import_check.gd`：无头检查（退出码 0/1）。
- `tools/capture.gd`：演示截图。

## 约定与限制

- 采样：工程设 `default_texture_filter=0`（nearest）；`PGASprite` 固定 nearest；
  图集 PNG 不带 mipmap。不要用边距掩盖错误的采样设置。
- 幂等：消费为运行时加载，不在磁盘生成第二套资源；重复加载帧数一致（有检查）。
- 首版用 `Sprite2D` 而非 `AnimatedSprite2D`：帧画布尺寸一致（ember 全帧 40×48），
  但首版刻意用显式播放器避免对齐假设（方案 §7 P6）；换 AnimatedSprite2D 前
  须先统一 clip 画布或显式处理每帧偏移。
- `assets/` 为派生产物（git 忽略），由上述 export 命令生成。
