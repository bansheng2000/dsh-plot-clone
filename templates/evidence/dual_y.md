# dual_y — 双 Y 轴

- **状态：implemented**
- 来源：**native**（本 skill 原生模板；editaplot 47 个模板里没有 dual_y 这个 id）
- 实测日期：2026-11-03
- 实测环境：Origin **10.2502（2025b）**，dsh-origin MCP 76 工具，`origin_status` 握手 `connected: true`

## 实测调用

```
origin_plot_template(template_id="dual_y",
    data={"x": [1..10], "left": [...], "right": [...]},
    graph_name="tpl_dual_y")
```

## 对象层反读（`origin_verify_graph`）

图 `Graph9`；实际用到的 Origin 模板是 **`doubley`**（`template_used: "doubley"`，按 `dualy->doubley->righty` 顺序探测）；`layer_count` = 2，`series_count` = **2**（逐层 `[1, 1]`），两层几何完全相同 → 层重叠 **100%**（双 Y 共享绘图区的正常形态，`verify` 的 warn 已说明）；`y` 标题 `Left`，`x` 轴标题 **unreadable**。

## 导出

- 文件：`templates/evidence/dual_y.png`
- 尺寸：**1800 × 1276 px**，36911 bytes（`origin_export(fmt="png", width=1800)`，通道 `save_fig(expGraph)`）
- **2026-11-08 重出（去左上角 C）**：1800 × 1276 px、36911 bytes；C 区 (5,149)-(59,236) 暗像素 **0**；左侧 6.5% 带暗像素 284（为纵轴标题，不在 C 框内）；仍未裁边、未降分辨率
- **2026-11-05 重出**：水印已清（`mask 0 px / bands 0`）；仍为**合成数据**验证图，不是实验示例
- PDF/OPJU：`.probe/deliver/dual_y.pdf`（17243 bytes）/ `.probe/deliver/dual_y.opju`（本次 9 张共用的工程快照 `.probe/deliver/all-watermark-fix.opju`，334274 bytes 按 id 复制）
- 校验：`verify_deliverable.py templates/evidence/dual_y.png .probe/deliver/dual_y.pdf .probe/deliver/dual_y.opju --min-width 1800` → **rc=0**，6 项全 PASS

## 数据

> 2026-11-08 重出说明：本图为 2026-11-08 重出；原始内联数值未存档，数据为同规格重新构造，数值与原图不同。

**合成数据**（脚本内联构造），只用于验证通道连通与图元渲染，**不是实验数据**，不得当作示例结果引用。

## 水印复检（2026-11-05）

- 重出前：`watermark_report` 判定 **is_watermark = true**（青色 `demo` 平铺，历史产物）
- 重出后：`mask 0 px, bands 0, acf 0.00` → **不是水印**；尺寸 **1800 × 1276 px**，与其余证据图一致
- 没有裁边、没有降分辨率

## 已知问题

- **双 Y 的轴标题必须显式给**：左轴读回 `Left`、右轴默认 `Right`，都是列名而不是物理量；`x` 轴标题未设置。要用 `origin_edit_axis(axis="y")` + `axis="y2"` 分别写。
- 100% 层重叠是正常形态，`origin_verify_graph` 需传 `allow_full_overlap=true` 才不报 warn。
- Origin 2025b 上 `dualy` 不存在，走的是 `doubley`；换机器可能落到 `righty`，行为一致但模板名不同。
