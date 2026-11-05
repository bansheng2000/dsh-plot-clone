# bar — 柱状图（可选误差）

- **状态：implemented**
- 来源：editaplot `runtime/templates/bar/`
- 实测日期：2026-11-03
- 实测环境：Origin **10.2502（2025b）**，dsh-origin MCP 76 工具，`origin_status` 握手 `connected: true`

## 实测调用

```
origin_plot(worksheet=[Book1]Sheet1, plot_type="column",
           x_column="Category", y_columns=["Response"], yerr_column="SD",
           graph_name="tpl_bar")
```

## 对象层反读（`origin_verify_graph`）

图 `Graph1`；`series_count` = **2**（数据柱 1 条 + 误差棒 1 条，verify 把误差棒计为独立 plot），`layer_count` = 1，轴标题 `x=Category` / `y=Response (a.u.)`，字号 14 pt，几何 `left 17.91 / top 11.58 / w 68.16 / h 71.82 (%page)`；10 项检查 9 pass + 1 fail（fail 是我传的 `expected_series=1` 与「误差棒算一条 plot」口径不一致，不是图的问题）。调色板 ocean，主色 `#0072B2`。

## 导出

- 文件：`templates/evidence/bar.png`
- 尺寸：**1800 × 1276 px**，26877 bytes（`origin_export(fmt="png", width=1800)`，通道 `save_fig(expGraph)`）
- **2026-11-05 重出**：水印已清（`mask 0 px / bands 0`）；仍为**合成数据**验证图，不是实验示例
- PDF/OPJU：`.probe/deliver/bar.pdf`（26454 bytes）/ `.probe/deliver/bar.opju`（本次 9 张共用的工程快照 `.probe/deliver/all-watermark-fix.opju`，334274 bytes 按 id 复制）
- 校验：`verify_deliverable.py templates/evidence/bar.png .probe/deliver/bar.pdf .probe/deliver/bar.opju --min-width 1800` → **rc=0**，6 项全 PASS

## 数据

**合成数据**（脚本内联构造），只用于验证通道连通与图元渲染，**不是实验数据**，不得当作示例结果引用。

## 水印复检（2026-11-05）

- 重出前：`watermark_report` 判定 **is_watermark = true**（青色 `demo` 平铺，历史产物）
- 重出后：`mask 0 px, bands 0, acf 0.00` → **不是水印**；尺寸 **1800 × 1276 px**，与其余证据图一致
- 没有裁边、没有降分辨率

## 已知问题

- `verify` 的 `series_count` 把误差棒算一条曲线：断言时应按 `数据条数 + 误差棒条数` 给期望值。
