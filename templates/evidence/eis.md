# eis — EIS 阻抗谱

- **状态：implemented**
- 来源：editaplot `runtime/templates/eis/`（Apache-2.0，契约按本 skill 字段重写）
- 实测日期：2026-11-05
- 实测环境：Origin 10.2502（2025b），dsh-origin MCP，`origin_status` → `connected: true`、`session_mode: attach`

## 实测调用

```
origin_figure(data_source=".probe/data/eis.csv", plot_type="scatter", x_column="Z' (ohm)", y_columns=["-Z'' (ohm)"], width=1800)
```

## 对象层反读

图 `Graph2`；`series_count` = **1**；`origin_verify_graph` 10 项检查全 pass（graph_exists / window_context / layer_count / series_count / axis_x_title / axis_y_title / x_title_font_pt / y_title_font_pt / layer0_geometry / legend）。

## 导出

- PNG：`templates/evidence/eis.png`，**1800 × 1276 px**，25835 bytes（通道 `save_fig(expGraph)`）
- PDF：`.probe/deliver/eis.pdf`，22032 bytes（不放仓库；交付时按需重导）
- OPJU：`.probe/deliver/eis.opju` —— **不是单模板工程**，是本次 20 个模板共用的工程快照（`.probe/deliver/all-templates.opju`，498988 bytes）按 id 复制，内容含全部 20 页
- 校验：`verify_deliverable.py templates/evidence/eis.png .probe/deliver/eis.pdf .probe/deliver/eis.opju --min-width 1800` → **rc=0**，6 项全 PASS（file×3 / basename / width 1800 px / watermark `mask 0 px`）

## 数据

合成样例：60 点，半圆 + Warburg 尾（`.probe/data/eis.csv`）。**合成样例，不是实验数据**，只用于验证通道能画出该图型，不得当示例结果引用。

## 能否支撑这个模板

能支撑：`-Z''` vs `Z'` 的半圆加扩散尾出来了，是 EIS 通道的最小可用形态。

## 已知差量

- Nyquist 要求的等轴比（x/y 单位长度相等）未设置——几何调整不在本轮允许通道内
- 轴标题 `-Z''` 被小写化为 `-z''`
