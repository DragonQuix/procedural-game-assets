# Task C：Contact Preservation

这是一个新的模块化信标资产。稳定映射：Node A=`node.a`，Node B=`node.b`，Node C=`node.c`。
Node A 的 E1=`top-edge`；Node B 的 E2=`bottom-edge`。坐标均为最终帧像素边界坐标。

请明显重构 Node A 的比例：宽度至少 26px，高度至多 10px，centerX=20，bottomY=30。
Node B 的 E2 必须与 Node A 的 E1 保持 R1 contact，容差 0px，切向接触长度至少 1px。
Node C、Region P1 与 anchor 必须符合 task-contract.json 的保护合同。

保留配色与材质语言，重构后的体块关系清楚、结构连续、边缘干净；不要留下悬空交界。
没有 target answer image；可用任意支持的操作，最终要求不限定具体 API。
