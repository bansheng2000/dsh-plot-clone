# sankey — 桑基图

- **状态：spec-only**
- 来源：editaplot `runtime/templates/sankey/`
- 实测日期：2026-11-04
- 实测环境：Origin **10.250212（2025b）**，dsh-origin MCP 76 工具，`origin_status` 握手 `connected: true`

## 缺口（gap）

`plotxy` 的 `plot:=106`（`oPlotIDs.h:85` 的 `IDM_PLOT_SANKEY`）**不接受 Source/Target/Value 这种三列布局**，画出来是一片乱填充。本机有 `Sankey.otpu` / `sankeyMap.otpu` 模板，但模板通道会弹模态框。**要补的是插件通道（桑基需要节点-边布局引擎，不只是换个图型代码），不是模板。**

## 探针脚本原文

```
plotxy iy:=([Book4]1!1,[Book4]1!2,[Book4]1!3) plot:=106 ogl:=[<new>]!;
```

## 实测结果：不通过

返回 `readback = 'Graph3'`；导出图是一块黑色填充区域叠加若干白色斜线，节点与流量关系完全没表达出来（不是桑基）。

导出图（失败现场，留档可查）：`templates/evidence/probes/p_sankey`

## 待办

桑基需要先把 Source/Target/Weight 转成节点坐标 + 边曲线，再逐个画；这是**新的布局算法**，不是补一条通道就行。短期保持 spec-only。

## 数据

**合成数据**，只用于验证通道，不是实验数据。
