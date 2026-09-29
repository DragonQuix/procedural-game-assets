# 完整结果表

这些是冻结 statisticalRules 按 review.taskFit 字段的机械复算。taskSuccess 是接受原主持人全局合规声明后的条件值，不把缺失宿主轨迹变成已验证 PASS。CSV 另有 auditTaskSuccess：没有完整合规证据的条件 PASS 为 UNVERIFIED。该列是证据认证状态，不是宣称这些 run 发生了失败。

## 36 runs

| run | 技术 | 变化像素 | 越界 | 候选数 | 视觉 | 条件 taskSuccess | 审计认证 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T01-A-r1 | PASS | 70 | 0 | 3 | PASS | PASS | UNVERIFIED |
| T01-A-r2 | PASS | 70 | 0 | 2 | PASS | PASS | UNVERIFIED |
| T01-A-r3 | PASS | 70 | 0 | 2 | PASS | PASS | UNVERIFIED |
| T01-D-r1 | PASS | 70 | 0 | 3 | PASS | PASS | UNVERIFIED |
| T01-D-r2 | PASS | 70 | 0 | 3 | PASS | PASS | UNVERIFIED |
| T01-D-r3 | PASS | 70 | 0 | 5 | PASS | PASS | UNVERIFIED |
| T02-A-r1 | PASS | 288 | 0 | 3 | PASS | PASS | UNVERIFIED |
| T02-A-r2 | PASS | 354 | 0 | 2 | DISAGREEMENT | VISUAL_DISAGREEMENT | VISUAL_DISAGREEMENT |
| T02-A-r3 | PASS | 333 | 0 | 4 | PASS | PASS | UNVERIFIED |
| T02-D-r1 | PASS | 343 | 0 | 5 | DISAGREEMENT | VISUAL_DISAGREEMENT | VISUAL_DISAGREEMENT |
| T02-D-r2 | PASS | 242 | 0 | 2 | PASS | PASS | UNVERIFIED |
| T02-D-r3 | PASS | 242 | 0 | 8 | PASS | PASS | UNVERIFIED |
| T03-A-r1 | PASS | 122 | 0 | 3 | PASS | PASS | UNVERIFIED |
| T03-A-r2 | PASS | 103 | 0 | 2 | PASS | PASS | UNVERIFIED |
| T03-A-r3 | PASS | 131 | 0 | 2 | PASS | PASS | UNVERIFIED |
| T03-D-r1 | PASS | 131 | 0 | 5 | PASS | PASS | UNVERIFIED |
| T03-D-r2 | PASS | 82 | 0 | 3 | DISAGREEMENT | VISUAL_DISAGREEMENT | VISUAL_DISAGREEMENT |
| T03-D-r3 | PASS | 82 | 0 | 3 | DISAGREEMENT | VISUAL_DISAGREEMENT | VISUAL_DISAGREEMENT |
| T04-A-r1 | PASS | 48 | 0 | 1 | PASS | PASS | UNVERIFIED |
| T04-A-r2 | PASS | 143 | 0 | 2 | PASS | PASS | UNVERIFIED |
| T04-A-r3 | PASS | 120 | 0 | 3 | PASS | PASS | UNVERIFIED |
| T04-D-r1 | PASS | 61 | 0 | 6 | PASS | PASS | UNVERIFIED |
| T04-D-r2 | PASS | 65 | 0 | 5 | PASS | PASS | UNVERIFIED |
| T04-D-r3 | PASS | 71 | 0 | 3 | PASS | PASS | UNVERIFIED |
| T05-A-r1 | PASS | 523 | 0 | 3 | PASS | PASS | UNVERIFIED |
| T05-A-r2 | PASS | 667 | 0 | 4 | PASS | PASS | UNVERIFIED |
| T05-A-r3 | PASS | 594 | 0 | 7 | PASS | PASS | UNVERIFIED |
| T05-D-r1 | FAIL | 648 | 27 | 9 | PASS | TECHNICAL_FAIL | TECHNICAL_FAIL |
| T05-D-r2 | PASS | 656 | 0 | 6 | PASS | PASS | UNVERIFIED |
| T05-D-r3 | PASS | 555 | 0 | 7 | PASS | PASS | UNVERIFIED |
| T06-A-r1 | PASS | 56 | 0 | 1 | PASS | PASS | UNVERIFIED |
| T06-A-r2 | PASS | 56 | 0 | 2 | PASS | PASS | UNVERIFIED |
| T06-A-r3 | PASS | 56 | 0 | 2 | PASS | PASS | UNVERIFIED |
| T06-D-r1 | PASS | 56 | 0 | 6 | PASS | PASS | UNVERIFIED |
| T06-D-r2 | PASS | 56 | 0 | 6 | PASS | PASS | UNVERIFIED |
| T06-D-r3 | PASS | 56 | 0 | 6 | PASS | PASS | UNVERIFIED |

