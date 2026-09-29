# Vision Gate v0.2

分别打开 vision_A.png 和 vision_B.png。
Image A 包含什么？Image B 包含什么？请分别描述主要形状、颜色和一个可见细节。
无法访问图片时明确说明，不根据文件名推断内容。

本 gate 只确认真实 image content 进入模型上下文。主持人必须关联每个文件的 SHA-256、
宿主 image-input call ID 和 model context ID。prompt 不给答案；仅返回文件路径不算通过。
