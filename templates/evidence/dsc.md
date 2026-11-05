# dsc — DSC 差示扫描量热

- **状态：implemented**
- 来源：editaplot `runtime/templates/dsc/`（Apache-2.0，契约按本 skill 字段重写）
- 实测日期：2026-11-05
- 实测环境：Origin 10.2502（2025b），dsh-origin MCP，`origin_status` → `connected: true`、`session_mode: attach`

## 实测调用

```
origin_figure(data_source=".probe/data/dsc.csv", plot_type="line", x_column="Temperature (degC)", y_columns=["Heat flow (mW/mg)"], width=1800)
```

## 对象层反读

图 `Graph17`；`series_count` = **1**；`origin_verify_graph` 10 项检查全 pass（graph_exists / window_context / layer_count / series_count / axis_x_title / axis_y_title / x_title_font_pt / y_title_font_pt / layer0_geometry / legend）。

## 导出

- PNG：`templates/evidence/dsc.png`，**1800 × 1276 px**，29512 bytes（通道 `save_fig(expGraph)`）
- PDF：`.probe/deliver/dsc.pdf`，31260 bytes（不放仓库；交付时按需重导）
- OPJU：`.probe/deliver/dsc.opju` —— **不是单模板工程**，是本次 20 个模板共用的工程快照（`.probe/deliver/all-templates.opju`，498988 bytes）按 id 复制，内容含全部 20 页
- 校验：`verify_deliverable.py templates/evidence/dsc.png .probe/deliver/dsc.pdf .probe/deliver/dsc.opju --min-width 1800` → **rc=0**，6 项全 PASS（file×3 / basename / width 1800 px / watermark `mask 0 px`）

## 数据

合成样例：300 点，180 °C 高斯吸热峰叠基线（`.probe/data/dsc.csv`）。**合成样例，不是实验数据**，只用于验证通道能画出该图型，不得当示例结果引用。

## 能否支撑这个模板

能支撑：温度扫描 DSC 曲线（180 °C 吸热峰，30→280 °C）。

## 已知差量

- 热流轴正负方向未在图上特别标注（吸热向下）
- 标题 `Heat flow (mW/mg)` 被小写化为 `Heat flow (mw/mg)`
