# bland_altman — Bland–Altman 一致性图

- **状态：spec-only**
- 来源：editaplot `runtime/templates/bland_altman/`（Apache-2.0，契约按本 skill 字段重写）
- 实测日期：2026-11-05
- 实测环境：Origin 10.2502（2025b），dsh-origin MCP，`origin_status` → `connected: true`、`session_mode: attach`

## 实测调用

```
origin_figure(data_source=".probe/data/bland_altman.csv", plot_type="scatter", x_column="Mean of two methods", y_columns=["Difference (A - B)"], width=1800)
```

## 对象层反读

图 `Graph7`；`series_count` = **1**；`origin_verify_graph` 10 项检查全 pass（graph_exists / window_context / layer_count / series_count / axis_x_title / axis_y_title / x_title_font_pt / y_title_font_pt / layer0_geometry / legend）。

## 导出

- PNG：`templates/evidence/failed/bland_altman.png`，**1800 × 1276 px**，32293 bytes（通道 `save_fig(expGraph)`）
- PDF：`.probe/deliver/bland_altman.pdf`，33874 bytes（不放仓库；交付时按需重导）
- OPJU：`.probe/deliver/bland_altman.opju` —— **不是单模板工程**，是本次 20 个模板共用的工程快照（`.probe/deliver/all-templates.opju`，498988 bytes）按 id 复制，内容含全部 20 页
- 校验：`verify_deliverable.py templates/evidence/failed/bland_altman.png .probe/deliver/bland_altman.pdf .probe/deliver/bland_altman.opju --min-width 1800` → **rc=0**，6 项全 PASS（file×3 / basename / width 1800 px / watermark `mask 0 px`）

## 数据

合成样例：80 对配对测量，A/B 同真值加不同噪声（`.probe/data/bland_altman.csv`）。**合成样例，不是实验数据**，只用于验证通道能画出该图型，不得当示例结果引用。

## 能否支撑这个模板

不能支撑：散点（Mean vs Difference）能画，但模板数据契约要求 5 列（`mean/difference/bias/loa_lower/loa_upper`），图上必须有偏倚线与 ±1.96 SD 一致性界限；本轮允许通道只有 scatter，没有参考线通道（`origin_add_line` 不在本轮清单）。

## 已知差量

- 缺的是这张图的判读依据（LoA 线），不是样式，所以不标 implemented
