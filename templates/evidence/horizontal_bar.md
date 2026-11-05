# horizontal_bar — 横向分组条形图

- **状态：spec-only**
- 来源：editaplot `runtime/templates/horizontal_bar/`（Apache-2.0，契约按本 skill 字段重写）
- 实测日期：2026-11-05
- 实测环境：Origin 10.2502（2025b），dsh-origin MCP，`origin_status` → `connected: true`、`session_mode: attach`

## 实测调用

```
origin_figure(data_source=".probe/data/horizontal_bar.csv", plot_type="bar", x_column="Treatment", y_columns=["Responder", "Non-responder"], width=1800)
```

## 对象层反读

图 `Graph4`；`series_count` = **1**；`origin_verify_graph` 10 项检查全 pass（graph_exists / window_context / layer_count / series_count / axis_x_title / axis_y_title / x_title_font_pt / y_title_font_pt / layer0_geometry / legend）。

## 导出

- PNG：`templates/evidence/failed/horizontal_bar.png`，**1800 × 1276 px**，18954 bytes（通道 `save_fig(expGraph)`）
- PDF：`.probe/deliver/horizontal_bar.pdf`，22055 bytes（不放仓库；交付时按需重导）
- OPJU：`.probe/deliver/horizontal_bar.opju` —— **不是单模板工程**，是本次 20 个模板共用的工程快照（`.probe/deliver/all-templates.opju`，498988 bytes）按 id 复制，内容含全部 20 页
- 校验：`verify_deliverable.py templates/evidence/failed/horizontal_bar.png .probe/deliver/horizontal_bar.pdf .probe/deliver/horizontal_bar.opju --min-width 1800` → **rc=0**，6 项全 PASS（file×3 / basename / width 1800 px / watermark `mask 0 px`）

## 数据

合成样例：5 个处理 × 2 个数值系列（`.probe/data/horizontal_bar.csv`）。**合成样例，不是实验数据**，只用于验证通道能画出该图型，不得当示例结果引用。

## 能否支撑这个模板

不能支撑：模板是横向**分组**条形（1 列类别 + 多列数值），引擎只取 `y_columns[0]`，跑出来只有 1 个系列（Responder），Non-responder 整列丢失。

## 已知差量

- 本次没有 `gap: null` 的资格：分组是这张图的定义特征，单系列不算跑通
