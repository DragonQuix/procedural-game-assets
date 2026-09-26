class_name PGAManifest
extends Resource

## PGA 清单资源：加载离线 manifest JSON 与图集 PNG（ADR-0003）。
## 修改 manifest_path 后自动重载并发出 changed；schemaVersion 不兼容即报错不猜测。

@export var manifest_path: String = "":
	set(value):
		manifest_path = value
		reload()

var schema_version: int = 0
var seed: int = 0
var frames: Dictionary = {} # id -> 清单帧字典（rect/anchor/attachments/page）
var clips: Dictionary = {} # name -> { frames: Array, ms: Array }
var page_textures: Array[Texture2D] = []
var hints: Dictionary = {}
var last_error: String = ""

func reload() -> void:
	schema_version = 0
	frames.clear()
	clips.clear()
	page_textures.clear()
	hints.clear()
	last_error = ""
	if manifest_path.is_empty():
		emit_changed()
		return
	if not FileAccess.file_exists(manifest_path):
		last_error = "清单不存在：" + manifest_path
		push_error("PGA: " + last_error)
		emit_changed()
		return
	var doc: Variant = JSON.parse_string(FileAccess.get_file_as_string(manifest_path))
	if typeof(doc) != TYPE_DICTIONARY:
		last_error = "清单不是 JSON 对象"
		push_error("PGA: " + last_error)
		emit_changed()
		return
	var sv := int(doc.get("schemaVersion", -1))
	if sv != 1:
		last_error = "schemaVersion %d 与导入器不兼容（支持 1）" % sv
		push_error("PGA: " + last_error)
		emit_changed()
		return
	schema_version = sv
	seed = int(doc.get("seed", 0))
	hints = doc.get("hints", {})
	var base := manifest_path.get_base_dir()
	for p in doc.get("pages", []):
		var tex_path := base.path_join(str(p.get("file", "")))
		var img := Image.load_from_file(tex_path)
		if img == null:
			last_error = "无法加载图集：" + tex_path
			push_error("PGA: " + last_error)
			continue
		page_textures.append(ImageTexture.create_from_image(img))
	for fr in doc.get("frames", []):
		frames[str(fr.get("id", ""))] = fr
	for cname in doc.get("clips", {}):
		var c: Dictionary = doc["clips"][cname]
		var ms_value: Variant = c.get("ms", 1000)
		var durations: Array = ms_value if typeof(ms_value) == TYPE_ARRAY else [ms_value]
		clips[cname] = { "frames": c.get("frames", []), "ms": durations }
	emit_changed()

func frame_rect(fid: String) -> Rect2:
	var f: Dictionary = frames.get(fid, {})
	var r: Dictionary = f.get("rect", {})
	return Rect2(float(r.get("x", 0)), float(r.get("y", 0)), float(r.get("w", 0)), float(r.get("h", 0)))

func frame_anchor(fid: String) -> Vector2:
	var f: Dictionary = frames.get(fid, {})
	var a: Dictionary = f.get("anchor", {})
	return Vector2(float(a.get("x", 0)), float(a.get("y", 0)))

## 附件点的节点局部坐标 = attachment - anchor（ADR-0002）
func attachment_local(fid: String, att_name: String) -> Vector2:
	var f: Dictionary = frames.get(fid, {})
	var at: Dictionary = f.get("attachments", {}).get(att_name, {})
	return Vector2(float(at.get("x", 0)), float(at.get("y", 0))) - frame_anchor(fid)

func atlas_texture(fid: String) -> AtlasTexture:
	if not frames.has(fid):
		return null
	var f: Dictionary = frames[fid]
	var page := int(f.get("page", 0))
	if page < 0 or page >= page_textures.size():
		return null
	var at := AtlasTexture.new()
	at.atlas = page_textures[page]
	at.region = frame_rect(fid)
	at.filter_clip = true
	return at
