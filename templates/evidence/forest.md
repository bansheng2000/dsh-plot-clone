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
- 尺寸：**1800 × 1276 px**，24245 bytes（`origin_export(fmt="png", width=1800)`，通道 `save_fig(expGraph)`）
- **2026-11-05 重出**：水印已清（`mask 0 px / bands 0`）；仍为**合成数据**验证图，不是实验示例
- PDF/OPJU：`.probe/deliver/forest.pdf`（24025 bytes）/ `.probe/deliver/forest.opju`（本次 9 张共用的工程快照 `.probe/deliver/all-watermark-fix.opju`，334274 bytes 按 id 复制）
- 校验：`verify_deliverable.py templates/evidence/forest.png .probe/deliver/forest.pdf .probe/deliver/forest.opju --min-width 1800` → **rc=0**，6 项全 PASS

## 数据

**合成数据**（脚本内联构造），只用于验证通道连通与图元渲染，**不是实验数据**，不得当作示例结果引用。

## 水印复检（2026-11-05）

- 重出前：`watermark_report` 判定 **is_watermark = true**（青色 `demo` 平铺，历史产物）
- 重出后：`mask 0 px, bands 0, acf 0.00` → **不是水印**；尺寸 **1800 × 1276 px**，与其余证据图一致
- 没有裁边、没有降分辨率

## 已知问题

- 效应量是**比值型**（1.24 这类），零参考线画在 `x=0`，但比值型图的参考线应在 `x=1`：本次实测 `zero=0.0`，需要时用 `origin_add_line(at=1, orientation="vertical")` 另画一条并说明。
- 5 个标签是逐行 `origin_annotate` 放的，标签多了会挤；超过约 15 项要改用图例或缩字号。
