# radar — 雷达图

- **状态：spec-only**
- 来源：editaplot `runtime/templates/radar/`
- 实测日期：2026-11-04
- 实测环境：Origin **10.250212（2025b）**，dsh-origin MCP 76 工具，`origin_status` 握手 `connected: true`

## 缺口（gap）

`plotxy` 的 `plot:=192`（`oPlotIDs.h:163` 的 `IDM_PLOT_POLAR`）没有产生极坐标/雷达布局，画出来是**普通 XY 折线**。本机有 `Radar.otpu` 模板，但同样只能走模板通道，而模板通道会弹模态框。**要补的是插件通道（雷达图型），不是模板。**

## 探针脚本原文

```
plotxy iy:=([Book2]1!2,[Book2]1!3) plot:=192 ogl:=[<new>]!;
```

## 实测结果：不通过

返回 `readback = 'Graph2'`；导出图 X 轴是 `S1`、Y 轴是 `S2` 的**直角坐标折线**，网格是方形，不是雷达的多边形网格。

导出图（失败现场，留档可查）：`templates/evidence/probes/p_radar`

## 待办

同上：需要一条不弹框的雷达通道（COM 直建模板图 + 设极坐标轴）。

## 数据

**合成数据**，只用于验证通道，不是实验数据。
