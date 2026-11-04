# xrd — XRD 三件套

- **状态：implemented**
- 来源：editaplot `runtime/templates/xrd/`
- 实测日期：2026-11-03
- 实测环境：Origin **10.2502（2025b）**，dsh-origin MCP 76 工具，`origin_status` 握手 `connected: true`

## 实测调用

```
origin_plot_template(template_id="xrd_pattern",
    data={"two_theta": [10..80, 36 点],
          "observed": [...], "calculated": [...], "difference": [...]},
    graph_name="tpl_xrd")
```

## 对象层反读（`origin_verify_graph`）

图 `Graph7`；`layer_count` = **2**（`two_layer` 布局），`series_count` = **4**（逐层 `[2, 2]`：主谱 Observed 散点 + Calculated 线，差谱层 2 条），几何 `layer0 13.99/8.00/80.01/60.00` + `layer1 13.99/72.00/80.01/22.00`（%page），层间重叠 **0.0%**；`y` 标题 `Intensity (a.u.)`；`x` 轴标题 **为空（warn）**；图例隐藏。

## 导出

- 文件：`templates/evidence/xrd.png`
- 尺寸：**1200 × 850 px**，34290 bytes（`origin_export(fmt="png", width=1200)`，通道 `save_fig(expGraph)`）
- **仅作通道连通证明，绝不许当成品示例或宣传图**（带 Origin demo 水印）

## 数据

**合成数据**（脚本内联构造），只用于验证通道连通与图元渲染，**不是实验数据**，不得当作示例结果引用。

## 已知问题

- 导出带 Origin **demo 水印**（青色 `demo` 平铺）：本机 Origin 授权状态所致（`C:/ProgramData/OriginLab` 下有 `REGID.lic`，但导出仍按 demo 模式加水印），**与 MCP 通道无关**。交付前必须先确认导出无水印，否则如实告知用户。
- **x 轴标题为空**：XRD 模板不写 `2theta (degree)`，调用方必须补 `origin_edit_axis(axis="x", title="2theta (degree)")`。
- `series_count` 是 4 不是 2：差谱层也画了 2 条，断言时按层累加。
- 本次未传 `phases`（相刻线），`phases: []` 表示没画相刻线；要刻线必须给带物相名的列。
