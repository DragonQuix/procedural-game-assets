# 项目 Agent 规则

## 迭代价值优先

- 本项目的目标是持续改进程序化资产工具包、配方、Canvas 模板与相关技能，不是让某次测试性运行或独立复用试验取得更完整、更漂亮的成果。
- 修复试验代码、补采证据或追加验证前，先说明它能改进本项目的哪项代码、技能、通用文档或维护决策，以及当前缺少什么证据。无法说明可复用收益时，不继续投入。
- 优先处理会影响上游行为、技能指导、复用可靠性，或会误导发行与维护判断的问题。只影响某次试验表现、局部报告完整度或临时验证脚本的瑕疵，可以记录边界后结束，不要求逐项修到通过。
- 独立试验默认作为只读证据来源，不自动接管为长期维护项目。不要仅为结束试验而要求其补修、重跑、重拍或追加提交。
- 已有证据足以支持当前维护决策时停止验证。确需补证时，只做能回答关键问题的最小复现；不以断言数量、截图数量或报告完整度作为工作目标。
- 可以继续打磨样图，前提是过程或发现能改进通用工具、技能指导或维护判断；不要把价值优先误读为禁止打磨。只改善这张图且不能说明可复用收益时停止。
- 这项取舍不降低事实标准：无效断言不算覆盖，机器输入不算人工试玩，未验证结论仍须标明。可以缩小结论或不采纳某条证据，不必为填满验收表修复每个缺口。自行启动的进程与临时资源仍须妥善清理。
- 只有具备实际复现依据且适用于工具包或技能的经验才回收；不把试验项目的题材、美术、玩法或专用验证路线变成通用默认要求。

## 项目上下文文档

- `CONTEXT.md` 是术语、模块边界和关系的来源；存在 `CONTEXT-MAP.md` 时按其定位相关子域，当前未建立该文件。
- 架构、接口、状态流转或长期维护决策相关工作，读取相关 `docs/adr/`；现行范围与路线见 `docs/PLAN.md`，历史验证及其边界见 `docs/verification.md`。
- 生成计划、任务书或实施说明时，显式引用相关上下文与 ADR，要求实施者以其作为术语、边界和架构决策来源。
- 保持 ADR-0001 的核心与 IO 分层、ADR-0004 的网页优先与共享烘焙核心、ADR-0005 的轻量 Canvas 模板边界，不恢复已废弃的首版必做 Godot 要求。
- 资产循环特别版按 ADR-0006/0007 维护：2D 资产、质量同级非复制、独立盲审与交付审计、双批次准出；新任务采用 pga-loop/2，旧裁决不自动迁移。不把长循环默认施加到普通技能。

## 修改与发行

- 工具包改动先落开发源，再通过现有发行脚本生成技能载荷；禁止手工修改 `skills/procedural-game-assets/assets/toolkit/` 或重写清单掩盖损坏。
- `skills/procedural-game-assets-loop/assets/toolkit/` 与其 `scripts/` 同为派生产物；用 `tools/release.mjs --skill procedural-game-assets-loop` 生成，安装脚本开发源仍在普通技能 `scripts/`。
- 独立试验项目、原游戏、共享安装及用户级技能入口默认只读，修改或替换须有明确授权。
- 按职责做中文原子提交，不擅自 amend 或推送；没有需要提交的改动就不制造空提交。

<!-- symbolic-identity:begin -->
## Symbolic identity over spatial identity

1. 区分多个 images、candidates、objects、nodes、regions、panels、review alternatives 或 frames 时，不得用显示位置作为唯一身份；所有 agent-generated prompts、benchmark materials 和 blind-review packages 都必须让身份与视觉布局解耦。
2. 禁止把 left candidate / right candidate、left image / right image、left option / right option、object on the left / object on the right，以及左候选 / 右候选、左图 / 右图、左边那个 / 右边那个、左侧对象 / 右侧对象作为身份标签。
3. 使用稳定符号身份：Candidate A / Candidate B、Candidate X / Candidate Y、Object A / Object B、Node IDs、Region IDs、Frame IDs、stable filenames 或 stable UUIDs。
4. Blind review 使用 X/Y 等符号。MIRRORED_BALANCE 改变画面位置时身份不得改变；reviewer prompt 只能引用 X/Y，不得引用屏幕左侧/右侧。优先分别提供 X、Y 独立图像，不让位置承担身份。
5. Contact sheet 的每个 tile 必须有稳定 ID，标签必须位于 asset pixels 外；prompt 引用 ID，不引用 tile 的左/右位置。
6. Vision gate 不允许用“左边是什么、右边是什么”验证视觉能力。使用独立的 object_A.png / object_B.png，或明确 A/B 标签；不得无意测试模型的左右辨识能力。
7. Logs / JSON / schemas / APIs 禁止用 leftCandidate、rightCandidate、leftImage、rightImage 设计身份字段；使用 candidateA、candidateB、candidateX、candidateY 或 stable IDs。
8. 描述空间几何时，优先使用 object ID、bounding box、coordinates、anchor、edge ID、axis。例如 Node A edge E2 at y=18，优于“A 的上方/左边那个边”。
9. left/right 并非在所有语境下绝对禁止。方向本身是任务语义时，例如 character faces right、projectile travels left，可以使用方向词；对象身份仍必须使用稳定 ID。
10. 原则：**Position may describe geometry; position must not define identity.**
<!-- symbolic-identity:end -->
