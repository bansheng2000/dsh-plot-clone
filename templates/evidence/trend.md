# trend — 多系列趋势折线图

- **状态：implemented**
- 来源：editaplot `runtime/templates/trend/`（Apache-2.0，契约按本 skill 字段重写）
- 实测日期：2026-11-05
- 实测环境：Origin 10.2502（2025b），dsh-origin MCP，`origin_status` → `connected: true`、`session_mode: attach`

## 实测调用

```
origin_figure(data_source=".probe/data/trend.csv", plot_type="line", x_column="Time (h)", y_columns=["Control", "Treatment A", "Treatment B"], width=1800)
```

## 对象层反读

图 `Graph6`；`series_count` = **3**；`origin_verify_graph` 10 项检查全 pass（graph_exists / window_context / layer_count / series_count / axis_x_title / axis_y_title / x_title_font_pt / y_title_font_pt / layer0_geometry / legend）。

## 导出

- PNG：`templates/evidence/trend.png`，**1800 × 1276 px**，30464 bytes（通道 `save_fig(expGraph)`）
- PDF：`.probe/deliver/trend.pdf`，20127 bytes（不放仓库；交付时按需重导）
- OPJU：`.probe/deliver/trend.opju` —— **不是单模板工程**，是本次 20 个模板共用的工程快照（`.probe/deliver/all-titles.opju`，494331 bytes）按 id 复制，内容含全部 20 页
- 校验：`verify_deliverable.py templates/evidence/trend.png .probe/deliver/trend.pdf .probe/deliver/trend.opju --min-width 1800` → **rc=0**，6 项全 PASS（file×3 / basename / width 1800 px / watermark `mask 0 px`）

## 数据

合成样例：24 个时间点 × 3 组（`.probe/data/trend.csv`）。**合成样例，不是实验数据**，只用于验证通道能画出该图型，不得当示例结果引用。

## 能否支撑这个模板

能支撑：3 个处理组的趋势折线 + 图例 + 逐色区分。

## 轴标题（期望 vs 读回，2026-11-05 二次实测）

修复通道：origin_plot + style_overrides（y 由 LabTalk 补）；图页 `Graph5`。

| 轴 | 期望（= 数据列单位） | 读回 | 是否逐字符相等 |
| --- | --- | --- | --- |
| x | `Time (h)` | `Time (h)` | 是 |
| y | `Value` | `Value` | 是 |

读回通道：LabTalk `xb.text$` / `yl.text$`（`origin_labtalk` → `readback_status: ok`）。

注：y 轴原为空白（引擎不推断多系列共同量名），空标题会被 Origin 回填成工程路径 `E:\文档\OriginLab\User Files\`，故补中性名 `Value`；**具体量名/单位需用户确认**

## 已知差量
