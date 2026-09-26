# 验证记录 — procedural-game-assets

本文件记录工具包自身的验证证据。**原项目（others_003）的 119 项测试与性能数字属于原项目，不是本工具包的结果**（见 `docs/provenance.md`）。

环境：Windows，Node v22.23.2，Godot 4.6.2-stable（仅此版本，不宣称全 4.x）。

## 自动化测试

| 时间 | 范围 | 结果 |
|---|---|---|
| 2026-09-26（P1） | `node --test`：栅格/变换/ASCII/确定性 | 35/35 |
| 2026-09-26（P2） | + 姿态/烘焙/英雄军团 60 帧逐像素回归（基线见 `tests/fixtures/baseline/`） | 59/59 |
| 2026-09-26（P3） | + 图集打包/清单/导出往返/CLI（中文空格路径、覆盖保护、确定性） | 72/72 |
| 2026-09-26（P4） | + 机械/植被/道具/地形配方与接缝断言 | 83/83 |
| 2026-09-26（P6） | + 消费契约（枪口点落枪端像素、锚点贴脚底、镜像 W-x、剪辑时长） | 87/87 |
| 2026-09-26（P7） | 技能载荷独立运行（`skills/.../assets/toolkit` 与已安装位置 `.codex/skills/...`） | 87/87（两处） |

关键回归：ember + legion 族 60 帧与原项目生成器（提交 bd1cf1a）逐像素一致；
原 38×46 帧底边越界以 `clip:'warn'` 显式声明并逐帧记录诊断。

## 视觉验收

见 `docs/visual-review.md`：P2 角色、P4 四类资产、P5 植入故障、P6 消费样例，
均以实际 BMP/浏览器截图/Godot 截图为据，不以单测通过代替审图。

## Godot 验证（4.6.2-stable）

- 无头导入检查 13 项全过（退出码 0）：清单加载、schema 版本、帧矩形在页面内、
  锚点有限、剪辑帧数与 90ms 时长、附件点局部坐标、AtlasTexture 尺寸、幂等加载。
- 窗口模式 demo 截图人工确认：跑姿贴地面参考线、枪口红点、nearest 无串色。
- 编辑器内人工预览（F5）步骤已写入 `examples/godot/README.md`，本会话未执行。

## 技能安装（P7）

- 主存储：`C:/Users/admin/.codex/skills/procedural-game-assets`（新建，无覆盖）。
- 旧版备份：`C:/Users/admin/.agents/skills/procedural-game-assets.backup-20260926094152`（未删除）。
- 发现入口：`C:/Users/admin/.agents/skills/procedural-game-assets`（junction → 主存储）。
- 安装前后载荷哈希（100 文件）均校验通过；已安装位置测试 87/87。
- **发现链路待新会话验证**：技能能否被 Codex 发现并触发，需新会话/重启确认。

## 未验证项（如实记录）

- 独立 Agent 复用试验（P8 需用户授权，尚未进行）。
- Godot 编辑器人工预览（F5）与导入插件形式的编辑器集成（首版不计划）。
- 音频模块（旧技能保留参考，未升级为工具包模块）。
- 跨平台（Linux/macOS）与 Node 23+ 未测；pngjs 字节级输出跨版本一致性未测
  （判据为解码后 RGBA，ADR-0003）。
