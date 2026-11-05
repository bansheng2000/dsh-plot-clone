# cv — CV 循环伏安曲线

- **状态：implemented**
- 来源：editaplot `runtime/templates/cv/`（Apache-2.0，契约按本 skill 字段重写）
- 实测日期：2026-11-05
- 实测环境：Origin 10.2502（2025b），dsh-origin MCP，`origin_status` → `connected: true`、`session_mode: attach`

## 实测调用

```
origin_figure(data_source=".probe/data/cv.csv", plot_type="line", x_column="Potential (V)", y_columns=["Current (mA)"], width=1800)
```

## 对象层反读

图 `Graph1`；`series_count` = **1**；`origin_verify_graph` 10 项检查全 pass（graph_exists / window_context / layer_count / series_count / axis_x_title / axis_y_title / x_title_font_pt / y_title_font_pt / layer0_geometry / legend）。

## 导出

- PNG：`templates/evidence/cv.png`，**1800 × 1276 px**，31649 bytes（通道 `save_fig(expGraph)`）
- PDF：`.probe/deliver/cv.pdf`，23643 bytes（不放仓库；交付时按需重导）
- OPJU：`.probe/deliver/cv.opju` —— **不是单模板工程**，是本次 20 个模板共用的工程快照（`.probe/deliver/all-templates.opju`，498988 bytes）按 id 复制，内容含全部 20 页
- 校验：`verify_deliverable.py templates/evidence/cv.png .probe/deliver/cv.pdf .probe/deliver/cv.opju --min-width 1800` → **rc=0**，6 项全 PASS（file×3 / basename / width 1800 px / watermark `mask 0 px`）

## 数据

合成样例：120 点正扫 + 120 点回扫，基线与高斯峰叠加噪声（`.probe/data/cv.csv`）。**合成样例，不是实验数据**，只用于验证通道能画出该图型，不得当示例结果引用。

## 能否支撑这个模板

能支撑：单圈 CV 回线（0→1 V→0 V）完整画出，氧化/还原峰可见，单文件一次成图。

## 已知差量

- 等轴比与电位轴反向未设置（属第 7 步收敛项）
- 轴标题被通道改写：`Current (mA)` → `Current (A)`，需 `origin_edit_axis(title=...)` 手改
