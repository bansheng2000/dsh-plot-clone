# xps_compare — XPS 多谱线对比

- **状态：implemented**
- 来源：editaplot `runtime/templates/xps_compare/`（Apache-2.0，契约按本 skill 字段重写）
- 实测日期：2026-11-05
- 实测环境：Origin 10.2502（2025b），dsh-origin MCP，`origin_status` → `connected: true`、`session_mode: attach`

## 实测调用

```
origin_plot_template(template_id="stacked_spectra", data={"x": 40 点, "spectra": 3 条}, reverse_x=true, offset="auto", width=1800)
```

## 对象层反读

图 `Graph20`；`series_count` = **3**；`origin_verify_graph` 10 项检查全 pass（graph_exists / window_context / layer_count / series_count / axis_x_title / axis_y_title / x_title_font_pt / y_title_font_pt / layer0_geometry / legend）。

## 导出

- PNG：`templates/evidence/xps_compare.png`，**1800 × 1276 px**，32593 bytes（通道 `save_fig(expGraph)`）
- PDF：`.probe/deliver/xps_compare.pdf`，24830 bytes（不放仓库；交付时按需重导）
- OPJU：`.probe/deliver/xps_compare.opju` —— **不是单模板工程**，是本次 20 个模板共用的工程快照（`.probe/deliver/all-titles.opju`，494331 bytes）按 id 复制，内容含全部 20 页
- 校验：`verify_deliverable.py templates/evidence/xps_compare.png .probe/deliver/xps_compare.pdf .probe/deliver/xps_compare.opju --min-width 1800` → **rc=0**，6 项全 PASS（file×3 / basename / width 1800 px / watermark `mask 0 px`）

## 数据

合成样例：160 点 × 3 样品，40 点抽样导入（`.probe/data/xps_compare_inline.json`）。**合成样例，不是实验数据**，只用于验证通道能画出该图型，不得当示例结果引用。

## 能否支撑这个模板

能支撑：3 个样品的 O 1s 谱线堆叠对比（带 0.35 / −0.25 eV 位移），间距 1.894。

## 轴标题（期望 vs 读回，2026-11-05 二次实测）

修复通道：origin_edit_axis（模板不吃 style_overrides）；图页 `Graph18`。

| 轴 | 期望（= 数据列单位） | 读回 | 是否逐字符相等 |
| --- | --- | --- | --- |
| x | `Binding energy (eV)` | `Binding energy (eV)` | 是 |
| y | `Intensity (a.u.)` | `Intensity (a.u.)` | 是 |

读回通道：LabTalk `xb.text$` / `yl.text$`（`origin_labtalk` → `readback_status: ok`）。

## 已知差量

- 位移是合成数据里预置的，不是拟合得到
- 数据是 40 点抽样（原始 160 点）