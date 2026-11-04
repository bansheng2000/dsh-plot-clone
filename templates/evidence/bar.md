# bar — 柱状图（可选误差）

- **状态：implemented**
- 来源：editaplot `runtime/templates/bar/`
- 实测日期：2026-11-03
- 实测环境：Origin **10.2502（2025b）**，dsh-origin MCP 76 工具，`origin_status` 握手 `connected: true`

## 实测调用

```
origin_plot(worksheet=[Book1]Sheet1, plot_type="column",
           x_column="Category", y_columns=["Response"], yerr_column="SD",
           graph_name="tpl_bar")
```

## 对象层反读（`origin_verify_graph`）

图 `Graph1`；`series_count` = **2**（数据柱 1 条 + 误差棒 1 条，verify 把误差棒计为独立 plot），`layer_count` = 1，轴标题 `x=Category` / `y=Response (a.u.)`，字号 14 pt，几何 `left 17.91 / top 11.58 / w 68.16 / h 71.82 (%page)`；10 项检查 9 pass + 1 fail（fail 是我传的 `expected_series=1` 与「误差棒算一条 plot」口径不一致，不是图的问题）。调色板 ocean，主色 `#0072B2`。

## 导出

- 文件：`templates/evidence/bar.png`
- 尺寸：**1200 × 850 px**，30382 bytes（`origin_export(fmt="png", width=1200)`，通道 `save_fig(expGraph)`）
- **仅作通道连通证明，绝不许当成品示例或宣传图**（带 Origin demo 水印）

## 数据

**合成数据**（脚本内联构造），只用于验证通道连通与图元渲染，**不是实验数据**，不得当作示例结果引用。

## 已知问题

- 导出带 Origin **demo 水印**（青色 `demo` 平铺）：本机 Origin 授权状态所致（`C:/ProgramData/OriginLab` 下有 `REGID.lic`，但导出仍按 demo 模式加水印），**与 MCP 通道无关**。交付前必须先确认导出无水印，否则如实告知用户。
- `verify` 的 `series_count` 把误差棒算一条曲线：断言时应按 `数据条数 + 误差棒条数` 给期望值。
