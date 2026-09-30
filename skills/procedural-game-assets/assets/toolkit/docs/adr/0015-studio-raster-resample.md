# ADR-0015：显式尺寸草稿与点位联动

日期：2026-10-01。状态：实施（工具包 0.10.0；不构成尺寸迁移视觉认证）。

术语与边界以 `../../CONTEXT.md` 为准；当前没有 CONTEXT-MAP.md。
沿用 ADR-0001/0002/0004/0009/0014，方向见 `../plans/studio-reference-translation.md` T1。

## 背景

128×256 草稿到 64×128 的探针需先用外部工具缩图，再手算锚点和附件点并创建工作区。
这些步骤不能作为一个受保护、可恢复的 Studio 候选接受。实际看图也表明眼缝和面甲色块
难分、袍面细纹零散：缩图只能提供底稿，细节重组仍须由 Agent 看图后绘改。

## 决定

- 增加 `raster.resample`，target=canvas，显式 width/height 和 sampling=nearest。
  边长仍为 1..256，首版严格等比例，不拉伸、不裁切、不扩边；导入也不暗中缩放。
- 目标像素索引 i 采样源索引 `floor((i+0.5)*sourceSize/targetSize)`。
  只复制规范化 RGBA，不插值、不增加半透明、不量化或补造细节。
- anchor 和 attachments 按像素边界坐标比例联动，不取整；同尺寸保留原值。
  只保持几何比例，不保证点位仍对应缩图后的可见手部或脚底，必须实际检查。
- 保持 raster/1、ID、seed 和 constraints；纯变换在 studio 核心，IO 不引入外部缩图依赖。
  复用现有 edit/commit/restore 和幂等机制，接受时从基准重推导像素与点位。
- 像素或 frameSize 保护不能被尺寸变化绕过，空白图也同样拒绝；元数据保护按最终值检查。
  checks.resample 报告尺寸、采样方法和点位前后值，视觉状态仍为 UNVERIFIED。
- 不同尺寸没有逐像素同坐标比较意义：checks.diff 的 total/outside 为 null，
  reason=FRAME_SIZE_CHANGED。observe 的差分标为 NOT_COMPARABLE / FRAME_SIZE_MISMATCH，
  不生成差分图或套用基准 crop 坐标；contact sheet 保留真实尺寸，单图预览照常提供。

## 取舍与边界

最近邻使像素来源明确且可确定性重放，但可能丢失轮廓、细纹和识别特征。接受尺寸草稿
不等于视觉放行；Agent 先看目标原尺寸、放大和背景图，再重新选区，用已有绘改操作重组细节。
跨尺寸观察不做隐式对齐、自动放大到同尺寸或相似度评分，以免把未经约定的变换当成比较依据。

不支持任意宽高比、插值、自动细节重构、风格转换、动画或大图缩图导入。
不把用户角色、外部 FFmpeg 或专用绘制脚本变为工具包依赖，循环版和用户级安装不随动。
