# Studio v1.3 真实演示证据

工程目标：验证最终保护合同、联动几何、safe domain 和观察/提交链路。
两份资产为本轮新建，不复用 v1.2 正式实验资产，也不作为下一轮 hold-out。
没有标杆或独立视觉评审；不把工程 PASS 解释为商业美术或 agent 收益。

实际成功命令（Windows Node v22.23.2）：

```powershell
node examples/studio/v13-demo.mjs --out work/studio-v13-demo-final --evidence docs/evidence/studio-v1_3
```

脚本拒绝复用已有 workspace；复现时使用新的 --out 目录。
结果：demoA=PASS、demoB=PASS；真正执行 inspect/edit/explore/commit/submit，写出真实 PNG。

## A：港口压缩机

`A-evidence.json`：完整修订域、非法低层 h=28 的提前拒绝与邻近合法建议，
居中增宽 deltaWidth=8、保底缩短 deltaHeight=-8、同基准 [-2,0,2] 三候选探索，
最终 r4 / PASS。主体从 x=13,y=7,w=20,h=26 到 x=8,y=15,w=30,h=18，
中心 x=23、底缘 y=33，底座/仪表区域、anchor 与 attachments 保持。

`A/contact-sheet.display.png` 为前后对比；`A-candidates/` 为 r3 上三候选及基准，
每项 PNG 索引与 observation.json 的 candidate ID 对应，包含 crop 与 diff。

初次开发运行的合同正确捕获 disc 透明角背景的 1px 分带变化；在新演示文档中增加固定
仪表边框后再创建全新工作区，没有放宽保护 mask、修改引擎判据或抹掉旧失败工作区。

## B：潮汐保险柜

`B-evidence.json`：先移动底座到 y=25，最终边界产生违规，REJECTED_UNSAFE、无 candidate；
证据含实际 changedPixelCount/changedBounds。随后围绕 bottom-center 把主体由
10×15 改为 14×18，commit r2 并 submit，最终保护 PASS。

`B/contact-sheet.display.png` 为前后对比。两组图均为真实 RGBA 的 4x 最近邻观察，
overlay 只在诊断 PNG 中，最终 asset 不含它。实施者实际打开并查看了 A/B 前后图，
只确认示意图中比例变化可见，未进行独立视觉准出。
