# paired_trajectory — 配对与纵向轨迹图

- **状态：implemented**
- 来源：editaplot `runtime/templates/paired_trajectory/`（Apache-2.0，契约按本 skill 字段重写）
- 实测日期：2026-11-05
- 实测环境：Origin 10.2502（2025b），dsh-origin MCP，`origin_status` → `connected: true`、`session_mode: attach`

## 实测调用

```
origin_figure(data_source=".probe/data/paired_trajectory_wide.csv", plot_type="line_symbol", x_column="Visit", y_columns=["P1".."P8"], width=1800)
```

## 对象层反读

图 `Graph22`；`series_count` = **8**；`origin_verify_graph` 10 项检查全 pass（graph_exists / window_context / layer_count / series_count / axis_x_title / axis_y_title / x_title_font_pt / y_title_font_pt / layer0_geometry / legend）。

## 导出

- PNG：`templates/evidence/paired_trajectory.png`，**1800 × 1276 px**，37302 bytes（通道 `save_fig(expGraph)`）
- PDF：`.probe/deliver/paired_trajectory.pdf`，20298 bytes（不放仓库；交付时按需重导）
- OPJU：`.probe/deliver/paired_trajectory.opju` —— **不是单模板工程**，是本次 20 个模板共用的工程快照（`.probe/deliver/all-titles.opju`，494331 bytes）按 id 复制，内容含全部 20 页
- 校验：`verify_deliverable.py templates/evidence/paired_trajectory.png .probe/deliver/paired_trajectory.pdf .probe/deliver/paired_trajectory.opju --min-width 1800` → **rc=0**，6 项全 PASS（file×3 / basename / width 1800 px / watermark `mask 0 px`）

## 数据

合成样例：8 受试者 × 3 随访，宽表 `.probe/data/paired_trajectory_wide.csv`。**合成样例，不是实验数据**，只用于验证通道能画出该图型，不得当示例结果引用。

## 能否支撑这个模板

能支撑：8 名受试者 × 3 次随访的配对轨迹（先转置成 Visit 为 X、每受试者一列，再画 8 条线）。

## 轴标题（期望 vs 读回，2026-11-05 二次实测）

修复通道：origin_plot + style_overrides（y 由 LabTalk 补）；图页 `Graph8`。

| 轴 | 期望（= 数据列单位） | 读回 | 是否逐字符相等 |
| --- | --- | --- | --- |
| x | `Visit` | `Visit` | 是 |
| y | `Score` | `Score` | 是 |

读回通道：LabTalk `xb.text$` / `yl.text$`（`origin_labtalk` → `readback_status: ok`）。

注：y 轴原为空白，补中性名 `Score`；**具体量名/单位需用户确认**

## 已知差量

- 第一次按 Subject 为 X 画出来是 3 条随访线（错误拓扑），已重跑覆盖
- x 轴刻度是 `Baseline/Month 3/Month 6` 的行号，标签映射需 `origin_edit_axis`