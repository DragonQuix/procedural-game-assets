# 任务清单 — procedural-game-assets

依据：`E:/Repos/Games/ForOthers/others_003/docs/PROCEDURAL-ASSETS-IMPLEMENTATION-PLAN.md`（下称"方案"）。
术语与边界：`../CONTEXT.md`；长期决策：`../docs/adr/`。

## P0 基线与契约

- [x] 检查目标路径与 Git 状态；建立新仓库（2026-09-26，原项目 `bd1cf1a` 工作区干净，目标路径不存在）
- [x] 记录来源提交与抽取文件：`docs/provenance.md`
- [x] 建立 `CONTEXT.md`（术语与边界）
- [x] ADR：平台解耦（0001）、坐标契约（0002）、离线清单（0003）
- [x] 授权与来源检查：记入 `docs/provenance.md`
- [x] 采集 111 精灵基线（RGBA、尺寸、锚点、名称）→ `tests/fixtures/baseline/`
- [x] P0 提交（cfac45e）

## P1 像素核心（方案 §7 P1）

- [x] `core/raster.js`：绘制原语 + clip 诊断（error/warn/allow）+ 输入校验 + floor 取整
- [x] `core/color.js`、`core/ascii.js`、`core/transform.js`、`core/rng.js`、`core/hash.js`、`core/diagnostics.js`
- [x] 单元测试 35 项：栅格、变换（镜像/旋转/锚点附件点联动）、ASCII、确定性（2026-09-26 全过）
- [x] P1 提交

## P2 角色闭环（方案 §7 P2）

- [ ] `solvePose` / `drawPose` 分离，显式帧约束
- [ ] 人形配方 + 原角色兼容样本 + 一个新角色（轮廓/比例/装备/调色板不同）
- [ ] 最低画廊（1 倍/4 倍、深浅背景、锚点/附件点、播放）
- [ ] 视觉验收记录（看实际图像，不以单测代替）
- [ ] P2 提交

## P3–P8

- [ ] 按方案推进，逐项补充
