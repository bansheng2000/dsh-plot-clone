# forest — 森林图

- **状态：implemented**
- 来源：editaplot `runtime/templates/forest/`
- 实测日期：2026-11-03
- 实测环境：Origin **10.2502（2025b）**，dsh-origin MCP 76 工具，`origin_status` 握手 `connected: true`

## 实测调用

```
origin_plot_template(template_id="forest",
    data={"labels": ["Age","Sex","BMI","Smoking","HbA1c"],
          "effect": [1.24,1.11,1.35,1.62,1.08],
          "ci_low": [1.05,0.92,1.12,1.28,0.96],
          "ci_high": [1.47,1.34,1.63,2.05,1.22]},
    graph_name="tpl_forest")
```

## 对象层反读（`origin_verify_graph`）

图 `Graph8`；`series_count` = **3**（效应量点 + CI 横线 + 零参考线），`labels_placed` = **5**（5 个研究名逐行标注），`zero = 0.0`，轴标题 `x=Effect size` / `y=Effect`，字号 14 pt，图例可见（仅效应量行）。

## 导出

- 文件：`templates/evidence/forest.png`
- 尺寸：**1200 × 850 px**，23247 bytes（`origin_export(fmt="png", width=1200)`，通道 `save_fig(expGraph)`）
- **仅作通道连通证明，绝不许当成品示例或宣传图**（带 Origin demo 水印）

## 数据

**合成数据**（脚本内联构造），只用于验证通道连通与图元渲染，**不是实验数据**，不得当作示例结果引用。

## 已知问题

- 导出带 Origin **demo 水印**（青色 `demo` 平铺）：本机 Origin 授权状态所致（`C:/ProgramData/OriginLab` 下有 `REGID.lic`，但导出仍按 demo 模式加水印），**与 MCP 通道无关**。交付前必须先确认导出无水印，否则如实告知用户。
- 效应量是**比值型**（1.24 这类），零参考线画在 `x=0`，但比值型图的参考线应在 `x=1`：本次实测 `zero=0.0`，需要时用 `origin_add_line(at=1, orientation="vertical")` 另画一条并说明。
- 5 个标签是逐行 `origin_annotate` 放的，标签多了会挤；超过约 15 项要改用图例或缩字号。
