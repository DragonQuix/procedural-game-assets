# 下一步：交回原实验协调会话

继续当前实验协调工作，不扮演参试制作者。

我提供了 PGA_AB_BENCHMARK_v1_1 维护包。它已针对最新项目独立复验：
339 项项目测试通过，九项行为探针通过（crash-retry 拆成两个故障阶段），23 项素材自检通过。
v1.1 只维护预检，不改六项任务、起始素材、参试提示词、预算或评分。
不要把这些外部报告冒充本机已经运行的结果。

1. 将 v1.1 解压到独立目录，不覆盖旧 v1、旧 NOT_READY 报告、项目源码或待移交 trial。
读取 MAINTENANCE_V1_1_CN.md、LATEST_REVIEW_AND_NEXT_STEPS_CN.md 和 README_CN.md。
以 CONTEXT.md、相关 ADR 为项目合同来源。本轮不修业务代码、不发行、不升级安装。

2. 核对真实仓库、未提交修改和指纹。在 v1.1 包根目录，使用新的输出目录实际运行：
node organizer/preflight.mjs --repo "E:/Repos/Tools/procedural-game-assets" --out <新的预检目录> --run-tests
node organizer/self-test.mjs --repo "E:/Repos/Tools/procedural-game-assets" --out <新的自检目录>
路径不符时按实际目录调整，不使用字面占位符。
应查看实际结果，不手改 readiness；任一真实失败或 UNVERIFIED 保留并报告，不继续放行 scored。

3. 本机通过后，不再为旧 crash-retry 的返回标记差异修改工具。
核验原四个 smoke 目录 T01-A、T01-D、T02-D、T02-A：
必须与当前源码指纹相同，仍是未执行的初始状态，没有候选/submit/参试成绩，没有泄漏完整 master、controls 或别组资料。
满足则继续使用，不为版本名改变重新跑一遍。
目录不存在、已污染或指纹不同，才在新目录重新 prepare 四份 smoke。
不把 smoke 改名为 scored，不在待移交目录运行 render/submit。

4. 分别打包四个 trial，给出真实包路径和各自 PROMPT.md。
用户将它们交给四个同模型、同设置、真正独立且尽量只可访问各自 trial 的新会话。
你已看过主持人材料，不得自己参试；没有独立会话能力就只移交，不模拟成绩。
不要把我这份主持人说明发送给参试者，参试者使用自己目录内的 PROMPT.md。

5. 回收四个完整执行目录和宿主原始记录后，独立 evaluate，保留技术失败、工具受阻、未验证和预算问题。
用 blind 生成两对匿名 reviewer 材料；只交 reviewer 给新评审会话，key.json留在主持人手中。
视觉评审前不揭示组别、成本或技术结果，不亲自代替独立评审。

6. 四次 smoke 的意义是验证制作、看图、提交、回收、验收和盲评链路，不要求两组都美术通过，也不要求D组胜出。
确认真实看图与轨迹回收后，再冻结预注册：源码/提交、包版本1.1、模型与设置、宿主与依赖、相同预算、评审规则。
当前不直接启动36次计分，不把smoke成果或反馈迁入正式运行。
正式批次才重新 prepare 干净 scored 目录，引用本机最新通过的 readiness。

本轮结束时先交付：本机预检/自检结果、四份未执行smoke包、我应分别在哪四个新会话使用哪个PROMPT.md。
未知统计和宿主能力如实记录，不重复要求用户裁定已经有证据说明的探针语义问题。
