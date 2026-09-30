# Studio v1.4 窄范围交付与独立验证交接

术语和边界以 `../../CONTEXT.md`、`../PLAN.md`、ADR-0001/0002/0008–0013 为准；当前无 CONTEXT-MAP.md。
实现者与验证者不得据工程 demo 推导正式视觉或 agent 收益，不恢复通用 solver、Godot 必做或长循环要求。

## 产品合同

`pga-studio/4` 在现有文档层增加显式 contact。纯 evaluator 消费编译后的矩形 frameRect，返回
SATISFIED/GAP/OVERLAP/UNSUPPORTED/CONFLICT、signedGapPx、absoluteGapPx、overlapPx、坐标和策略。
策略仅 translate-follower、resize-follower-edge，显式 follower/axis/invariant，不根据名称猜测。
有向无环单次传播，primary 不能被反改；循环或冲突保守拒绝，即使任意 solver 可能找到其它解。

三个 semantic transforms 使用顶层 preserveRelations；safe domain 复用同一操作/编译/保护/关系链。
required 关系无论是否 preserve 都强制。候选重推导、commit、restore、submit/export 重新检查，
不能靠自报 PASS 绕过。关系参与文档、候选、inspection 与 safe binding 身份。
API 和 CLI 详见 `../studio-cli.md`；关系不进入对外游戏 manifest。

## 测试与 demo

新增 tests/unit/studio-relations.test.js、tests/integration/studio-relations.test.js：
评估、修复、冲突、保护组合、整数、required/advisory、域缩减、SEARCH_LIMIT/POINT_FALLBACK、
身份过期、inspect、篡改候选、最终导出与 restore、/1–/4 无关系像素兼容、真实 CLI。
旧测试没有删除，仅版本支持列表加入 /4。既有 legacy assets 与 v1.3 demo 不改源。

benchmark-identity、benchmark-payload-gate 覆盖提示词身份静态检查、精确 allowlist、
预启动实际安装哈希、任务未暴露、DRAFT 禁止启动、重新核验和镜像后 X/Y 不变。
benchmark-relation-materials 是主持人机械控制解/真实两臂观察等价测试；通用载荷排除私有实验包，
此测试在载荷中显式 SKIP，不冒充覆盖。

```powershell
node --test --test-reporter=spec "tests/**/*.test.js"
node examples/studio/v14-relation-demo.mjs --out work/zcode-v14-demo
node examples/studio/v13-demo.mjs --out work/zcode-v13-regression --evidence work/zcode-v13-evidence
node tools/release.mjs --check
node tests/PGA_RELATION_BENCHMARK_v0_2/prepare-materials.mjs --check
```

新 demo 自建资产，输出 A.png（baseline）、B.png（拒绝诊断的 1px gap）、C.png（合法修复候选）、
diff.png、带外置稳定标签的 contact-sheet.png、evidence.json、relation-inspection.json、最终 submit。
Codex 本轮只写 demo；独立运行和视觉核验由 ZCode 完成。无服务、无后台进程。

## 实验与发行边界

v0.1 NO-GO 原样保留，INT-01 使其为 qualified evidence；产品解释单独存档。
v0.2 两任务为全新 hold-out，D13 为真实 v0.7.0，D14 为 0.8.0 candidate snapshot。
正式 final freeze、模型/宿主、vision gate 图像核验、事件计数 schema、执行顺序及启动 host adapter
均由 ZCode 运行前冻结。没有正式模型调用或正式 runs。详见实验 README 与 protocol-draft.json。

仅重建普通技能仓库载荷，不更新循环载荷、用户级技能安装、其他游戏或 v0.1 原数据。
package/toolkit semver=0.8.0，产品轮次=Studio v1.4，文档 schema=/4，保护 schema 仍为 /1。
全局身份规范只追加现有用户入口与当前仓库 AGENTS.md；未创建不存在的 CLAUDE.md/CLADUE.md。

## 已知限制

- 仅静态矩形的结构边接触，不支持 poly/disc/character、多帧关系、遮挡可见性或任意距离约束。
- 联系边的容差不是视觉通过标准；required 合同满足仍可能不好看。
- payload gate 是启动时序与哈希检查，不是 OS 沙箱；宿主必须隔离协调器目录并防止启动时并发篡改。
- 同步文件被拥有全部写权限的人改写不属于工作区身份合同的对抗边界。
- 已写测试与开发者自检不代表 ZCode 独立验证通过，候选快照不代表正式冻结。
