# multi_panel — 多面板纵向堆叠

- **状态：implemented**
- 来源：**native**（本 skill 原生模板；editaplot 47 个模板里没有 multi_panel 这个 id）
- 实测日期：2026-11-03
- 实测环境：Origin **10.2502（2025b）**，dsh-origin MCP 76 工具，`origin_status` 握手 `connected: true`

## 实测调用

```
origin_plot_template(template_id="multi_panel",
    data={"x": [1..12], "panels": {"panel_a": [...], "panel_b": [...]}},
    graph_name="tpl_multi_panel")
```

## 对象层反读（`origin_verify_graph`）

图 `Graph10`；`layer_count` = 2，`series_count` = **2**（逐层 `[1, 1]`），几何 `layer0 13.99/8.00/80.01/41.49` + `layer1 13.99/52.50/80.01/41.49`（%page），层间重叠 **0.0%**（层间已去重叠）；`y` 标题 = **`panel_a`**（取了第一个面板名，不是物理量）；`x` 轴标题 **为空（warn）**；图例可见。

## 导出

- 文件：`templates/evidence/multi_panel.png`
- 尺寸：**1200 × 850 px**，27067 bytes（`origin_export(fmt="png", width=1200)`，通道 `save_fig(expGraph)`）
- **仅作通道连通证明，绝不许当成品示例或宣传图**（带 Origin demo 水印）

## 数据

**合成数据**（脚本内联构造），只用于验证通道连通与图元渲染，**不是实验数据**，不得当作示例结果引用。

## 已知问题

- 导出带 Origin **demo 水印**（青色 `demo` 平铺）：本机 Origin 授权状态所致（`C:/ProgramData/OriginLab` 下有 `REGID.lic`，但导出仍按 demo 模式加水印），**与 MCP 通道无关**。交付前必须先确认导出无水印，否则如实告知用户。
- **y 轴标题被设成第一个面板名**（`panel_a`）：多面板每层应有各自量纲，必须逐层 `origin_edit_axis(layer=N, title=...)` 覆盖。
- **x 轴标题为空**：模板不写，需显式补。
- 面板数受数据份数限制；面板多了每层高度按 `41.5%` 均分，超过 4 个要改几何。
