# dual_y — 双 Y 轴

- **状态：implemented**
- 来源：**native**（本 skill 原生模板；editaplot 47 个模板里没有 dual_y 这个 id）
- 实测日期：2026-11-03
- 实测环境：Origin **10.2502（2025b）**，dsh-origin MCP 76 工具，`origin_status` 握手 `connected: true`

## 实测调用

```
origin_plot_template(template_id="dual_y",
    data={"x": [1..10], "left": [...], "right": [...]},
    graph_name="tpl_dual_y")
```

## 对象层反读（`origin_verify_graph`）

图 `Graph9`；实际用到的 Origin 模板是 **`doubley`**（`template_used: "doubley"`，按 `dualy->doubley->righty` 顺序探测）；`layer_count` = 2，`series_count` = **2**（逐层 `[1, 1]`），两层几何完全相同 → 层重叠 **100%**（双 Y 共享绘图区的正常形态，`verify` 的 warn 已说明）；`y` 标题 `Left`，`x` 轴标题 **unreadable**。

## 导出

- 文件：`templates/evidence/dual_y.png`
- 尺寸：**1200 × 850 px**，33968 bytes（`origin_export(fmt="png", width=1200)`，通道 `save_fig(expGraph)`）
- **仅作通道连通证明，绝不许当成品示例或宣传图**（带 Origin demo 水印）

## 数据

**合成数据**（脚本内联构造），只用于验证通道连通与图元渲染，**不是实验数据**，不得当作示例结果引用。

## 已知问题

- 导出带 Origin **demo 水印**（青色 `demo` 平铺）：本机 Origin 授权状态所致（`C:/ProgramData/OriginLab` 下有 `REGID.lic`，但导出仍按 demo 模式加水印），**与 MCP 通道无关**。交付前必须先确认导出无水印，否则如实告知用户。
- **双 Y 的轴标题必须显式给**：左轴读回 `Left`、右轴默认 `Right`，都是列名而不是物理量；`x` 轴标题未设置。要用 `origin_edit_axis(axis="y")` + `axis="y2"` 分别写。
- 100% 层重叠是正常形态，`origin_verify_graph` 需传 `allow_full_overlap=true` 才不报 warn。
- Origin 2025b 上 `dualy` 不存在，走的是 `doubley`；换机器可能落到 `righty`，行为一致但模板名不同。
