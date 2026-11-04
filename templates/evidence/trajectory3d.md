# trajectory3d — 3D 轨迹图

- **状态：spec-only**
- 来源：editaplot `runtime/templates/trajectory3d/`
- 实测日期：2026-11-04
- 实测环境：Origin **10.250212（2025b）**，dsh-origin MCP 76 工具，`origin_status` 握手 `connected: true`

## 缺口（gap）

3D 线图在 LabTalk 里**静默无操作**：`plotxyz iy:=[Book3]1!(1,2,3) plot:=240`（`oPlotIDs.h:248` 的 `IDM_PLOT_3D_LINE`）返回 `executed: true` 却**一个页面都没新建**（`origin_list_pages` 前后都是 Graph1/Graph2）。现有 typed 通道只有 `origin_plot3d` 的 `surface` / `scatter`，没有 3D 折线。**要补的是插件通道（3D 线），不是模板。**

## 探针脚本原文

```
plotxyz iy:=[Book3]1!(1,2,3) plot:=240 ogl:=[<new>]!;
```

## 实测结果：不通过

返回 `ok: true, executed: true, readback = 'Graph2'`（仍是调用前的活动页）；随后 `origin_list_pages` 只有 Graph1、Graph2 两个图页，**没有新图**。这是 LabTalk 的典型静默失败：不报错、不干活。

导出图（失败现场，留档可查）：`templates/evidence/probes/-`

## 待办

要 3D 轨迹，只能用 `origin_plot3d(scatter)` 画散点云（丢掉连线语义），或补一条 COM 直建的 3D 线通道。

## 数据

**合成数据**，只用于验证通道，不是实验数据。
