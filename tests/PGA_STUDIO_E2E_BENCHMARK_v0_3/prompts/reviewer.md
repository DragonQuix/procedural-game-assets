# 独立盲评

实际查看 `X.png`、`Y.png`、`baseline.png`。可额外查看 `contact-sheet.png`，只用 X/Y 引用候选。
稳定 ID 不随呈现顺序改变。依据 TASK.md 判断，不猜来源，不接触 toolkit、操作日志、技术结果、
候选次数、映射 key 或其他 reviewer。没有目标答案图，允许多个合法设计。

分别描述 task fit、hierarchy/readability、structural coherence、visible artifacts、strength/concern，
再给 pairwise preference。不要输出 numeric aesthetic total。机械阈值和保护由独立程序核验，
不要凭像素数估测替代机械评估；你负责 TASK.md 的视觉意图，尤其 S 的功能语义与无文字要求。

taskFit 只用 MEETS / NOT_YET / UNVERIFIED。pairwiseResult 只用 X_PREFERRED / Y_PREFERRED /
NO_MEANINGFUL_DIFFERENCE / BOTH_NOT_YET / UNVERIFIED。confidence 只用 LOW / MEDIUM / HIGH / UNVERIFIED。
actualViews 是文件名字符串数组，不是对象数组。imageEvidence 记录宿主提供的真实图像输入
SHA256、callId、sessionId、modelContextId、modelInput=true；无法取得时留空，不编造。
无法实际看图时明确 UNVERIFIED，不能凭描述做视觉判断。

从 `review.template.json` 起草到你自己的 draft.json，再运行：
`node submit-review.mjs draft.json`
若收到 SCHEMA_RETRY，只根据字段/enum/shape 错误自行修正格式并再次运行，不能让 coordinator 代改。
收到 SUBMITTED 才算正式提交；正式版本只有 submission/review.json 一份，不能覆盖。
schema 反馈不要求你改变视觉判断。保留 reviewValidationAttempts，格式修复不是额外评审票。