全部 submitted=true，元数据/锚点/附件点技术检查通过，已保存候选状态均 ≤12。协议完整状态均为 UNVERIFIED_HOST_TRANSCRIPT；协议产物链、冻结输入和工具副本核对通过。最终源与全部帧 SHA-256、错误详情见 run-level-results.csv。

## 18 pairs

| pair | A技术 | D技术 | A视觉 | D视觉 | R1偏好 | R2偏好 | pair结果 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T01-r1 | PASS | PASS | PASS | PASS | NO_MEANINGFUL_DIFFERENCE | NO_MEANINGFUL_DIFFERENCE | NO_MEANINGFUL_DIFFERENCE |
| T01-r2 | PASS | PASS | PASS | PASS | D | D | CONSENSUS_D |
| T01-r3 | PASS | PASS | PASS | PASS | NO_MEANINGFUL_DIFFERENCE | A | MIXED |
| T02-r1 | PASS | PASS | PASS | DISAGREEMENT | A | A | CONSENSUS_A |
| T02-r2 | PASS | PASS | DISAGREEMENT | PASS | D | A | MIXED |
| T02-r3 | PASS | PASS | PASS | PASS | A | A | CONSENSUS_A |
| T03-r1 | PASS | PASS | PASS | PASS | D | D | CONSENSUS_D |
| T03-r2 | PASS | PASS | PASS | DISAGREEMENT | A | A | CONSENSUS_A |
| T03-r3 | PASS | PASS | PASS | DISAGREEMENT | A | A | CONSENSUS_A |
| T04-r1 | PASS | PASS | PASS | PASS | NO_MEANINGFUL_DIFFERENCE | A | MIXED |
| T04-r2 | PASS | PASS | PASS | PASS | A | A | CONSENSUS_A |
| T04-r3 | PASS | PASS | PASS | PASS | A | A | CONSENSUS_A |
| T05-r1 | PASS | FAIL | PASS | PASS | D | A | MIXED |
| T05-r2 | PASS | PASS | PASS | PASS | A | D | MIXED |
| T05-r3 | PASS | PASS | PASS | PASS | A | A | CONSENSUS_A |
| T06-r1 | PASS | PASS | PASS | PASS | NO_MEANINGFUL_DIFFERENCE | NO_MEANINGFUL_DIFFERENCE | NO_MEANINGFUL_DIFFERENCE |
| T06-r2 | PASS | PASS | PASS | PASS | NO_MEANINGFUL_DIFFERENCE | A | MIXED |
| T06-r3 | PASS | PASS | PASS | PASS | NO_MEANINGFUL_DIFFERENCE | D | MIXED |

## 每 task 的 3 次重复

| task | A r1/r2/r3 | D r1/r2/r3 | pair r1/r2/r3 |
| --- | --- | --- | --- |
| T01 | PASS / PASS / PASS | PASS / PASS / PASS | NO_MEANINGFUL_DIFFERENCE / CONSENSUS_D / MIXED |
| T02 | PASS / VISUAL_DISAGREEMENT / PASS | VISUAL_DISAGREEMENT / PASS / PASS | CONSENSUS_A / MIXED / CONSENSUS_A |
| T03 | PASS / PASS / PASS | PASS / VISUAL_DISAGREEMENT / VISUAL_DISAGREEMENT | CONSENSUS_D / CONSENSUS_A / CONSENSUS_A |
| T04 | PASS / PASS / PASS | PASS / PASS / PASS | MIXED / CONSENSUS_A / CONSENSUS_A |
| T05 | PASS / PASS / PASS | TECHNICAL_FAIL / PASS / PASS | MIXED / MIXED / CONSENSUS_A |
| T06 | PASS / PASS / PASS | PASS / PASS / PASS | NO_MEANINGFUL_DIFFERENCE / MIXED / MIXED |

## 36 reviewer 解盲

