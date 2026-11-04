# signal_stack — 堆叠谱线（XPS/UV-Vis/PL 这类）

- **状态：implemented**
- 来源：editaplot `runtime/templates/signal_stack/`
- 实测日期：2026-11-03
- 实测环境：Origin **10.2502（2025b）**，dsh-origin MCP 76 工具，`origin_status` 握手 `connected: true`

## 实测调用

```
origin_plot_template(template_id="stacked_spectra",
    data={"x": [280..310, 16 点],
          "spectra": {"sample_A": [...], "sample_B": [...], "sample_C": [...]}},
    graph_name="tpl_signal_stack")
```

## 对象层反读（`origin_verify_graph`）

图 `Graph6`；`series_count` = **3**，1 层，偏移 `offsets = {A:0.0, B:104.4, C:208.8}`（`step=104.4`），三色 `#0072B2 / #D55E00 / #009E73`，`y` 标题 `Intensity (a.u.)`；`x` 轴标题 **unreadable**（读回占位符 `% (?X)`）。

## 导出

- 文件：`templates/evidence/signal_stack.png`
- 尺寸：**1200 × 850 px**，28705 bytes（`origin_export(fmt="png", width=1200)`，通道 `save_fig(expGraph)`）
- **仅作通道连通证明，绝不许当成品示例或宣传图**（带 Origin demo 水印）

## 数据

**合成数据**（脚本内联构造），只用于验证通道连通与图元渲染，**不是实验数据**，不得当作示例结果引用。

## 已知问题

- 导出带 Origin **demo 水印**（青色 `demo` 平铺）：本机 Origin 授权状态所致（`C:/ProgramData/OriginLab` 下有 `REGID.lic`，但导出仍按 demo 模式加水印），**与 MCP 通道无关**。交付前必须先确认导出无水印，否则如实告知用户。
- **x 轴标题未设置**：`stacked_spectra` 不自带 x 轴标题，调用方必须补 `origin_edit_axis(axis="x", title=...)`，否则导出图 x 轴无标签。
- 偏移量由数据量程自动算（`step=104.4`），谱线多/量程差大时要显式给 `offset`，否则会挤在一起。
