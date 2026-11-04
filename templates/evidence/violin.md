# violin — 小提琴图

- **状态：spec-only**
- 来源：editaplot `runtime/templates/violin/`
- 实测日期：2026-11-04
- 实测环境：Origin **10.250212（2025b）**，dsh-origin MCP 76 工具，`origin_status` 握手 `connected: true`

## 缺口（gap）

`plotxy` 的 `plot:=` 不按图型 ID 解释小提琴：传 `263`（`oPlotIDs.h:283` 的 `IDM_PLOT_SPLIT_VIOLIN`）画出的是**误差棒**，不是小提琴。Origin 自带模板 `HalfViolin.otpu` / `Marginal_Violin.otpu` 确实存在，但模板通道（`win -t plot`）会弹模态框卡死 COM（2026-11-03 实测，进程 pid 21828 只能 taskkill）。**要补的是插件通道（一条不弹框的小提琴通道），不是模板。**

## 探针脚本原文

```
plotxy iy:=([Book1]1!2,[Book1]1!3,[Book1]1!4) plot:=263 ogl:=[<new>]!;
```

## 实测结果：不通过

返回 `ok: true, executed: true, readback = 'Graph1'`，但导出图是 **4 个类别位置上的误差棒**（带帽竖线），没有小提琴轮廓、没有分布密度。

导出图（失败现场，留档可查）：`templates/evidence/probes/p_violin`

## 待办

若要走通，需在插件侧加一条「按模板建图 + 不弹框」的通道（例如直接 COM 调 `CreateGraph` 指定模板名，绕开 `win -t plot` 的对话框）；在那之前保持 spec-only。

## 数据

**合成数据**，只用于验证通道，不是实验数据。