| pair/reviewer | X→ | Y→ | X taskFit | Y taskFit | 原始 verdict | arm偏好 | confidence | playbackViewed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T01-r1/reviewer-1 | A | D | MEETS | MEETS | NO_MEANINGFUL_DIFFERENCE | NO_MEANINGFUL_DIFFERENCE | HIGH | false |
| T01-r1/reviewer-2 | D | A | MEETS | MEETS | NO_MEANINGFUL_DIFFERENCE | NO_MEANINGFUL_DIFFERENCE | MEDIUM | false |
| T01-r2/reviewer-1 | D | A | MEETS | MEETS | X_PREFERRED | D | MEDIUM | false |
| T01-r2/reviewer-2 | A | D | MEETS | MEETS | Y_PREFERRED | D | MEDIUM | false |
| T01-r3/reviewer-1 | A | D | MEETS | MEETS | NO_MEANINGFUL_DIFFERENCE | NO_MEANINGFUL_DIFFERENCE | MEDIUM | false |
| T01-r3/reviewer-2 | D | A | MEETS | MEETS | Y_PREFERRED | A | MEDIUM | false |
| T02-r1/reviewer-1 | D | A | MEETS | MEETS | Y_PREFERRED | A | MEDIUM | false |
| T02-r1/reviewer-2 | A | D | MEETS | NOT_YET | X_PREFERRED | A | HIGH | false |
| T02-r2/reviewer-1 | D | A | MEETS | NOT_YET | X_PREFERRED | D | MEDIUM | false |
| T02-r2/reviewer-2 | A | D | MEETS | MEETS | X_PREFERRED | A | MEDIUM | false |
| T02-r3/reviewer-1 | A | D | MEETS | MEETS | X_PREFERRED | A | HIGH | false |
| T02-r3/reviewer-2 | D | A | MEETS | MEETS | Y_PREFERRED | A | MEDIUM | false |
| T03-r1/reviewer-1 | D | A | MEETS | MEETS | X_PREFERRED | D | MEDIUM | false |
| T03-r1/reviewer-2 | A | D | MEETS | MEETS | Y_PREFERRED | D | MEDIUM | false |
| T03-r2/reviewer-1 | D | A | MEETS | MEETS | Y_PREFERRED | A | HIGH | false |
| T03-r2/reviewer-2 | A | D | MEETS | NOT_YET | X_PREFERRED | A | HIGH | false |
| T03-r3/reviewer-1 | D | A | MEETS | MEETS | Y_PREFERRED | A | HIGH | false |
| T03-r3/reviewer-2 | A | D | MEETS | NOT_YET | X_PREFERRED | A | HIGH | false |
| T04-r1/reviewer-1 | D | A | MEETS | MEETS | NO_MEANINGFUL_DIFFERENCE | NO_MEANINGFUL_DIFFERENCE | MEDIUM | false |
| T04-r1/reviewer-2 | A | D | MEETS | MEETS | X_PREFERRED | A | MEDIUM | false |
| T04-r2/reviewer-1 | A | D | MEETS | MEETS | X_PREFERRED | A | MEDIUM | false |
| T04-r2/reviewer-2 | D | A | MEETS | MEETS | Y_PREFERRED | A | HIGH | false |
| T04-r3/reviewer-1 | D | A | MEETS | MEETS | Y_PREFERRED | A | MEDIUM | false |
| T04-r3/reviewer-2 | A | D | MEETS | MEETS | X_PREFERRED | A | HIGH | false |
| T05-r1/reviewer-1 | D | A | MEETS | MEETS | X_PREFERRED | D | MEDIUM | false |
| T05-r1/reviewer-2 | A | D | MEETS | MEETS | X_PREFERRED | A | MEDIUM | false |
| T05-r2/reviewer-1 | A | D | MEETS | MEETS | X_PREFERRED | A | HIGH | false |
| T05-r2/reviewer-2 | D | A | MEETS | MEETS | X_PREFERRED | D | MEDIUM | false |
| T05-r3/reviewer-1 | A | D | MEETS | MEETS | X_PREFERRED | A | HIGH | false |
| T05-r3/reviewer-2 | D | A | MEETS | MEETS | Y_PREFERRED | A | MEDIUM | false |
| T06-r1/reviewer-1 | A | D | MEETS | MEETS | NO_MEANINGFUL_DIFFERENCE | NO_MEANINGFUL_DIFFERENCE | HIGH | true |
| T06-r1/reviewer-2 | D | A | MEETS | MEETS | NO_MEANINGFUL_DIFFERENCE | NO_MEANINGFUL_DIFFERENCE | HIGH | true |
| T06-r2/reviewer-1 | D | A | MEETS | MEETS | NO_MEANINGFUL_DIFFERENCE | NO_MEANINGFUL_DIFFERENCE | MEDIUM | false |
| T06-r2/reviewer-2 | A | D | MEETS | MEETS | X_PREFERRED | A | MEDIUM | false |
| T06-r3/reviewer-1 | A | D | MEETS | MEETS | NO_MEANINGFUL_DIFFERENCE | NO_MEANINGFUL_DIFFERENCE | MEDIUM | false |
| T06-r3/reviewer-2 | D | A | MEETS | MEETS | X_PREFERRED | D | MEDIUM | true |

