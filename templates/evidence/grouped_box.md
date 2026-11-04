# grouped_box — 分组箱线图

- **状态：spec-only**
- 来源：editaplot `runtime/templates/grouped_box/`
- 实测日期：2026-11-03
- 实测环境：Origin **10.2502（2025b）**，dsh-origin MCP 76 工具

## 缺口（gap）

**现有 typed 通道画不出分组箱线。** `origin_plot(plot_type="box")` 的实现在 `origin_engine.py:996-1024`：box/bar 走 Origin 官方模板，但

- 只取 `y_columns[0]`（`origin_engine.py:997-1001`），其余列被丢弃；
- `gl.add_plot(wks, col, "#", type="?")` 用**行号**作 X，`x_column` 参数被忽略（返回里 `x_column` 恒为 `"auto"`）。

所以一个图只能出一个箱，分组（每列一个箱）需要「多数据集 box chart」或 LabTalk，typed 通道不具备。

## 两次实测（都失败，不是猜的）

**实测 1：宽表 + 多列**

```
origin_write_data -> [Book4]Sheet1  列 = G1, G2, G3, G4   行 = 10
origin_plot(worksheet=[Book4]Sheet1, plot_type="box", y_columns=["G1","G2","G3","G4"])
-> {"ok": true, "graph": "Graph4", "y_columns": ["0"], "x_column": "auto"}
```

`origin_inspect_graph(Graph4)`：`plots` 只有 1 条（`dataset: Book4_A`），`y` 轴范围 `[11, 24]` = 仅 G1 的量程 → **只画了第一个箱**。

**实测 2：长表 + 分组列**

```
origin_write_data -> [Book5]Sheet1  列 = Value(40 行), Group(G1..G4 各 10 行)
origin_plot(worksheet=[Book5]Sheet1, plot_type="box", x_column="Group", y_columns=["Value"])
-> {"ok": true, "graph": "Graph5", "y_columns": ["0"], "x_column": "auto"}
```

`origin_inspect_graph(Graph5)`：同样只有 1 条 `Book5_A`，`y` 范围 `[10, 35]` = 全表量程（4 组混成一个箱）→ **不是分组**。

## 待办

放到 LabTalk 探针批里一起验（与 heatmap / violin / radar / sankey 同批）。可试方向：

- LabTalk `worksheet -p 206`（box 模板）后按多数据集建图；
- `plotbox` / `plotgroup` 一类 X-Function，把 G1..G4 作为四个 dataset 挂到同一图层。

过 → 改 `implemented` 并写实测证据；不过 → 保持 `spec-only`，选模板时必须明确告知用户「只有规格、渲染未对接」。

## 数据

两次实测用的都是**合成数据**（`G1..G4` 各 10 个值），只用于验证通道，不是实验数据。

## 补测：LabTalk `plot:=206` 也不行（2026-11-04）

```
plotxy iy:=[Book1]1!(2,3,4) plot:=206 ogl:=[<new>]!;
-> ok: true, executed: true, readback = 'Graph4'
```

`206` 就是本机 `oPlotIDs.h:177` 的 `IDM_PLOT_BOX`，但导出图（`templates/evidence/probes/p_box.png`）画出来的是
**4 个类别位置上的误差棒**，和 `plot:=263`（小提琴）的输出**逐字节相同**（13236 bytes）——
说明 `plotxy` 的 `plot:=` 参数并不按图型 ID 解释，这两个代码都被当成了误差棒。

**结论**：分组箱线图在本机只能走模板（`BOX.otpu`），而模板通道会弹模态框卡死 COM。
要补的是**插件通道**，不是模板。
