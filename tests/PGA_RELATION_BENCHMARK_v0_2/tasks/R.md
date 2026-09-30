# Task R：Coupled Relation + Protection

这是一个新的承托式终端资产。稳定映射：Node A=`node.a`，Node B=`node.b`，Node C=`node.c`。
E1=Node A top-edge，E2=Node B bottom-edge，E3=Node A bottom-edge，E4=Node C top-edge。
坐标均为最终帧像素边界坐标，Region P1 定义在 task-contract.json。

请作较大结构重构：Node A 宽度至少 32px，高度至多 12px，centerX=28，bottomY=38。
R1 要求 E1 与 E2 contact；R2 要求 E3 与 E4 contact。两条关系均 required、容差 0px，
每个接触的切向长度至少 1px。Node C、Region P1 与 anchor 的保护合同必须保持。

最终设计应有明确的比例变化，连接件与承托关系连续，材质和像素簇保持完整。
没有 target answer image；可用低层几何修改完成，操作路线由你选择。