## 36 runs 的包装器操作成本

| run | 候选 | explore | edit | commit | render | submit | 错误 | 拒绝候选 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T01-A-r1 | 3 | 0 | UNKNOWN | N/A | 4 | 1 | 0 | N/A |
| T01-A-r2 | 2 | 0 | UNKNOWN | N/A | 2 | 1 | 0 | N/A |
| T01-A-r3 | 2 | 0 | UNKNOWN | N/A | 2 | 1 | 0 | N/A |
| T01-D-r1 | 3 | 1 | 0 | 1 | 1 | 1 | 0 | 0 |
| T01-D-r2 | 3 | 1 | 0 | 1 | 1 | 1 | 0 | 0 |
| T01-D-r3 | 5 | 1 | 2 | 1 | 1 | 1 | 0 | 0 |
| T02-A-r1 | 3 | 0 | UNKNOWN | N/A | 3 | 1 | 0 | N/A |
| T02-A-r2 | 2 | 0 | UNKNOWN | N/A | 2 | 1 | 0 | N/A |
| T02-A-r3 | 4 | 0 | UNKNOWN | N/A | 4 | 1 | 0 | N/A |
| T02-D-r1 | 5 | 0 | 5 | 1 | 1 | 1 | 0 | 3 |
| T02-D-r2 | 2 | 0 | 2 | 1 | 1 | 1 | 0 | 0 |
| T02-D-r3 | 8 | 0 | 8 | 1 | 1 | 1 | 0 | 2 |
| T03-A-r1 | 3 | 0 | UNKNOWN | N/A | 4 | 1 | 0 | N/A |
| T03-A-r2 | 2 | 0 | UNKNOWN | N/A | 3 | 1 | 1 | N/A |
| T03-A-r3 | 2 | 0 | UNKNOWN | N/A | 2 | 1 | 0 | N/A |
| T03-D-r1 | 5 | 1 | 2 | 3 | 1 | 1 | 0 | 0 |
| T03-D-r2 | 3 | 0 | 4 | 2 | 1 | 1 | 1 | 0 |
| T03-D-r3 | 3 | 0 | 3 | 2 | 1 | 1 | 0 | 0 |
| T04-A-r1 | 1 | 0 | UNKNOWN | N/A | 1 | 1 | 0 | N/A |
| T04-A-r2 | 2 | 0 | UNKNOWN | N/A | 2 | 1 | 0 | N/A |
| T04-A-r3 | 3 | 0 | UNKNOWN | N/A | 3 | 1 | 0 | N/A |
| T04-D-r1 | 6 | 1 | 3 | 2 | 1 | 1 | 0 | 0 |
| T04-D-r2 | 5 | 1 | 2 | 2 | 1 | 1 | 0 | 0 |
| T04-D-r3 | 3 | 0 | 3 | 2 | 1 | 1 | 0 | 0 |
| T05-A-r1 | 3 | 0 | UNKNOWN | N/A | 3 | 1 | 0 | N/A |
| T05-A-r2 | 4 | 0 | UNKNOWN | N/A | 5 | 1 | 0 | N/A |
| T05-A-r3 | 7 | 0 | UNKNOWN | N/A | 8 | 1 | 0 | N/A |
| T05-D-r1 | 9 | 2 | 7 | 8 | 1 | 1 | 1 | 0 |
| T05-D-r2 | 6 | 0 | 6 | 6 | 1 | 1 | 0 | 0 |
| T05-D-r3 | 7 | 0 | 8 | 7 | 1 | 1 | 1 | 0 |
| T06-A-r1 | 1 | 0 | UNKNOWN | N/A | 1 | 1 | 0 | N/A |
| T06-A-r2 | 2 | 0 | UNKNOWN | N/A | 3 | 1 | 0 | N/A |
| T06-A-r3 | 2 | 0 | UNKNOWN | N/A | 4 | 1 | 0 | N/A |
| T06-D-r1 | 6 | 2 | 0 | 2 | 1 | 1 | 0 | 0 |
| T06-D-r2 | 6 | 2 | 0 | 2 | 1 | 1 | 0 | 0 |
| T06-D-r3 | 6 | 2 | 0 | 2 | 1 | 1 | 0 | 0 |
