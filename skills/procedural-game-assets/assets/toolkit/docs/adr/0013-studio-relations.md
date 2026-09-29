# ADR-0013：Studio v1.4 的显式 contact 与有限修复

日期：2026-09-30。状态：实施，待独立验证。

术语及边界以 `../../CONTEXT.md` 为准；当前没有 CONTEXT-MAP.md。
延续 ADR-0001/0002/0008–0012。产品依据见 `../experiments/pga-constraint-v0_1-product-interpretation.md`。

## 决定

- 新文档版本 `pga-studio/4` 加入 `relations`；/1、/2、/3 读取与渲染不变，没有关系即 NOT_CONFIGURED，不按名称推断。
- 关系用稳定 id、endpointA/B 的 nodeId/feature、tolerance、required、可选 resolution 声明。
  关系合同参与 document/revision identity；编辑和 restore 不得替换它。合同变更须显式新建工作区。
- contact 首版只支持 panel/screen 的相向轴对齐边，按编译后的 frameRect 计算。
  坐标是像素边界，排除全局 outline 扩边；切向交集须至少 1px，点接触不算 contact。
  该合同保证结构接触，不保证接触部位可见或艺术质量。
- resolution 明确 follower A/B、axis 与 invariant。translate-follower 保持尺寸和正交位置；
  resize-follower-edge 保持 opposite edge 和正交几何。primary 节点不能被修复反向修改。
- 只做有向无环关系的确定性单次传播，同 follower 的字段提案必须一致；环、冲突、非整数、
  未支持类型/feature 或保护冲突均拒绝，不搜索最近解、不 clamp。
- preserveRelations=true 选择 primary 连通分量中的 required relations；ID 列表只选择指定关系。
  未选中的 required relations 仍参与最终验证。advisory 仅诊断，除非请求显式保持它。
- safe domain 复用 apply（含请求的修复）→ compile → protection → required relation 检查；
  保留 SEARCH_LIMIT / POINT_FALLBACK。无第二套数学域模型。
- 候选、commit、restore、submit/export 重新编译并评估。不得信任候选自报 PASS。

## 取舍

不做任意约束 solver、多边形接触、角色跨帧关系、可见性/遮挡接触或隐式依赖。
有限策略较易解释和重放，但有合法解的循环合同也可能被保守拒绝。独立验证和正式模型实验由 ZCode 执行。
