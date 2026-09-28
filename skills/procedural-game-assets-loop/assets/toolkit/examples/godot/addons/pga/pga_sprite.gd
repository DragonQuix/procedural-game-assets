@tool
class_name PGASprite
extends Node2D

const PGAManifestClass := preload("res://addons/pga/pga_manifest.gd")

## 显式帧播放器：Sprite2D + AtlasTexture，锚点与剪辑毫秒时长来自 PGAManifest。
## 编辑器内只显示静态选择帧（预览与运行时状态分开）；动画仅在运行时播放。
## nearest 采样在 _ensure_sprite 中固定；图集不带 mipmap（见 PGAManifest）。

@export var manifest: PGAManifestClass:
	set(value):
		if manifest and manifest.changed.is_connected(_queue_refresh):
			manifest.changed.disconnect(_queue_refresh)
		manifest = value
		if manifest and not manifest.changed.is_connected(_queue_refresh):
			manifest.changed.connect(_queue_refresh)
		_queue_refresh()

@export var clip: StringName = &"":
	set(value):
		clip = value
		_clip_index = 0
		_elapsed_ms = 0.0
		_queue_refresh()

@export var frame_id: StringName = &"":
	set(value):
		frame_id = value
		_queue_refresh()

@export var playing: bool = false
@export var speed_scale: float = 1.0

var _sprite: Sprite2D
var _elapsed_ms := 0.0
var _clip_index := 0
var _refresh_queued := false

func _ready() -> void:
	_ensure_sprite()
	_refresh_queued = false
	_queue_refresh()

func _ensure_sprite() -> void:
	if _sprite and is_instance_valid(_sprite):
		return
	_sprite = get_node_or_null("Sprite2D") as Sprite2D
	if _sprite == null:
		_sprite = Sprite2D.new()
		_sprite.name = "Sprite2D"
		add_child(_sprite)
		if Engine.is_editor_hint() and get_tree():
			_sprite.owner = get_tree().edited_scene_root
	_sprite.centered = false
	_sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST

## 延迟合并刷新：同帧多次 setter 只刷新一次；节点未 ready 时由 _ready 补
func _queue_refresh() -> void:
	if not is_inside_tree():
		return
	if _refresh_queued:
		return
	_refresh_queued = true
	_refresh.call_deferred()

func _current_fid() -> String:
	var fid := String(frame_id)
	if not fid.is_empty() and manifest and manifest.frames.has(fid):
		return fid
	if not clip.is_empty() and manifest and manifest.clips.has(clip):
		var seq: Array = manifest.clips[clip]["frames"]
		if not seq.is_empty():
			return String(seq[min(_clip_index, seq.size() - 1)])
	if manifest and manifest.frames.keys().size() > 0:
		return String(manifest.frames.keys()[0])
	return ""

func _refresh() -> void:
	_refresh_queued = false
	if not is_inside_tree():
		return
	_ensure_sprite()
	if manifest == null or manifest.frames.is_empty():
		_sprite.texture = null
		return
	var fid := _current_fid()
	var tex := manifest.atlas_texture(fid)
	if tex == null:
		_sprite.texture = null
		return
	_sprite.texture = tex
	var a := manifest.frame_anchor(fid)
	_sprite.offset = Vector2(-a.x, -a.y)

func _process(delta: float) -> void:
	if Engine.is_editor_hint():
		return # 编辑器预览保持静态帧
	if not playing or manifest == null or clip.is_empty() or not manifest.clips.has(clip):
		return
	var c: Dictionary = manifest.clips[clip]
	var seq: Array = c["frames"]
	var durations: Array = c["ms"]
	if seq.is_empty():
		return
	_elapsed_ms += delta * 1000.0 * speed_scale
	var dur := float(durations[min(_clip_index, durations.size() - 1)])
	if _elapsed_ms >= dur:
		_elapsed_ms = fmod(_elapsed_ms, dur)
		_clip_index = (_clip_index + 1) % seq.size()
		frame_id = seq[_clip_index]
		_refresh()

## 当前帧附件点的节点局部坐标（attachment - anchor），供游戏逻辑使用
func current_attachment_local(att_name: String) -> Vector2:
	var fid := _current_fid()
	if manifest == null or fid.is_empty():
		return Vector2.ZERO
	return manifest.attachment_local(fid, att_name)
