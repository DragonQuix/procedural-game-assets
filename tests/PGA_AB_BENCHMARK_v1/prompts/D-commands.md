# D组命令速查

在本次独立目录运行。工作区已创建，不要再次create。以下值是调用格式示例，不是任务解法；目标ID和数值必须根据当前任务确定。

```bash
node run.mjs studio state
node run.mjs studio inspect
node run.mjs studio inspect --node <实际节点ID>
node run.mjs studio edit --base <当前rN> --op geometry.set --target <实际节点ID> --params '{"w":20}'
node run.mjs studio explore --base <当前rN> --op geometry.set --target <实际节点ID> --field w --values 18,20,22
node run.mjs studio edit --base <当前rN> --op material.set --target <实际节点ID> --material flat
node run.mjs studio edit --base <当前rN> --op ramp.set --target <实际节点ID> --ramp quiet
node run.mjs studio commit --accept <返回的candidateId> --expected-head <当前rN>
node run.mjs studio commit --restore r1 --expected-head <当前rN>
node run.mjs render
node run.mjs submit
```

尖括号不是字面参数。Windows PowerShell、CMD与POSIX shell的JSON引号处理不同；根据宿主正确传递一个完整JSON参数，必要时用本地脚本以argv数组调用run.mjs，保留全部轨迹。

多边形修改：`geometry.set` 的 `--params` 可包含 `vertices`。圆形支持 `cx/cy/rx/ry`。合法操作、范围与材质以inspect的能力声明和toolkit源码为准。

角色改色的格式：
```bash
node run.mjs studio edit --base <当前rN> --op palette.set --target <调色板键> --value <颜色>
```

CLI返回文件路径后必须实际打开图。`render` 只渲染已提交head，不能代替查看未提交候选。候选图请用edit/explore返回的路径；检查版本不要拿错图。

`submit` 只从已提交head提取源文档，使用与A组相同的中性渲染/导出包装。不能靠提交一张手工PNG绕过源资产。
