# xrd — XRD 三件套

- **状态：implemented**
- 来源：editaplot `runtime/templates/xrd/`
- 实测日期：2026-11-03
- 实测环境：Origin **10.2502（2025b）**，dsh-origin MCP 76 工具，`origin_status` 握手 `connected: true`

## 实测调用

```
origin_plot_template(template_id="xrd_pattern",
    data={"two_theta": [10..80, 36 点],
          "observed": [...], "calculated": [...], "difference": [...]},
    graph_name="tpl_xrd")
```

## 对象层反读（`origin_verify_graph`）

图 `Graph7`；`layer_count` = **2**（`two_layer` 布局），`series_count` = **4**（逐层 `[2, 2]`：主谱 Observed 散点 + Calculated 线，差谱层 2 条），几何 `layer0 13.99/8.00/80.01/60.00` + `layer1 13.99/72.00/80.01/22.00`（%page），层间重叠 **0.0%**；`y` 标题 `Intensity (a.u.)`；`x` 轴标题 **为空（warn）**；图例隐藏。

## 导出

- 文件：`templates/evidence/xrd.png`
- 尺寸：**1800 × 1276 px**，37816 bytes（`origin_export(fmt="png", width=1800)`，通道 `save_fig(expGraph)`）
- **2026-11-05 重出**：水印已清（`mask 0 px / bands 0`）；仍为**合成数据**验证图，不是实验示例
- PDF/OPJU：`.probe/deliver/xrd.pdf`（32123 bytes）/ `.probe/deliver/xrd.opju`（本次 9 张共用的工程快照 `.probe/deliver/all-watermark-fix.opju`，334274 bytes 按 id 复制）
- 校验：`verify_deliverable.py templates/evidence/xrd.png .probe/deliver/xrd.pdf .probe/deliver/xrd.opju --min-width 1800` → **rc=0**，6 项全 PASS

## 数据

**合成数据**（脚本内联构造），只用于验证通道连通与图元渲染，**不是实验数据**，不得当作示例结果引用。

## 水印复检（2026-11-05）

- 重出前：`watermark_report` 判定 **is_watermark = true**（青色 `demo` 平铺，历史产物）
- 重出后：`mask 0 px, bands 0, acf 0.00` → **不是水印**；尺寸 **1800 × 1276 px**，与其余证据图一致
- 没有裁边、没有降分辨率

## 已知问题

- **x 轴标题为空**：XRD 模板不写 `2theta (degree)`，调用方必须补 `origin_edit_axis(axis="x", title="2theta (degree)")`。
- `series_count` 是 4 不是 2：差谱层也画了 2 条，断言时按层累加。
- 本次未传 `phases`（相刻线），`phases: []` 表示没画相刻线；要刻线必须给带物相名的列。
