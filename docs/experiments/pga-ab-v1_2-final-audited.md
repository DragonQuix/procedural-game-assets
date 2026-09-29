# v1.2 终审后的正式解释

本文件取代 `tests/pga-ad-host/archives-v1_2/scored-report-v1_2.md` 的解释部分
（superseding interpretation），不替换旧报告、原始评审、评分或冻结文件。

事实来源：`tests/pga-ad-host/audit-v1_2/audit-report.md`、`audit-results.json`、
`complete-tables.md`、`sensitivity-analysis.json`；根因证据为
`t05-d-r1-coordinates.json`、`t05-d-r1-reconstruction.json`。
这些审计文件在接手时为用户已有未跟踪文件，本轮只读，不代为提交。

| 解释口径 | A taskSuccess | D taskSuccess |
|---|---|---|
| 原机械字段聚合（条件值） | 17/18 PASS | 14/18 PASS |
| T06 未播放必要动画传播 UNVERIFIED | 15/18 PASS | 12/18 PASS |
| 两份 fallback review 严格置 UNVERIFIED | 15/18 PASS | 13/18 PASS |

原 pair-level：CONSENSUS_A=7、CONSENSUS_D=2、MIXED=7、
NO_MEANINGFUL_DIFFERENCE=2。成功矩阵：both pass=13、A only=4、
D only=1、neither=0。二侧 exact McNemar p=0.375；只在 9 个方向共识
pair 内的二侧 exact sign/binomial p=0.1796875。后者不是全部偏好总体的检验；
同一任务的重复存在聚类，小样本非显著也不等于两者等效。

T05-D-r1 的 27 个违规像素全部位于 x=7..33、y=38，来自新增底座外描边。
当时 operation footprint 合法，文档没有最终资产的边界保护合同；不是 commit
重验失效，也不是 benchmark mask 过窄。T02 只有 D-r1、D-r3 的 y/h 调整
触发底座保护拒绝，不能写成三次全部发生。

T06 的冻结统计规则没有明确子项如何传播；两份 review 缺少三个 allowed enum
字段，实质 verdict 均为合法 X_PREFERRED。敏感性口径改变计数，不能伪装成原
预注册的唯一规则。缺宿主图像输入轨迹，观察证据不能由自述升级为 CONFIRMED；
条件性 taskSuccess 不等于所有协议要求已获独立认证。T05 A 侧组件类型还有协议歧义。

支持的结论：在这套冻结的 6 项程序化像素资产任务、指定模型/宿主与候选预算下，
没有观察到 Studio v1.2 的整体优势。证据支持优先修复全局保护合同和联动几何。
不支持：A 普遍优于 Studio、弱 agent 能力已经提高、全部动画已独立验证、
或商业级美术与其他任务的泛化结论。本轮没有重跑 36-run 实验或重评分。
