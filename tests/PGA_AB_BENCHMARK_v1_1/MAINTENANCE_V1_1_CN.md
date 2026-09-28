# v1.1 维护说明：修正 crash-retry 的注入阶段，不改变实验

## 一、这是什么

这是 PGA A/D 实验包的维护版本，不是项目业务代码补丁，不是新的素材集，也不是模型实验成绩。
请解压成独立目录 `PGA_AB_BENCHMARK_v1_1`。不要覆盖旧实验包、旧 NOT_READY 报告、项目源码或已生成的 trial。

最新项目的独立核验见 `LATEST_REVIEW_AND_NEXT_STEPS_CN.md`。
原 v1 的失败报告保留，新验证报告另存于 `evidence/latest-fixed-review/`。

## 二、为何需要适配

新项目的台账流程为 `pending → effect → done`。
旧探针将 `_writeLedger` 整体替换成必抛异常，于是首次故障发生在 pending 写入之前，提交效果尚未执行。
第一次重试是首次成功执行，不带 `idempotentReplay: true`；第二次才是读取已经完成的结果，带该标记。
两次业务效果相同，但旧探针对整个返回对象做相等比较，误将合理的诊断差异判成失败。

源码依据（上传最新快照）：
- `src/adapters/studio-store.js:301–333`：先 pending，变更成功后 done。
- `src/adapters/studio-store.js:343–367`：已发生效果的恢复与无效果的前滚。
- `tests/integration/studio-review.test.js:165–190`：效果落盘后 done 失败。
- 同文件 `:211–224`：pending 写入前失败。

旧 FAIL 不会被删掉或人工改成 PASS。适配后的预检必须实际重跑。

## 三、具体变化

保留 9 项顶层探针，`crash-retry` 内拆成两个必须同时通过的子场景：
1. `before-effect`：仅在 pending 写入前注入失败。确认 head、修订和本请求台账不变；重开后执行一次并提交 r2，再次重试只读取原结果。
2. `after-effect`：仅在 done 写入前注入失败。确认 r2 与 head 已落盘、请求仍 pending；重开后恢复同一结果，不能错误报 STALE_REVISION，不能产生 r3。

两者均核对故障确实命中目标阶段、持久化状态、原历史文件 SHA-256、同一修订与父修订、目标文档、重渲染 RGBA 与关键元数据、业务结果、台账状态及修订/head写入调用次数。
只有明确允许变化的 `idempotentReplay` 单独断言，其余业务字段仍完整比较。
目标钩子未命中或 API 不兼容记 UNVERIFIED；断言被违反记 FAIL。

新增两个负向自检，故意在隔离工作区模拟“恢复失败”和“历史被改写”，确认适配器仍检出问题。它们不修改项目源文件。

## 四、没有改什么

`public/`、`fixtures/`、`runner/`、`prompts/`、`protocol/`、`organizer/controls/` 逐字节保持 v1 一致。
prepare/evaluate/blind/self-test/build-materials 也没有修改。
没有运行 build-materials，没有重建或挑选新基线，没有改变六项任务、预算、参试提示词、盲评或评分规则。
详见 `FROZEN_MATERIALS_V1.json`。上游原清单保存在 `UPSTREAM_V1_SHA256SUMS.json`；本版本文件清单为新的 `SHA256SUMS.json`。

## 五、实际复验命令

从本 v1.1 包根目录执行，使用真实项目路径和全新的输出目录：

```text
node organizer/preflight.mjs --repo <项目目录> --out <新的预检目录> --run-tests
node organizer/self-test.mjs --repo <项目目录> --out <新的自检目录>
```

维护探针自身的两个负向控制可选复验：

```text
node organizer/adapter-self-test.mjs --repo <项目目录> --out <新的适配器自检目录>
```

Windows 本地目录与当前附带报告中的 Linux 审查路径不同；附带报告是证据，不代表你已在本机运行。
正式 scored 材料必须使用本机新生成、匹配实际源码指纹的 readiness.json。

## 六、适用边界

这证明所测两类写入异常后的重开/重试行为，不证明断电、文件系统落盘语义或全部并发场景。
READY_TECHNICAL 是技术预检通过，不代表宿主已看图、smoke 已执行、美术已达标或 Studio 已被证明优于 A 组。
