# line_error — 折线 + 误差棒

- **状态：implemented**
- 来源：editaplot `runtime/templates/line_error/`
- 实测日期：2026-11-03
- 实测环境：Origin **10.2502（2025b）**，dsh-origin MCP 76 工具，`origin_status` 握手 `connected: true`

## 实测调用

```
origin_plot(worksheet=[Book2]Sheet1, plot_type="line",
           x_column="Time_min", y_columns=["Signal"], yerr_column="SEM",
           graph_name="tpl_line_error")
```

## 对象层反读（`origin_verify_graph`）

图 `Graph2`；`series_count` = **2**（折线 + 误差棒），1 层，轴标题 `x=Time (min)` / `y=Signal (a.u.)`，字号 14 pt，几何同 `bar` 模板。

## 导出

- 文件：`templates/evidence/line_error.png`
- 尺寸：**1800 × 1276 px**，22684 bytes（`origin_export(fmt="png", width=1800)`，通道 `save_fig(expGraph)`）
- **2026-11-08 重出（去左上角 C）**：1800 × 1276 px、22684 bytes；C 区 (5,149)-(59,236) 暗像素 **0**；左侧 6.5% 带暗像素 0（无残留对象）；仍未裁边、未降分辨率
- **2026-11-05 重出**：水印已清（`mask 0 px / bands 0`）；仍为**合成数据**验证图，不是实验示例
- PDF/OPJU：`.probe/deliver/line_error.pdf`（20759 bytes）/ `.probe/deliver/line_error.opju`（本次 9 张共用的工程快照 `.probe/deliver/all-watermark-fix.opju`，334274 bytes 按 id 复制）
- 校验：`verify_deliverable.py templates/evidence/line_error.png .probe/deliver/line_error.pdf .probe/deliver/line_error.opju --min-width 1800` → **rc=0**，6 项全 PASS

## 数据

> 2026-11-08 重出说明：本图为 2026-11-08 重出；原始内联数值未存档，数据为同规格重新构造，数值与原图不同。

**合成数据**（脚本内联构造），只用于验证通道连通与图元渲染，**不是实验数据**，不得当作示例结果引用。

## 水印复检（2026-11-05）

- 重出前：`watermark_report` 判定 **is_watermark = true**（青色 `demo` 平铺，历史产物）
- 重出后：`mask 0 px, bands 0, acf 0.00` → **不是水印**；尺寸 **1800 × 1276 px**，与其余证据图一致
- 没有裁边、没有降分辨率

## 已知问题

- 同 `bar`：误差棒计入 `series_count`。
