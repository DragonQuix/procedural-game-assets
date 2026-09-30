# 开发者机械验证

2026-09-30，Windows / Node v22.23.2。仅基础设施自测，不是独立模型实验。

| 验证 | 实际结果 |
|---|---|
| `node .../organizer/self-test.mjs` | 16 tests PASS，0 fail，0 skip（含父测试） |
| `node --test --test-reporter=spec "tests/**/*.test.js"` | 421 tests PASS，0 fail，0 skip |
| 候选材料与 v0.8.0 Git 对象逐文件核验 | PASS；D14 73 文件，A 51 文件 |
| `node tools/release.mjs --check` | 207 个已发行文件哈希一致；未重建产品载荷 |
| Hold-out 静态扫描 | 287 tracked 文件、30 个几何文档、60 个图像指纹、5 个直绘布局、10 份任务文字；无检查范围内重复 |
| 与接手基线 `b3e43cc` 比较产品及历史实验路径 | 无差异 |

16 项统计含一个父测试和 15 个子测试。测试实际走冻结 CLI 的 edit/commit、两臂 observe/submit、
独立冷渲染验收、重复提交拒绝、最终产物篡改检测；每项任务有两个不同的机械合法控制解。
附带真实 9-candidate 超预算反例、物化前拒绝不计数、只存源码不计数、透明 RGB 不制造新候选、
隐藏不透明部件变化计入新语义状态、保护/关系/ownership/确定性反例。

启动负控制覆盖 kit、shared observation、task、起点源篡改，模型身份漂移、未冻结执行与错误 vision hash。
合成 host callback 验证 PASS 前不创建 agent、不暴露任务，创建后再验 context/model/载荷。
reviewer 校验覆盖无效 enum、对象数组 actualViews、纯 schema feedback、同上下文重试及唯一冻结文件。
X/Y 独立 PNG 在镜像呈现时保持字节不变；reviewer 目录为精确 allowlist，key 不落在包中。

## 候选指纹

- manifest SHA256：`a863ed6d371651ad26113ffca1ff9ec0df46a1f0e632ad57f1398fc4ceb062d9`
- D14 toolkit：`b91c035257a79985b9edebe2fb1779831da6d7f049eebbfbc69fd591986cc65f`
- A toolkit：`3b2d59037671c03f521c957a372b657418f7fafbfa7958edd64a60c8df42ec1d`
- shared observation/runtime：`d29c28f9ee5093d6e6515ac2f1cff6b0a4a7ff63b1f00d88691d5556f014e7e7`

候选 manifest 为 CANDIDATE_NOT_RUN，modelIdentity=null、host=null，正式政策未选择。
真实 Vision Gate、真实宿主适配、正式访问隔离和独立 ZCode 审核仍待运行前验证。
本次全部 host/review fixtures 为合成数据，在系统临时目录执行并清理；不构成真实 image model input。
正式 **0 participant runs、0 reviews、0 scored model calls**。
