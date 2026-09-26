extends Node2D

const PGASpriteClass := preload("res://addons/pga/pga_sprite.gd")

## 演示场景：PGASprite 播放 run_fwd 剪辑；
## 每帧把 MuzzleDot 放到枪口附件点的局部位置（attachment - anchor），
## 并在日间底色上绘制，便于人工编辑器预览核对。

@onready var player: PGASpriteClass = $Player
@onready var dot: Node2D = $Player/MuzzleDot

func _ready() -> void:
	RenderingServer.set_default_clear_color(Color("#7db4e0"))

func _process(_delta: float) -> void:
	dot.position = player.current_attachment_local("muzzle")
	queue_redraw()

func _draw() -> void:
	# 枪口附件点标记（编辑器预览同样可见）
	draw_circle(dot.global_position - global_position, 2.0, Color("#ff4040"))
	# 地面参考线：锚点（脚底）应贴线
	draw_line(Vector2(0, 150), Vector2(320, 150), Color("#3f5a2e"), 1.0)
