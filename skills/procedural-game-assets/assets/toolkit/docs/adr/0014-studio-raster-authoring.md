# ADR-0014：Agent 看图驱动的单帧位图创作

日期：2026-09-30。状态：实施（Studio v1.5 alpha，尚非通用临摹质量认证）。

术语与边界以 `../../CONTEXT.md` 为准；当前没有 CONTEXT-MAP.md。
方向来自 `../plans/studio-reference-translation.md`；延续 ADR-0001/0002/0004/0008/0009，
不改变 ADR-0005 的模板边界或 ADR-0006/0007 的循环合同。

## 决定

- 新增 `pga-studio/raster/1`，单帧、边长 1..256、二值 alpha。
  空白创建或 PNG 导入后保存规范化十六进制 RGBA、最终画布尺寸、锚点、附件点和 constraints。
  全透明像素 RGB 统一为 0，保证现有图集写入与源帧逐字节往返；不静默阈值化半透明。
- 首版把像素内嵌到文档，不实施草案中的外部内容寻址资源仓库。
  有界小图的文档体积可接受，可直接复用现有不可变修订、候选推导、幂等、恢复和自包含导出。
  大图、图层和动画需求出现后再决定是否引入资源包；不可拿隐式本机缓存代替可携带源。
- `raster.draw` 使用 pixel/rect/line/poly，最多 128 条指令、每个 poly 最多 128 顶点。
  每次先声明稳定 ID 的矩形选区和可选二值掩码；指令坐标相对选区矩形，绘制越界报错。
  mask=0 的像素保留，color=null 擦除。允许影响区域独立于实际差分计算。
- `raster.replace` 冻结输入像素后替换选区，包括 alpha=0。文件解码在 IO 层，
  PNG 路径不进入操作或文档；删除原输入文件后仍可重放候选和恢复修订。
- `raster.metadata` 显式修改 anchor 或 attachments；像素不变。
  metadata 保护和全画布像素保护可使用既有 constraints/preserve，非法或未实现类别明确拒绝。
  位图首版没有跨修订的区域冻结合同，`protection` 返回 NOT_CONFIGURED；局部修改保护不是全局保护。
- 编译使用 PixelPainter、assembleFrame（outline=null）、assembleAsset，`kind='raster'`。
  最终尺寸不扩边；CanvasBank、图集和 manifest 保持既有格式，无按 recipe.kind 分派的新增需求。
  源文档不包含模型服务、原图路径、运行时代码或联网行为。
- Agent 自己查看 native/display、明暗背景、剪影、选区和候选差分，决定下一次操作。
  Studio 不做自动身份判断，`visualReview=UNVERIFIED` 不能被技术 PASS 自动提升。
  有参考时区分角色身份、画风和质量标杆，不默认把用户要求临摹的角色改成原创身份。

## 边界与取舍

PNG 首版只导入目标尺寸候选，边长不得超过 256，文件不得超过 4 MiB；
半透明、动画、ICC/EXIF/非默认 gamma 等需显式外部预处理，不能宣称已支持全部 PNG 语义。
原始设计图供 agent 看图，可以大于此限制，不要求先导入它才能临摹。

不做自动缩放、量化、去背、风格迁移、任意图层、动画或位图 explore。
不要求外部图像生成器；不更换旧文档的绘制行为；普通技能载荷由 release 生成，
循环版和用户级安装不随动。用户角色样图保存在 work，不写入通用模板或技能默认题材。
