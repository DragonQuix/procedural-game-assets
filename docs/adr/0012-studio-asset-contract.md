# ADR-0012：Studio v1.3 资产合同与修订安全域

日期：2026-09-29。状态：已接受。

依据：`CONTEXT.md`、ADR-0001/0002/0008–0011，以及
`docs/experiments/pga-ab-v1_2-final-audited.md`。当前没有 CONTEXT-MAP.md。

## 决定

- 新增 `pga-studio/3`，旧 /1、/2 的渲染和编辑行为保持兼容。
- `protection` 是文档的一部分，包含无嵌套合同的 /1 或 /2 基线文档，因而可序列化、
  可独立重新编译和携带。只保存 baseline hash 或本地文件引用会使独立文件导出无法
  复验，故本版不采用。合同及基线参与 documentHash，不进入运行时 manifest。
- `pga-protection/1` 使用最终帧坐标：protectedRegions（矩形或矩形内 0/1 mask）、
  可选 allowedMutationRegions（其补集受保护）、metadataPaths、nodeIds。
  三类保护独立计算并 AND 聚合；同一个像素重复命中只计一次。
- candidate、commit、最终 export/submit 均重编译。edit 不允许修改合同；restore
  引用历史内容，但不能解除当前合同。无合同返回 NOT_CONFIGURED，不暗示全局保护通过。
- 几何操作只适配已有矩形语义，保持中心/底边/明确局部归一化锚点；整数栅格无法
  精确保持时拒绝，不取整漂移。不由名字猜 base 或依赖关系。
- safe domain 为固定其它参数的修订绑定条件域。有限整数枚举调用同一编译与检查，
  不另写约束求解器；明确试编译上限与异常。旧结果不能作为新修订授权。

## 边界

本版不支持角色的资产级合同、多节点联动或 poly/disc 语义 resize；旧角色保护保持
ADR-0011。合同保证相对作者选择的冻结基线不变，不防御拥有全部文件写权限的攻击者
重写基线和所有记录。工程回归通过不等于 agent 收益或视觉偏好已经验证。
