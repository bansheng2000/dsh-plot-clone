# xps — XPS

- **状态：implemented**
- 来源：editaplot `runtime/templates/xps/`（Apache-2.0，契约按本 skill 字段重写）
- 实测日期：2026-11-05
- 实测环境：Origin 10.2502（2025b），dsh-origin MCP，`origin_status` → `connected: true`、`session_mode: attach`

## 实测调用

```
origin_plot_template(template_id="stacked_spectra", data={"x": 40 点, "spectra": 3 条}, reverse_x=true, offset="auto", width=1800)
```

## 对象层反读

图 `Graph19`；`series_count` = **3**；`origin_verify_graph` 10 项检查全 pass（graph_exists / window_context / layer_count / series_count / axis_x_title / axis_y_title / x_title_font_pt / y_title_font_pt / layer0_geometry / legend）。

## 导出

- PNG：`templates/evidence/xps.png`，**1800 × 1276 px**，32757 bytes（通道 `save_fig(expGraph)`）
- PDF：`.probe/deliver/xps.pdf`，24838 bytes（不放仓库；交付时按需重导）
- OPJU：`.probe/deliver/xps.opju` —— **不是单模板工程**，是本次 20 个模板共用的工程快照（`.probe/deliver/all-titles.opju`，494331 bytes）按 id 复制，内容含全部 20 页
- 校验：`verify_deliverable.py templates/evidence/xps.png .probe/deliver/xps.pdf .probe/deliver/xps.opju --min-width 1800` → **rc=0**，6 项全 PASS（file×3 / basename / width 1800 px / watermark `mask 0 px`）

## 数据

合成样例：160 点 O 1s，40 点抽样导入（`.probe/data/xps_inline.json`）。**合成样例，不是实验数据**，只用于验证通道能画出该图型，不得当示例结果引用。

## 能否支撑这个模板

能支撑：3 条 O 1s 谱线纵向堆叠（间距 1.897），x 轴反向，符合 XPS 惯例。

## 轴标题（期望 vs 读回，2026-11-05 二次实测）

修复通道：origin_edit_axis（模板不吃 style_overrides）；图页 `Graph17`。

| 轴 | 期望（= 数据列单位） | 读回 | 是否逐字符相等 |
| --- | --- | --- | --- |
| x | `Binding energy (eV)` | `Binding energy (eV)` | 是 |
| y | `Intensity (a.u.)` | `Intensity (a.u.)` | 是 |

读回通道：LabTalk `xb.text$` / `yl.text$`（`origin_labtalk` → `readback_status: ok`）。

## 已知差量

- 谱线未做分峰拟合（模板只要求堆叠对比）
- 数据是 40 点抽样（原始 160 点），峰形在图上仍可辨