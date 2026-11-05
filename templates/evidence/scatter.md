# scatter — 散点图

- **状态：implemented**
- 来源：editaplot `runtime/templates/scatter/`
- 实测日期：2026-11-03
- 实测环境：Origin **10.2502（2025b）**，dsh-origin MCP 76 工具，`origin_status` 握手 `connected: true`

## 实测调用

```
origin_plot(worksheet=[Book3]Sheet1, plot_type="scatter",
           x_column="Strain_pct", y_columns=["Stress_MPa"],
           graph_name="tpl_scatter")
```

## 对象层反读（`origin_verify_graph`）

图 `Graph3`；**10/10 全 pass**：`series_count` = 1，1 层，轴标题 `x=Strain (%)` / `y=Stress (MPa)`，字号 14 pt，几何正常，图例可见。

## 导出

- 文件：`templates/evidence/scatter.png`
- 尺寸：**1800 × 1276 px**，25180 bytes（`origin_export(fmt="png", width=1800)`，通道 `save_fig(expGraph)`）
- **2026-11-05 重出**：水印已清（`mask 0 px / bands 0`）；仍为**合成数据**验证图，不是实验示例
- PDF/OPJU：`.probe/deliver/scatter.pdf`（22545 bytes）/ `.probe/deliver/scatter.opju`（本次 9 张共用的工程快照 `.probe/deliver/all-watermark-fix.opju`，334274 bytes 按 id 复制）
- 校验：`verify_deliverable.py templates/evidence/scatter.png .probe/deliver/scatter.pdf .probe/deliver/scatter.opju --min-width 1800` → **rc=0**，6 项全 PASS

## 数据

**合成数据**（脚本内联构造），只用于验证通道连通与图元渲染，**不是实验数据**，不得当作示例结果引用。

## 水印复检（2026-11-05）

- 重出前：`watermark_report` 判定 **is_watermark = true**（青色 `demo` 平铺，历史产物）
- 重出后：`mask 0 px, bands 0, acf 0.00` → **不是水印**；尺寸 **1800 × 1276 px**，与其余证据图一致
- 没有裁边、没有降分辨率

## 已知问题

- 无其他问题（本批唯一 10/10 全通过的）。
