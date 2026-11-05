# heatmap — 热图（矩阵）

- **状态：implemented**
- 来源：editaplot `runtime/templates/heatmap/`
- 实测日期：2026-11-04
- 实测环境：Origin **10.250212（2025b）**，dsh-origin MCP 76 工具，`origin_status` 握手 `connected: true`

## 实测调用（两次，结果一致）

```
origin_matrix_write(data={"z": [[5x5 网格]]}, matrix_name="HeatZ")   -> [M001]MSheet1
origin_labtalk(script="plotm im:=[M001]1!1 plot:=105 ogl:=[<new>]!;",
               read_expr="page.name$")
-> 第一次 Graph5、第二次 Graph6，两次都正常返回 page.name$
origin_export(fmt="png", width=1200) -> templates/evidence/heatmap.png
```

`plot:=105` 就是本机 `oPlotIDs.h:82` 的 `IDM_PLOT_HEAT_MAP`。

## 对象层反读（`origin_inspect_graph`）

图 `Graph6`：1 层、1 条曲线，`dataset = M001`（矩阵数据源），x/y 轴范围都是 `[-0.125, 11.125]`，
图例显示 `\l(1) %(1)`，色标图例 `[M001]MSheet1!1` 在导出图右上角可见。

## 导出

- 文件：`templates/evidence/heatmap.png`
- 尺寸：**1200 × 850 px**，41188 bytes
- **2026-11-05 重出**：水印已清（`mask 0 px / bands 0`）；仍为**合成数据**验证图，不是实验示例
- PDF/OPJU：`.probe/deliver/heatmap.pdf`（17495 bytes）/ `.probe/deliver/heatmap.opju`（本次 9 张共用的工程快照 `.probe/deliver/all-watermark-fix.opju`，334274 bytes 按 id 复制）
- 校验：`verify_deliverable.py templates/evidence/heatmap.png .probe/deliver/heatmap.pdf .probe/deliver/heatmap.opju --min-width 1800` → **rc=0**，6 项全 PASS

## 数据

5×5 **合成数据**（`z` 网格，中心高外围低），只用于验证通道，不是实验数据。

## 水印复检（2026-11-05）

- 重出前：`watermark_report` 判定 **is_watermark = true**（青色 `demo` 平铺，历史产物）
- 重出后：`mask 0 px, bands 0, acf 0.00` → **不是水印**；尺寸 **1800 × 1276 px**，与其余证据图一致
- 没有裁边、没有降分辨率

## 已知问题

- **这条通道和插件的 `origin_matrix_plot` 不是一回事**：`origin_matrix_plot` 的工具描述写着「heatmap 暂不支持（plotm 实测不可用，COMPATIBILITY #14）」，但那是它自己的实现路径；本模板走的是**直接 LabTalk `plotm ... plot:=105`**，实测两次都出图。以后不要因为那条注释就把 heatmap 标成不支持。
- 矩阵→热图的坐标是**索引**（0–10 这种），不是物理坐标；要带真实 X/Y 轴得另用 `origin_edit_axis` 或给矩阵设轴映射。
- 色标范围/配色未调，要投稿级配色得补 `origin_labtalk` 设色标与调色板。
