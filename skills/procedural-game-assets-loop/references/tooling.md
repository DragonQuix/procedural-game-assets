# 辅助工具合同

入口为 `<SKILL_ROOT>/assets/toolkit/tools/asset-loop.mjs`，Node 22+。
开发源是仓库 `tools/asset-loop.mjs`，禁止手工改载荷。工具不派 agent、不扣费，
不改运行状态或裁决，也不创建沙箱。退出 0 不是 WOW。

## 运行布局

```text
RUN_DIR/
  checkpoint.json
  charter.json
  original/                  原图只读副本与 hash
  source/                    builder 工作区
  candidates/c001/
    artifacts/               交付源码、配方、依赖与正式说明
    evidence/                原图/派生图、候选采集、动画、gates.json
    record.json              冻结身份和回收记录，不进入两个被哈希的树
  reviews/r001/
    evidence/                派发指令、上下文记录与交付实测报告，不进入候选树
    visual.json
    delivery.json
    pair-01/
      blind/                 只将此目录作为阶段一白名单
      private/               映射、封存、揭盲记录，不提前发给 critic
```

目录名没有隔离能力；默认用独立上下文与禁止越界读取指令，不要求宿主文件沙箱。
正式 critic 的包不得包含上述整个树，也不得包含本工具合同或原始 record.json。
只发送对应任务书与白名单，并明确“不许读取其他材料”。
测试用合成报告不能作为真实 WOW 证据。

## 命令

路径均应使用当前 shell 的引号规则；下面仅展示参数合同。

```text
node <TOOL> snapshot <artifacts> <evidence> <charter.json> <new-record.json>
node <TOOL> pair <normalized-reference.png> <candidate.png> <new-pair-dir>
node <TOOL> seal <pair-dir> <phase1-report.json>
node <TOOL> reveal <pair-dir>
node <TOOL> check <record.json>
```

`snapshot` 不搬文件，只读取真实文件树、拒绝链接、记录逐文件哈希与候选 ID。
记录文件必须在两个材料树之外，不能覆盖旧记录。写后冻结源码、证据和宪章；
图像变化、代码变化、增加证据、阈值变化都需重新 snapshot、新候选、重新评审。
只新增批次记录不改变候选。多轮使用新文件/目录，不编辑旧清单“修到通过”。

`pair` 解码两张 PNG，要求同尺寸，不自动裁切/缩放/加滤镜；随机左右拼接并重新
编码，去除来源文件名和 PNG 附带元数据。返回中性 packetId；左 A 右 B，映射只写
private。上级路径或原图内容本身可能暴露身份，派发前仍需检查，不承诺语义匿名。
单侧最大 1600 万像素是内存保护，不是迭代预算。非 PNG 应先无损转换并留转换记录。

`seal` 原样保存阶段一 JSON 与哈希，拒绝覆盖；`reveal` 必须先验证封存且只能首次
写入。顺序检查防误操作，不防有写权限者重造全套记录，也不强制文件系统权限隔离。
多对图逐对封存后再向 critic 发放完整第二阶段包。

## record 与报告

### pga-loop/2 宪章

从 [宪章示例](../assets/charter.example.json) 开始，空字段必须按真实任务填写。
`validateCharter` 仅校验结构；`snapshot` 还检查所列证据确实存在。在工具包根目录执行
以下命令可独立预检，不需要先生成资产；将参数替换为实际宪章绝对路径：

```text
node --input-type=module -e "import { readFile } from 'node:fs/promises'; import { validateCharter } from './tools/asset-loop.mjs'; validateCharter(JSON.parse(await readFile(process.argv[1], 'utf8'))); console.log('CHARTER_STRUCTURE_VALID');" "<RUN_DIR>/charter.json"
```

退出 0 仅表示结构有效，不证明已有真实授权、证据文件、可执行采集命令或视觉达标。
核心字段：

| 字段 | 合同 |
|---|---|
| `protocol` | 必须是 `pga-loop/2` |
| `visualPolicy.goal` | 固定 `quality_parity`，不是参考复制 |
| `referenceProfile` | `summary` 为可见质量依据；`evidence` 为冻结根内参考路径数组；`limitations` 为盲区数组，可空 |
| `creativeFreedom` | 非空文字数组，说明未被约束的原创空间 |
| `designConstraints` | `{id, criterion, scopeIds}` 数组；无额外明确约束时为 `[]` |
| `scopes` | `{id, kind, criterion, views}`；每个 view 为 `{id, kind, path}`，编号在范围内唯一 |
| `comparisons` | `{id, scopeId, reference, candidate}`，candidate 必须是该 scope 的已登记视图，reference 已纳入质量依据 |
| 视觉 `pillars` | `{id, critic: visual, scopeId, dimension, basis, criterion}`；reference 另有 `comparisonIds`，requirement 不填；无 minimum |
| 交付 `pillars` | `{id, critic: delivery, criterion, minimum}`，沿用 0–10 的最低门槛 |

