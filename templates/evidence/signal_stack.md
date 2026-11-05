# signal_stack — 堆叠谱线（XPS/UV-Vis/PL 这类）

- **状态：implemented**
- 来源：editaplot `runtime/templates/signal_stack/`
- 实测日期：2026-11-03
- 实测环境：Origin **10.2502（2025b）**，dsh-origin MCP 76 工具，`origin_status` 握手 `connected: true`

## 实测调用

```
origin_plot_template(template_id="stacked_spectra",
    data={"x": [280..310, 16 点],
          "spectra": {"sample_A": [...], "sample_B": [...], "sample_C": [...]}},
    graph_name="tpl_signal_stack")
```

## 对象层反读（`origin_verify_graph`）

图 `Graph6`；`series_count` = **3**，1 层，偏移 `offsets = {A:0.0, B:104.4, C:208.8}`（`step=104.4`），三色 `#0072B2 / #D55E00 / #009E73`，`y` 标题 `Intensity (a.u.)`；`x` 轴标题 **unreadable**（读回占位符 `% (?X)`）。

## 导出

- 文件：`templates/evidence/signal_stack.png`
- 尺寸：**1800 × 1276 px**，30841 bytes（`origin_export(fmt="png", width=1800)`，通道 `save_fig(expGraph)`）
- **2026-11-05 重出**：水印已清（`mask 0 px / bands 0`）；仍为**合成数据**验证图，不是实验示例
- PDF/OPJU：`.probe/deliver/signal_stack.pdf`（19666 bytes）/ `.probe/deliver/signal_stack.opju`（本次 9 张共用的工程快照 `.probe/deliver/all-watermark-fix.opju`，334274 bytes 按 id 复制）
- 校验：`verify_deliverable.py templates/evidence/signal_stack.png .probe/deliver/signal_stack.pdf .probe/deliver/signal_stack.opju --min-width 1800` → **rc=0**，6 项全 PASS

## 数据

**合成数据**（脚本内联构造），只用于验证通道连通与图元渲染，**不是实验数据**，不得当作示例结果引用。

## 水印复检（2026-11-05）

- 重出前：`watermark_report` 判定 **is_watermark = true**（青色 `demo` 平铺，历史产物）
- 重出后：`mask 0 px, bands 0, acf 0.00` → **不是水印**；尺寸 **1800 × 1276 px**，与其余证据图一致
- 没有裁边、没有降分辨率

## 已知问题

- **x 轴标题未设置**：`stacked_spectra` 不自带 x 轴标题，调用方必须补 `origin_edit_axis(axis="x", title=...)`，否则导出图 x 轴无标签。
- 偏移量由数据量程自动算（`step=104.4`），谱线多/量程差大时要显式给 `offset`，否则会挤在一起。
