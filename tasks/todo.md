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

- [x] `solvePose` / `drawPose` 分离，显式帧约束（`geometry/humanoid.js`、`recipes/humanoid.js`）
- [x] 人形配方 + 原角色兼容样本（ember 34 帧、legion 族 26 帧，60 帧逐像素回归通过）
- [x] 新角色 rustclaw（矮壮、风帽目镜、铆钉枪；站立/跑/瞄准/下落/brace，无需修改核心）
- [x] 最低画廊（1/2/4/8 倍、网格、深浅/棋盘背景、锚点/附件点/包围盒、剪辑播放、URL 复现）
- [x] CLI：validate / bake（含覆盖保护与 BMP 导出）/ gallery（回环服务器）
- [x] 视觉验收记录：`docs/visual-review.md`（看实际 BMP 与浏览器截图，非单测代替）
- [x] node --test 59/59 通过（2026-09-26）
- [x] P2 提交

## 发现（供后续阶段参考）

- 原 38×46 角色帧底边系统性越界（腿部笔刷 1–3px/帧，p_prone 左缘 23px，heavy 两行）：
  兼容样本以 `clip:'warn'` 显式声明并逐帧记录；新配方帧高留 2px 余量即可在 error 策略下通过。
- legion 族（普通/狙击/重装）证明"换数据不换核心"可派生体型差异；rustclaw 进一步验证全新配方。

## P3–P8

- [ ] 按方案推进，逐项补充