每个范围必有 `design / hierarchy / finish / usability` 四维；系列追加 `cohesion`，
动画/特效追加 `motion`，地块追加 `tiling`。类型、视图映射见 [视觉准则](visual-quality.md)。
同范围同维度只登记一次，可在 criterion 中列多个检查点。跨类型任务可以拆范围共用视图，
各范围均须全审。每个对照组至少支撑一个同范围的 reference 支柱，不能只摆图不作质量比较。

所有路径相对于冻结候选 evidence 根，使用 `/`；不含 `..`、绝对路径或盘符。`scope.views`
是候选证据，`referenceProfile.evidence` 是参考证据，允许后者包含原图、变换记录及动态
参考，但 `comparisons` 的两侧必须是 `pair` 能解码的 PNG。原图与派生参考都保留，不用
缩略图替代完整原图。视频文件存在不等于已播放，派发与实际查看仍须核实。

### 批次与回收

snapshot 自动产出路径、文件哈希、candidateId、默认 null 预算和空 batches。
补充宿主真实 `participants.orchestrator / participants.builders`，不能编造 ID。
由总控原样回收 critic 输出，结合派发记录填批次，不代写得分。

`evidence/gates.json` 格式：

```json
{"checks":[{"id":"determinism","status":"pass","evidence":["candidate:determinism.json"]}]}
```

checks 必须覆盖 charter.requiredGates；每个结果引用真实命令/输出记录。
该例只示意一个检查，不代表其他门禁已完成。字符串 pass 本身不是测试证据。

每个 `batches[]` 的结构：

```json
{
  "reviewId": "实际唯一批次编号",
  "candidateId": "snapshot 返回值",
  "kind": "formal",
  "evidenceRoot": "相对 record.json 的本批次 evidence 目录",
  "evidenceFiles": {"dispatch.json":"文件 SHA-256", "consumer.json":"文件 SHA-256"},
  "isolation": {"mode":"instruction", "status":"recorded", "evidence":["review:dispatch.json"]},
  "blind": [{"id":"hero-display", "directory":"相对 record.json 的 pair 目录", "reference":"ref.png", "candidate":"render.png", "phase1Hash":"seal 返回值"}],
  "reports": []
}
```

这是字段示例，不是可通过的报告：需要 visual/delivery 两份真实报告和全部支柱。
`reports` 的字段详见 [视觉任务书](critic-visual.md) 和 [交付任务书](critic-delivery.md)。
visual 新增 `holistic / coverage / constraints / blindReconciliation`；reference 支柱按
`qualityRelation` 裁决，requirement 按 `status` 裁决。不得补填裁决让旧报告变成新版。
blind 的两侧整体印象、相对等级和偏好必须分别记录，见 [阶段一任务书](critic-blind.md)。
`blind` 必须逐项覆盖宪章 `comparisons` 冻结的全部对照组，不得只挑一个好看的裁切。
`reference / candidate` 是冻结 evidence 根中的相对 PNG 路径，必须与 pair 输入字节一致。
批次 evidenceFiles 在派发/上下文记录与交付实测证据收齐后，用本模块导出的
`fileHashes(root)` 从真实文件计算，再冻结该目录并回收引用这些证据的最终报告。
报告本身在该目录外，避免自引用。报告可引用 `candidate:<相对路径>` 或
`review:<相对路径>`，不接受越界路径。
区域/帧位置放报告的文字说明中，文件引用只填真实相对文件名。

材料约束记录须包含实际派发文本（白名单与禁止读取指令）、独立上下文 ID 和阶段。
默认 mode=instruction；用户另要求且实际采用权限隔离时可记 enforced。status=recorded
只说明已保存记录，不证明安全隔离；实际污染用 contaminated，不能继续通过检查。
视觉报告必须来自封存阶段一的同一个上下文；两批次与两角色之间必须全新独立。

`check` 复算真实哈希，拒绝宪章/候选变化、门禁失败、错批次、缺席位、复用上下文、
整体美学未通过/整体低档、缺支柱/必需维度低档、独立要求不满足、漏范围/视图/约束、
交付未达分、重大缺陷或缺 MINOR 非阻塞理由、盲比封存或揭盲不符。视觉 score 仅诊断。
检查最后连续两批，不从历史挑两次
好评拼接。输出 `RECORDS_VALID` 只表示记录一致；总控还须核验真实执行、全部覆盖、
材料隔离与来源，才可按协议汇报 WOW。用户停止状态下不通过 check。

## 旧协议只读兼容

0.4.x 的 `pga-loop/1` 记录只用 `<TOOLKIT>/tools/legacy/asset-loop-v1.mjs check <record.json>`
验证。它保留旧版校验语义，只支持 check，不派发、不写入、不创建候选或迁移 WOW。
返回结果明确标记旧协议；旧 `RECORDS_VALID` 不代表满足新版整体美学与同级标准。

新工具拒绝旧协议，不把 protocol 字段改成 `/2` 来规避。正在进行的旧任务选择升级时，
先确认新宪章，保存旧检查点与材料，创建新候选、重新盲比与全量评审，两个旧批次均不继承。
若继续旧流程，需使用其原始已校验工具版本；新包中的历史验证器不能恢复旧制作流程。
