# Hold-out 来源与边界

H/K/M/S 的 baseline、直绘源与任务文字由本轮 `organizer/materials.mjs` 新建，
不从历史 benchmark 或 demo 读取资产，也不把控制解当视觉目标。
机械扫描由 `organizer/leakage.mjs` 完成，完整覆盖数与命中结果写入 `evidence/developer-self-tests.json`。
扫描范围是四类旧资料的 Git tracked 文件，排除 frozen dependency、正式 runs/reviews/results，避免把产物误当设计源。
检查去颜色的绘图调用布局、去身份/颜色并按画布尺寸归一的几何、decoded baseline RGBA、任务文字连续 32 字符。
这些是重复检测，不是语义新颖度证明；通用 primitive 与同一问题类别允许复用。

人工设计核对并查看了四张 enlarged baseline：

| task | 新 source layout / geometry | 与旧资料的区别 | 开放视觉目标 |
|---|---|---|---|
| H | 72×64，多边支架、非对称附件、圆形 display、带三角徽记的底座 | 非旧 T02 细长设备换色；有独立 body/brace/fin/display/vent/emblem 组合 | 重量感与焦点，不给目标宽高 |
| K | 80×64，鼓轮/轮毂、驱动壳、导出口、握持件、折形托架与固定脚 | 非旧救援信标；R1 为水平驱动壳到导出口连接，非 v0.2 C/R 垂直柱边界 | 收放牵引索用途与结构组织 |
| M | 68×68，8 顶点开口夹体、偏置丝杆、压力垫、横柄、两个独立螺栓 | 同属材质任务类别但不是旧 clamp 几何或源图换色 | 多种合法金属明暗，不复制目标光照 |
| S | 64×64，八边外壳、矩形 face、4 个占位多边形与圆点 | 不沿用 medical cross/heart；外壳和占位布局均新建 | 能量转接，可用端口/流向/连接等不同解 |

无 target image，无 reference answer similarity 指标。两组控制只是机械可行性的见证，
不声称控制图已达到视觉要求。描述中的用途相近或使用同一 primitive 不算资产复用；
但无法据此证明模型训练中没见过相似题材，所以正式结论仍限于本次 hold-out 与冻结模型/宿主。
