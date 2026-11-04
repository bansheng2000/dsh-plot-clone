# line_error — 折线 + 误差棒

- **状态：implemented**
- 来源：editaplot `runtime/templates/line_error/`
- 实测日期：2026-11-03
- 实测环境：Origin **10.2502（2025b）**，dsh-origin MCP 76 工具，`origin_status` 握手 `connected: true`

## 实测调用

```
origin_plot(worksheet=[Book2]Sheet1, plot_type="line",
           x_column="Time_min", y_columns=["Signal"], yerr_column="SEM",
           graph_name="tpl_line_error")
```

## 对象层反读（`origin_verify_graph`）

图 `Graph2`；`series_count` = **2**（折线 + 误差棒），1 层，轴标题 `x=Time (min)` / `y=Signal (a.u.)`，字号 14 pt，几何同 `bar` 模板。

## 导出

- 文件：`templates/evidence/line_error.png`
- 尺寸：**1200 × 850 px**，25307 bytes（`origin_export(fmt="png", width=1200)`，通道 `save_fig(expGraph)`）
- **仅作通道连通证明，绝不许当成品示例或宣传图**（带 Origin demo 水印）

## 数据

**合成数据**（脚本内联构造），只用于验证通道连通与图元渲染，**不是实验数据**，不得当作示例结果引用。

## 已知问题

- 导出带 Origin **demo 水印**（青色 `demo` 平铺）：本机 Origin 授权状态所致（`C:/ProgramData/OriginLab` 下有 `REGID.lic`，但导出仍按 demo 模式加水印），**与 MCP 通道无关**。交付前必须先确认导出无水印，否则如实告知用户。
- 同 `bar`：误差棒计入 `series_count`。
