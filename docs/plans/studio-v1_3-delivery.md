# Studio v1.3 窄范围交付

术语/边界来源：`../../CONTEXT.md`、`../PLAN.md`、ADR-0001/0002/0008–0012；当前无 CONTEXT-MAP.md。
实现者以这些文档为准，不恢复 Godot 首版要求，不新增 GUI、第二套 raster 或通用求解器。

| v1.2 真实问题 | 本轮修改 | 回归依据 |
|---|---|---|
| T05 operation footprint 允许最终 y=38 描边 | /3 资产级合同、最终 RGBA 比较，candidate/commit/export 强制 | studio-contract 单元+集成，27px exact bounds；伪造候选 OK 仍拒绝 |
| T02 手配 x/w、y/h 进入非法空间 | 三个矩形语义操作和修订 safe domain | studio-geometry-safe、studio-safe、v13 CLI 全链路 |
| 单字段 schema range 非当前可行域 | 有限枚举、真实编译、异常诊断、不连续集合、过期身份拒绝 | 已知 exact range、孔洞域、离散域、空域、搜索限额 |
| 观察信息与工具能力混杂 | 普通 frame 的共享观察层，无编辑副作用 | frame-observation、studio-observation |
| 动画未播放却通过、enum 自报 fallback | 独立新 harness，不改原数据 | benchmark-review、benchmark-isolation，旧 reviewer 自检 |

版本区分：工具包 semver=0.7.0，产品改进轮次=Studio v1.3，文档 schema=pga-studio/3，
保护 schema=pga-protection/1。三者不是同一个版本号。

safe domain 当前无缓存，有限枚举单变量条件域，默认 512 / 硬上限 1024，另有像素工作量限制。
探针不向模型输出候选图或审美排名，候选数与 validationProbeCount 分开；没有等算力保证。
geometry 多字段请求只作点检查，不解最近合法元组。poly/disc/character 语义 resize 不支持；
角色合同未扩展；已有扁平模型没有依赖边，不由名字推断关系。

新实验草案 `tests/PGA_CONSTRAINT_BENCHMARK_v0_1/`：12 runs，D12 真实旧源码、D13 逐文件快照，
新 hold-out 与两个主持人机械可行解。共享观察、candidate budget=6、镜像双评审、分离两类 primary。
状态 DRAFT_NOT_RUN，不含 run/review/result。Go 条件提前写定，但模型/宿主、共同 runner 与
宿主输入关联验证尚待正式冻结；不是立即可开的 scored 批次。

发行仅更新开发仓库普通技能载荷，循环载荷只校验不升级。用户级安装与共享发现入口不改动。
