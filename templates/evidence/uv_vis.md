# uv_vis — UV–Vis 吸收/透射与 Tauc 插图

- **状态：implemented**
- 来源：editaplot `runtime/templates/uv_vis/`（Apache-2.0，契约按本 skill 字段重写）
- 实测日期：2026-11-05
- 实测环境：Origin 10.2502（2025b），dsh-origin MCP，`origin_status` → `connected: true`、`session_mode: attach`

## 实测调用

```
origin_figure(data_source=".probe/data/uv_vis.csv", plot_type="line", x_column="Wavelength (nm)", y_columns=["Absorbance (a.u.)"], width=1800)
```

## 对象层反读

图 `Graph15`；`series_count` = **1**；`origin_verify_graph` 10 项检查全 pass（graph_exists / window_context / layer_count / series_count / axis_x_title / axis_y_title / x_title_font_pt / y_title_font_pt / layer0_geometry / legend）。

## 导出

- PNG：`templates/evidence/uv_vis.png`，**1800 × 1276 px**，31615 bytes（通道 `save_fig(expGraph)`）
- PDF：`.probe/deliver/uv_vis.pdf`，31206 bytes（不放仓库；交付时按需重导）
- OPJU：`.probe/deliver/uv_vis.opju` —— **不是单模板工程**，是本次 20 个模板共用的工程快照（`.probe/deliver/all-titles.opju`，494331 bytes）按 id 复制，内容含全部 20 页
- 校验：`verify_deliverable.py templates/evidence/uv_vis.png .probe/deliver/uv_vis.pdf .probe/deliver/uv_vis.opju --min-width 1800` → **rc=0**，6 项全 PASS（file×3 / basename / width 1800 px / watermark `mask 0 px`）

## 数据

合成样例：300 点，200–800 nm 扫描（`.probe/data/uv_vis.csv`）。**合成样例，不是实验数据**，只用于验证通道能画出该图型，不得当示例结果引用。

## 能否支撑这个模板

能支撑：UV–Vis 吸收谱（270 nm 强吸收 + 480 nm 宽吸收）。

## 轴标题（期望 vs 读回，2026-11-05 二次实测）

修复通道：origin_plot + style_overrides；图页 `Graph14`。

| 轴 | 期望（= 数据列单位） | 读回 | 是否逐字符相等 |
| --- | --- | --- | --- |
| x | `Wavelength (nm)` | `Wavelength (nm)` | 是 |
| y | `Absorbance (a.u.)` | `Absorbance (a.u.)` | 是 |

读回通道：LabTalk `xb.text$` / `yl.text$`（`origin_labtalk` → `readback_status: ok`）。

## 已知差量

- Tauc 插图为模板可选项，本图未含（插图层需要额外图层）