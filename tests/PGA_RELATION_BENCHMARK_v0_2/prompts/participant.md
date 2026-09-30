# 资产重构任务

先阅读 task/TASK.md、task/task-contract.json，并实际查看 task/baseline.native.png 与
task/baseline.display.png。使用本试次 kit 中的 Studio CLI，完整合同见 kit/docs/studio-cli.md。
起始文档为 start.studio.json。工作区放在 ws/，最终提交放在 submit/。

自行选择操作，不要求调用某种 API。两组 final requirement 相同。最多 6 个物化候选；
未物化图像的 validation probe 与 relation evaluation probe 单独计数，不占候选预算。
所有候选和提交必须可重放；不得改写 kit、shared、task、起始文档或工作区内部记录。
候选身份使用工具返回的 candidate ID，不得由展示位置代替。

用共同观察入口 `node shared/observe.mjs --trial . --out observations/01` 查看已提交修订；
观察候选加 `--candidate <candidateId>`。新观察使用新目录，不覆盖旧证据。
观察含 baseline/native/upscaled/target crop/diff/contact sheet；以标签 A/B 或 candidate ID 引用。

完成后使用 Studio submit 导出，报告 final revision、候选 ID、提交目录、未满足要求及错误重试。
只在当前试次目录工作；不读取其它试次、主持人材料、源码仓库、盲 key 或控制解。
