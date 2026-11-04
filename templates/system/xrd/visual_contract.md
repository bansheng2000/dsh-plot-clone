# xrd 视觉契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/xrd/visual_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，不是原文照抄。

## 图型与系列

- 图型族：`spectroscopy`；类别：`spectroscopy/xrd`
- 系列区分：颜色 + 线型双通道（色盲可辨，跑 `figure_metrics.py --pub-check` 验）

## 轴与图例

- 能量/波数/化学位移类横轴按惯例**反向**（从高到低），改轴用 origin_edit_axis(scale=..., reverse=1)
- 多条谱线对比优先纵向堆叠偏移（stacked_spectra），不要挤在一层
- 浅色水平主网格或不开网格；谱线本身不加数据点符号
- 轴标题必须带单位；范围与反向方向写进交付说明

## 交付硬要求

- PNG 宽 ≥ 1800 px，三件套同名同目录（`verify_deliverable.py` 验）
- 导出图必须过水印检查（`verify_deliverable.py` 的 watermark 项，检出 Origin demo 水印即不可交付）

## 实测补充（本 skill 跑过的）

- 双层布局：series_count 按层累加（实测 4 条，不是 2 条）
- x 轴标题为空，必须补 2theta (degree)
- 相刻线需要带物相名的 phases，本次 phases=[]
