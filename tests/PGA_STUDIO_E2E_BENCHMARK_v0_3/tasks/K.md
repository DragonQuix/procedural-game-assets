# Task K：便携救援绞盘

把这套工业部件重新组织成一眼能理解用途的便携救援绞盘：鼓轮负责收放牵引索，
驱动壳与导出口衔接，握持结构应能被读出来。请做明显结构重组，而非局部装饰。
Node `node.drum`、`node.drive`、`node.outlet`、`node.grip` 等保留稳定身份。
Required Relation R1 要求 `node.drive` 的 E1（x 最大边）接触 `node.outlet` 的 E2（x 最小边），
gap 为 0，切向 overlap 至少 1 像素；不能用仅一点相交冒充连接。
Region P1（y=55 起的固定支脚区）、`node.foot` 和 anchor 不变。

硬合同见 `task-contract.json`：至少两个部件中心发生移动，各至少 2 像素，
全部部件中心 Manhattan 位移总和至少 12 像素。你自己决定比例与布局，没有目标坐标或答案图。
视觉验收看绞盘用途、结构连续、握持与承托是否可信；R1 只证明几何接触，不证明视觉质量。
