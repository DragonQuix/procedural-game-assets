# PGA Studio v1.3：按实证失败排序

本文件是审计后的产品建议，不是已实施改动。实施者必须以仓库 `CONTEXT.md` 与 ADR-0001、0008、0009、0010、0011 为术语、纯核心/IO、事务、保护与跨帧边界来源。当前无 CONTEXT-MAP.md；不得新增第二套渲染器、把保护放在CLI里绕过纯核心，或修改v1.2冻结材料来让旧结果变成通过。

## 最先做的三件事

1. **全局任务保护合同与统一预提交审计**：补齐 safe region / transparent margin，区分 operation-local 检查和任务全局检查，candidate、commit和submit消费同一不可变合同。
2. **约束感知联动几何与revision绑定的安全域**：先做居中增宽、保底缘缩放、边界内布局；不是泛化自然语言设计器。
3. **统一可追溯观察接口**：原生/最近邻4x、目标裁切、前后叠加和材质分带诊断；角色播放有宿主可用性探针及保留证据，不能把HTML文件存在当观察完成。

## P0：补齐全局保护，不声称已发现事务绕过

证据：T05-D-r1首候选合法地通过operation footprint检查，但底部27个描边像素违反任务2px留白。92份候选的重验与原状态一致，未发现已声明保护绕过或metadata错误。问题是全局任务约束未编码，不是commit不重验。

新增外部约束合同建议包含：version、baseline asset hash、frame coordinate space、allowed RGB/alpha masks、minimum transparent margin、immutable metadata、component/type policy。合同内容hash进入workspace/revision/candidate身份；不得依赖可被编辑操作更改的非权威副本。核心纯函数接收合同与baseline；IO层负责冻结/载入，符合ADR-0001/0009。

每个检查结果分别返回 `operationFootprintStatus`、`documentPreserveStatus`、`taskContractStatus`，没有载入全局合同时明确NOT_CONFIGURED，不输出暗示全局通过的单一“outside=0”。commit重新验证原合同版本，submit再次独立编译并验证最终交付；缺合同不冒充任务通过。不要把通用工具的普通导出默认绑定benchmark。

回归验收只需固定旧T05-D-r1操作链的确定性回放：首底座候选必须被task contract拒绝、head不变、提交门不得越过；其它17份D最终产物仍合法。这是产品回归，不重跑agent、不替换旧样本。mask保持[2,38)，不得缩小描边或改评分来让旧失败消失。

## P1：联动几何，先覆盖真实需求

| 能力 | 真实需求与当前困难 | 引擎计算 | 必须保持的不变量 |
| --- | --- | --- | --- |
| widen_about_center | T02-D-r2明确放弃单轴explore；r1/r3也手配x+w。想增厚机壳，同时保镜头/底座的中心关系 | 指定width后以当前中心/显式轴求x，处理整数奇偶；返回是否需要半像素轴选择，不能静默偏移 | 保护像素与附件不变；中心偏差有明确整数策略；边界含描边 |
| resize_about_anchor | T05三次布局需围绕底部承载关系反复手配位置/尺寸，r1填充落点合法但描边越界 | 以指定局部/全局anchor和固定边求位置；边界坐标与像素索引按ADR-0002区分 | 全局anchor不漂移；组件类型/节点集不变；最终支持区域与描边满足合同 |
| squash_keep_base | T02-D-r1三拒、r3两拒均误碰底座；r3已有y5/h23合法例 | 以底缘B求y=B-h，联动x/w及邻接关系；以最终栅格重新验证，而非只做bbox不交叠 | 底座保护RGBA、镜头/徽标、sensor attachment、bottom edge不变 |
| fit_within_safe_region | T05-D-r1忽略padding+outline | 计算最终支持掩码及描边包络，枚举最近可行整数位移/缩放，明确返回NO_FEASIBLE_SOLUTION；建议需显式接受 | 全局mask、留白、anchor、节点类型、种子不变；不偷偷裁切 |

`move_with_dependents`：T05显示人工移动灯/杆/机身/电池的多步负担，值得次级试点；必须先有用户声明的依赖边/接点约束，不能由节点名字猜依赖。将一组操作作为单一事务候选，所有节点变化都纳入计划和保护校验，失败不提交部分结果。

`preserve_silhouette_axis`：可作为widen_about_center的约束选项，不急于成为独立API。T02证据支持保持中心/左右余量，不支持要求所有资产强制对称。

`replace_part_preserve_attachments`：本批没有部件替换需求或attachment破坏，暂不列P1。先做现有范围，不能凭API名称扩张架构。

## P1：safe parameter domain

