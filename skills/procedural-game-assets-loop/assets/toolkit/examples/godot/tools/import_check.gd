extends SceneTree

## 无头导入检查（验证版本 Godot 4.6.2-stable）：
##   godot --headless --path examples/godot --script res://tools/import_check.gd
## 退出码 0 = 全部通过；1 = 有失败项。

const PGAManifestScript := preload("res://addons/pga/pga_manifest.gd")

var failures := 0

func check(cond: bool, msg: String) -> void:
	if cond:
		print("ok   ", msg)
	else:
		failures += 1
		printerr("FAIL ", msg)

func _init() -> void:
	var manifest: Resource = PGAManifestScript.new()
	manifest.manifest_path = "res://assets/ember.manifest.json"
	check(manifest.last_error.is_empty(), "清单加载无错误" + ("：" + manifest.last_error if not manifest.last_error.is_empty() else ""))
	if not manifest.last_error.is_empty():
		quit(1)
		return
	check(manifest.schema_version == 1, "schemaVersion == 1")
	check(manifest.page_textures.size() == 1, "图集页数为 1（实际 %d）" % manifest.page_textures.size())
	if manifest.page_textures.size() > 0:
		check(manifest.page_textures[0].get_width() > 0, "页面纹理可读（宽 %d）" % manifest.page_textures[0].get_width())
	check(manifest.frames.size() == 34, "ember 34 帧（实际 %d）" % manifest.frames.size())
	# 帧矩形均在页面范围内，锚点为有限值
	var page_w: int = manifest.page_textures[0].get_width() if manifest.page_textures.size() > 0 else 0
	var page_h: int = manifest.page_textures[0].get_height() if manifest.page_textures.size() > 0 else 0
	var rects_ok := true
	for fid in manifest.frames.keys():
		var r: Rect2 = manifest.frame_rect(fid)
		var a: Vector2 = manifest.frame_anchor(fid)
		if r.size.x <= 0 or r.size.y <= 0 or r.position.x < 0 or r.position.y < 0 or r.end.x > page_w or r.end.y > page_h:
			rects_ok = false
			printerr("  帧 %s rect 越界 %s" % [fid, r])
		if is_nan(a.x) or is_nan(a.y):
			rects_ok = false
	check(rects_ok, "全部帧 rect 在页面内、锚点有限")
	# 剪辑：run_fwd 6 帧、每帧 90ms、引用存在
	check(manifest.clips.has("run_fwd"), "存在 run_fwd 剪辑")
	if manifest.clips.has("run_fwd"):
		var c: Dictionary = manifest.clips["run_fwd"]
		check(c["frames"].size() == 6, "run_fwd 6 帧")
		var dur_ok := true
		for d in c["ms"]:
			if float(d) != 90.0:
				dur_ok = false
		check(dur_ok, "run_fwd 每帧 90ms")
		var ref_ok := true
		for fid in c["frames"]:
			if not manifest.frames.has(fid):
				ref_ok = false
		check(ref_ok, "run_fwd 引用均存在")
	# 附件点：p_stand_fwd 枪口局部坐标朝右且锚点在脚底附近
	var m: Vector2 = manifest.attachment_local("p_stand_fwd", "muzzle")
	check(m.x > 0, "p_stand_fwd 枪口局部 x>0（实际 %.1f, %.1f）" % [m.x, m.y])
	var tex: AtlasTexture = manifest.atlas_texture("p_stand_fwd")
	check(tex != null and tex.region.size == Vector2(40, 48), "p_stand_fwd AtlasTexture 40×48")
	# 重复加载不复制第二套资源（运行时加载天然幂等，仍记录一次检查）
	var again: Resource = PGAManifestScript.new()
	again.manifest_path = "res://assets/ember.manifest.json"
	check(again.frames.size() == manifest.frames.size(), "重复加载帧数一致（幂等）")
	print("----")
	if failures > 0:
		printerr("导入检查失败 %d 项" % failures)
	else:
		print("导入检查全部通过（Godot %s）" % Engine.get_version_info().get("string", "?"))
	quit(1 if failures > 0 else 0)
