extends SceneTree

## 演示场景截图（窗口模式运行，非 headless）：
##   godot --path examples/godot --script res://tools/capture.gd
## 第 10 帧保存 res://demo-capture.png 后退出。
## 注意：MainLoop._process 返回 true 表示"结束程序"，所以平时要返回 false。

var _frames := 0

func _init() -> void:
	var scene: Node = load("res://scenes/demo.tscn").instantiate()
	root.add_child(scene)
	print("demo 场景已加载")

func _process(_delta: float) -> bool:
	_frames += 1
	if _frames == 10:
		var img := root.get_texture().get_image()
		var err := img.save_png("res://demo-capture.png")
		print("截图保存 res://demo-capture.png err=", err)
		return true # 结束程序
	return false # 继续运行