inspect应区分 schema理论范围与当前revision下的可行域；后者必须携带 revisionHash、contractHash、frame坐标、固定其它变量的条件、保证覆盖范围。避免把三个独立区间误解成其笛卡尔积全部安全。

计算流程：

1. 从当前revision和权威合同取得baseline、protected pixels、不可变anchor/attachments、邻居支持掩码与遮挡层序、frame bounds及padding/outline半径。
2. 用几何关系给出保守候选域，例如固定底缘、中心轴、邻居最小间距；将描边包络纳入侵蚀后的可用区域。
3. 小像素画布内枚举有限整数参数/联动变换，由同一compile+protection完整复验。保护区含洞或受遮挡时，可行集合可能不连续，返回disjoint intervals或explicit tuples，不虚报连续[min,max]。
4. 保留safe.width/height/offset用于单变量条件域，同时返回 `recommendedTransforms` 及联动可行元组。改revision立即失效；缓存由revision+contract+operation hash索引。
5. 扩大几何时既检查新像素，也检查腾出的旧像素和全局outline重新分布。RGB/alpha分别检查；对非覆盖姿态遵循ADR-0011明确UNSUPPORTED/UNVERIFIED。

无需大规模agent实验才能验证安全域正确性：先用小域穷举验证“宣称safe的所有点确实safe”、故障候选被排除、r3合法y/h组合未被错误全部封锁。

## P1/P2：联合候选探索

支持有限、可解释的 `explore({goal:"more squat/heavy", axes:[...]})` 有价值，但先将goal映射为明确变换模板：宽度+中心位置，或高度+底缘位置。不得让引擎偷偷生成大量候选只展示最优、或更换材质来掩盖比例问题。

预算计数以实际生成的不同渲染状态为准，包含拒绝候选；候选清单、联动参数、保护原因全部落盘。应先上线同等预算的确定性coupled transforms，再单独比较自动goal规划，避免一次引入多项变量。T06两轮单颜色探索的六状态不是单纯低效证据：A可一次改两颜色，操作粒度不同；若做联合色阶探索，应作为另一个实验。

## P2：观察与材质反馈

T03的正确结果是D/A/A共识偏好，D-r2/r3相同最终图遭达标分歧；R2具体指出夹口仅增加受光边、缺阴影侧，手柄压暗幅度不足。不是“三轮偏好反向”的评审不可靠证据。T06-D-r3自报inspect art.head没取得预期局部细节、需自行裁切；多份T06自报浏览器在子代理不可用。

- target_crop：带目标frame bbox、native坐标和完整图回链，不只放大脱离上下文的局部。
- 4x nearest-neighbor：所有arm同背景、同倍率；防止不同放大方式引入评价差异。
- grayscale / material-band visualization：显示节点各色阶覆盖像素与亮度排序，帮助识别T03“只有亮边没有阴影”；这是观察诊断，不是自动美术分数，不把特定RGB当目标。
- silhouette：对T02比例和T05整体连接结构可用，保留正常彩图判定，不替代色彩要求。
- before/after overlay：同时画task mask与operation footprint，清楚标注padding/outline；T05错误能直接定位。
- candidate contact sheet：少量已计入预算的候选统一全图+局部，提供hash与状态，不生成隐藏候选。
- animation observation：宿主能力在开跑前探测；保存每clip播放动作、帧时间序列、截图hash及实际模型图像输入调用关联，无法播放就显式UNVERIFIED。播放器存在不是验收完成。

下一轮若D得到上述额外观察信息，A必须得到等价只读观察接口，或者把观察作为单独消融变量。不要同时加几何操作、材质自动优化和更强观察再归因于某一个功能。

## P2：实验与报告工具

T04三次结果并不支持“语义模糊使双方三轮相反”。两arm六候选都MEETS，r2/r3评审一致偏A十字。可在新协议中明确“急救识别”与“健康/回血联想”的可接受集合和通过/偏好区别，但不要把心形设计选择自动归为Studio bug，也不要为偏好十字回改旧准则。

T05需冻结共同component/type contract：自由材质能否在组件支撑形状外新增像素、是否允许复合灯座、A层序是否可改。A的五个绘制分组不是D五个严格类型节点的自动等价物。

分析端先做独立schema validator，使用内置不可变enum而不是review自带allowed数组；冻结缺字段处理策略。将T06静态与motion子项结构化，必要子项U明确向taskFit/primary传播。任何fallback输出独立派生记录，不修改原review。

报告全部由同一解盲表生成任务定位与统计；对镜像后的arm做解释，不根据原始X/Y字面判断“相反”。提交前交叉断言文字中的run ID、分歧数量和表格一致。修复execution清单assetHash字段名与T06全帧冻结；记录render/visual-input/launch ledger。上述属于评测基础设施，不应混入Studio能力增益。
