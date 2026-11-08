# time_frequency — 时间–频率物理矩阵

- **状态：implemented**
- 来源：editaplot `runtime/templates/time_frequency/`（Apache-2.0，契约按本 skill 字段重写）
- 实测日期：2026-11-05
- 实测环境：Origin 10.2502（2025b），dsh-origin MCP，`origin_status` → `connected: true`、`session_mode: attach`

## 实测调用

```
origin_matrix_write(matrix_name="tf_power", data={"z": 16×14}) -> origin_matrix_plot(matrix="[M001]MSheet1", plot_type="contour_fill", width=1800)
```

## 对象层反读

图 `Graph21`；`series_count` = **1（矩阵 16×14）**；`origin_verify_graph` 10 项检查全 pass（graph_exists / window_context / layer_count / series_count / axis_x_title / axis_y_title / x_title_font_pt / y_title_font_pt / layer0_geometry / legend）。

## 导出

- PNG：`templates/evidence/time_frequency.png`，**1800 × 1276 px**，47727 bytes（通道 `save_fig(expGraph)`）
- PDF：`.probe/deliver/time_frequency.pdf`，210640 bytes（不放仓库；交付时按需重导）
- OPJU：`.probe/deliver/time_frequency.opju` —— **不是单模板工程**，是本次 20 个模板共用的工程快照（`.probe/deliver/all-titles.opju`，494331 bytes）按 id 复制，内容含全部 20 页
- 校验：`verify_deliverable.py templates/evidence/time_frequency.png .probe/deliver/time_frequency.pdf .probe/deliver/time_frequency.opju --min-width 1800` → **rc=0**，6 项全 PASS（file×3 / basename / width 1800 px / watermark `mask 0 px`）

## 数据

合成样例：4–60 Hz × 0–20 s 功率矩阵，12 Hz 附近能量带（`.probe/data/tf_small.json` 为 16×14 抽样）。**合成样例，不是实验数据**，只用于验证通道能画出该图型，不得当示例结果引用。

## 能否支撑这个模板

能支撑：频段 × 时间功率矩阵的填色等高图（contour_fill），色阶随功率变化。

## 轴标题（期望 vs 读回，2026-11-05 二次实测）

修复通道：LabTalk `xb.text$` / `yl.text$`；图页 `Graph19`。

| 轴 | 期望（= 数据列单位） | 读回 | 是否逐字符相等 |
| --- | --- | --- | --- |
| x | `Time (s)` | `Time (s)` | 是 |
| y | `Frequency (Hz)` | `Frequency (Hz)` | 是 |

读回通道：LabTalk `xb.text$` / `yl.text$`（`origin_labtalk` → `readback_status: ok`）。

注：**contour/matrix 页（plotm 生成）不存 COM `layer.x.title`**：`origin_edit_axis` 恒 rejected、`origin_inspect_graph` 读回为空，`origin_verify_graph` 的 axis_x_title/axis_y_title 两项在该页恒 fail（通道限制，不是没设）；标题经 LabTalk 写入并读回正确，须目视确认

## 已知差量

- 矩阵本身不带轴元数据，时间/频率标题由 LabTalk `xb.text$`/`yl.text$` 显式写入（非自动推断）
- 矩阵是按 16×14 抽样写入的（原始 30×40），证据图不是全分辨率矩阵

## 左侧暗像素说明（2026-11-08）

本图左带（`x < 0.065×W`）有 4904 个暗像素，**来自它自己的旋转纵轴标题，不是残留的页面文本对象**：C 区 (5,149)-(59,236) 暗像素为 0，不要把它当缺陷重出。本图为 16×14 矩阵 + 默认图层几何；改按 30×40 或不套几何都会把等高线与图例位置整片改掉（实测差 11 万像素级），因此保持 2026-11-05 原图不变。