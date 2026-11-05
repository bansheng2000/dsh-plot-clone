# histogram — 直方分布图

- **状态：implemented**
- 来源：editaplot `runtime/templates/histogram/`（Apache-2.0，契约按本 skill 字段重写）
- 实测日期：2026-11-05
- 实测环境：Origin 10.2502（2025b），dsh-origin MCP，`origin_status` → `connected: true`、`session_mode: attach`

## 实测调用

```
origin_figure(data_source=".probe/data/histogram.csv", plot_type="histogram", x_column="Measurement (a.u.)", width=1800)
```

## 对象层反读

图 `Graph5`；`series_count` = **1**；`origin_verify_graph` 10 项检查全 pass（graph_exists / window_context / layer_count / series_count / axis_x_title / axis_y_title / x_title_font_pt / y_title_font_pt / layer0_geometry / legend）。

## 导出

- PNG：`templates/evidence/histogram.png`，**1800 × 1276 px**，22501 bytes（通道 `save_fig(expGraph)`）
- PDF：`.probe/deliver/histogram.pdf`，20025 bytes（不放仓库；交付时按需重导）
- OPJU：`.probe/deliver/histogram.opju` —— **不是单模板工程**，是本次 20 个模板共用的工程快照（`.probe/deliver/all-templates.opju`，498988 bytes）按 id 复制，内容含全部 20 页
- 校验：`verify_deliverable.py templates/evidence/histogram.png .probe/deliver/histogram.pdf .probe/deliver/histogram.opju --min-width 1800` → **rc=0**，6 项全 PASS（file×3 / basename / width 1800 px / watermark `mask 0 px`）

## 数据

合成样例：300 个 N(0,1) + 200 个 N(4.5,1.4) 抽样（`.probe/data/histogram.csv`）。**合成样例，不是实验数据**，只用于验证通道能画出该图型，不得当示例结果引用。

## 能否支撑这个模板

能支撑：双峰分布直方图，零基线自动强制、单序列自动隐图例。

## 已知差量

- bin 数走引擎默认，未手控
