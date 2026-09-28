# 循环资产生成：同类方案调研

日期：2026-09-28。用途：决定本项目特别版技能的工作流，不评价供应商的实际出图质量。

后续说明：以下保留首版调研与需求对齐记录。现行合同已按
[ADR-0007](../adr/0007-quality-parity-review.md) 升级为 `pga-loop/2`，默认对齐质量等级、
允许原创，不要求复制角色；用户已明确这项目标时，不再询问是否复现参考身份。
下文的 `pga-loop/1` 与示例问题仅为历史依据，不是现行启动要求。

检索使用 AnySearch MCP：通用搜索、`code.snippet`、`academic.search`，共两批
8 条查询；打开下列项目正文或技能原文核验。转载及同一仓库不重复计为独立证据。
没有安装外部技能、MCP 或插件，没有调用付费生成服务。未进行竞品运行横评。

## 已核验的方法

| 方案 | 正文中的方法 | 本项目取舍 |
|---|---|---|
| [Game Assets Enhancer](https://github.com/adamlyttleapps/claude-skill-game-assets-enhancer)，[技能原文](https://raw.githubusercontent.com/adamlyttleapps/claude-skill-game-assets-enhancer/main/SKILL.md) | 先写风格指南、制作风格锚点；单物体独立透明资产；动画从同一首帧派生，统一画布与脚底位置；截图检查 | 采用风格锚点、部件分离与防漂移。其资产来自 fal.ai 图像生成，不等于程序化源码生成；不照搬暖色、山体层数等题材默认值 |
| [imaginu](https://github.com/vicotrbb/imaginu)，[技能原文](https://raw.githubusercontent.com/vicotrbb/imaginu/main/skill/imaginu/SKILL.md) | JSON 配方生成确定性 GLB，生成、实际查看 PNG、迭代；动态资产另外渲染动画帧；schema 与工作流分离 | 采用配方是实现源、必须看真实产物、接口文档单一来源；不把其 3D 能力算成本工具包能力 |
| [PixelLab MCP](https://github.com/pixellab-code/pixellab-mcp)，[产品页](https://www.pixellab.ai/) | 编码助手通过 MCP 制作角色、动画和地块；产品提供参考风格、角色方向、编辑等能力 | 学习资产类别与参考风格约束。已核验页面未证明独立盲审与双批次 WOW，不能以“有 MCP”推断有质量闭环 |
| [Scientific Schematics 固定版本技能](https://github.com/K-Dense-AI/scientific-agent-skills/blob/49c6e97775eaa18ba791bebe23162a70ae601c18/skills/scientific-schematics/SKILL.md) | 生成模型与评分模型分离；按用途阈值决定返修；保存版本与评审日志；评审失败记 null/未验证，不编造得分；该版本最多两次生成 | 采用缺评审不算通过、可追溯记录。不采用两轮上限，也不以单个总分替代资产准出 |
| [BlenderAlchemy 论文](https://arxiv.org/html/2404.17672v1)，[代码](https://github.com/ianhuang0630/BlenderAlchemyOfficial) | 编辑生成器提出程序变体，执行并渲染；状态评估器成对比较；保留较好的程序、坏变体回退；论文有计算预算 | 采用证据驱动的小范围实验和保留最佳候选；相对胜出只帮助搜索，不等于达到绝对质量门槛 |

检索边界：没有在本次已核验材料中找到完整覆盖“2D 程序化源码交付 + 参考图
两阶段盲审 + 独立交付审计 + 同候选双批次准出”的现成方案。这不是不存在此类
产品的证明。产品宣称的质量、速度与费用没有经本项目实测，不纳入验收依据。
尝试的 PixelLab `/docs/mcp` 返回产品首页，故 MCP 结论改以官方仓库正文为据；
错误的 BlenderAlchemy 仓库候选不可读取，搜索纠正到 `BlenderAlchemyOfficial`。

## 与 Gauntlet 的关系

本机 `gauntlet-loop` 的宿主合同、img2threejs 资产模式、视觉/交付 critic、循环、
停止协议及公共材料协议是方法来源。借鉴：对齐宪章、总控/制作/评审分权、两阶段
盲比、固定候选身份、全支柱复审、双批次确认、不因工作量降标。

本项目采用独立的 `pga-loop/1` 合同，不伪称 Gauntlet 正式协议兼容，也不调用
Three.js 专用状态机、复制其角色比例规则或修改已安装的 Gauntlet 技能。
具体决定见 [ADR-0006](../adr/0006-asset-loop.md)。

## 示例图带来的需求，不是已通过的测试

用户给出的 1536×1024 PNG 已实际查看：左侧单角色大立绘，右侧多行较小的
角色姿势、枪口火焰、弹体、投掷与爆炸、受击/倒地表现；整体为像素风展示板。
角色有浅色束发、橙色护目镜、深蓝护甲与橙色点缀等可观察身份特征。

它能约束画面质量和可见身份特征，但不能单凭版面确认动画帧顺序、帧时长、透明
背景、统一网格、锚点或循环连续性。首轮应先确认“重建该角色”还是“同等质量的
新角色”，以及立绘/动作/特效的交付范围与原生尺寸。不能把整板机械切割并声称
已获得可用动画，也不能用放大的立绘与小精灵作不公平盲比。

## 实施范围

以 `../../CONTEXT.md` 为术语与模块边界来源，以 ADR-0001/0004/0005/0006
为架构依据；当前没有 `CONTEXT-MAP.md`。实施者须保持核心与 IO 分层、共享烘焙
核心及轻量模板边界。新增入口只交付资产，不强迫制作完整游戏。

先落地可移植技能协议、固定证据与机器防误收工具；不以本次示例的出图数量、
美观程度或报告完整度为目标。真正的 WOW 仍需运行期独立视觉与交付评审。
