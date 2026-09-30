# PGA_STUDIO_E2E_BENCHMARK_v0_3

状态：**候选基础设施，DRAFT_NOT_RUN**。正式 participant runs=0、reviews=0、scored model calls=0。
没有真实模型/宿主冻结，没有正式执行授权。本轮不改变 Studio v1.4 / package v0.8.0。

术语和边界以仓库 `CONTEXT.md`、`docs/adr/0008-agent-studio.md`、`0009-studio-edit-transactions.md`、
`0012-studio-asset-contract.md`、`0013-studio-relations.md` 为准；无 CONTEXT-MAP.md。
后续实施者必须沿用这些文档的边界，不增补产品功能或恢复通用 solver。
v1.2 解释以 `docs/experiments/pga-ab-v1_2-final-audited.md` 为准；v0.2 原报告只适用于 GLM-5.3-Flash/ZCode。
旧实验的 protocol、classifier、reviews、report、freeze 与数据均保持只读。

## 要回答的问题

同一个具备图像输入能力的 agent，在开放资产修改任务中，使用 Studio v1.4，
是否比直接写代码更可靠、更好地完成视觉意图，并减少低层操作负担？
这里比较整套已有抽象的效果，不声称识别纯 UI 的因果贡献，不设审美总分或单一 GO 开关。

| 任务 | 新资产与自由度 | 硬约束摘要 |
|---|---|---|
| H | 科幻重力稳定器；质量感、显示焦点、机身/附件比例 | 轮廓变化范围、固定底座/徽记、anchor、面积 |
| K | 便携救援绞盘；鼓轮、驱动壳、导出口、握持结构重组 | 多部件位移、水平 R1 接触、固定支脚 P1 |
| M | 偏置开口夹紧组件；金属分面、明暗组织、横柄退后 | 螺栓精确 mask、轮廓锚点、有限几何、ownership、palette/value |
| S | 能量转接模块；端口与能量传递的非文字构图 | 固定外壳/anchor、中心修改区、mark 面积、外轮廓 |

每项至少有两个不同机械合法控制样本，仅用于可行性断言，**不是答案图或美术标杆**。
控制样本不交付给 participant 或 reviewer。H/K 的阈值只排除原样/微小变化，不指定目标宽高。
S 的无文字要求属于视觉验收；本包不冒充具备通用 OCR。

## 材料与命令

候选载荷：`candidate-materials/manifest.json`。D14 的源文件、CLI、文档、PNG 依赖均从
tag `v0.8.0^{commit}` = `91aaa757bd910255f293c57f594cac06f9f169af` 读取。
这是 annotated tag 的 commit，不是 tag object ID。准备和校验均逐文件核对 Git 对象。
A 获得同一 tag 的完整 core、geometry、bake、recipes、export 和 asset-file adapter，没有 Studio 目录。
两臂都有完整等价颜色能力；A 起点是显式 PixelPainter 直绘，不是故意删减的 painter 或文档解释器。
准备脚本不联网、不安装依赖、不改用户级技能。

从仓库根运行：

```powershell
node tests/PGA_STUDIO_E2E_BENCHMARK_v0_3/organizer/prepare-materials.mjs --check
node tests/PGA_STUDIO_E2E_BENCHMARK_v0_3/organizer/self-test.mjs
node --test --test-reporter=spec "tests/**/*.test.js"
node tools/release.mjs --check
```

从源重新生成时使用新的空目录：
`node tests/PGA_STUDIO_E2E_BENCHMARK_v0_3/organizer/prepare-materials.mjs --out work/new-e2e-materials`
不覆盖现有候选，更不改正式材料。

组织接口见 `organizer/trials.mjs`、`evaluate.mjs`、`blind.mjs`、`review-gate.mjs`、`outcomes.mjs`。
它们没有模型连接器；自测只调用合成 host callback。未来真实宿主适配器由 ZCode 提供。
participant 只运行 `node run.mjs observe` / `node run.mjs submit`，D14 另用 `node run.mjs studio <command>`。
Studio 产品层 `export`/`submit` 是导出，benchmark 最终提交是 `node run.mjs submit`；wrapper 不提供产品 `submit` 别名。
safe-domain 经 inspect/edit/explore 使用，不是单独 CLI command。

## 后续交接

先读 `PROTOCOL.md`，由 ZCode 复核并冻结 policy、真实模型/host、共同预算、执行顺序、
image-input 采集与访问控制。候选 hash 固定不等于正式执行冻结。
不得使用本开发上下文充当 participant/reviewer。正式采用 24 个全新 participant 上下文、
24 个全新 reviewer 上下文，数量不扩大。

共享文件系统不构成沙箱。主持人必须挂载或限定独立目录，并在宿主层审计所有访问与图像输入。
本 harness 的哈希/台账用于可重放证据，不防御拥有协调器写权限者同时篡改文件和清单。
无法证明隔离、身份或图像输入时保留 UNVERIFIED，不能由自述补成 PASS。
