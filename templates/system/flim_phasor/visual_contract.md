# flim_phasor 视觉契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/flim_phasor/visual_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，不是原文照抄。

## 图型与系列

- 图型族：`research`；类别：`research/fluorescence`
- 系列区分：颜色 + 线型双通道（色盲可辨，跑 `figure_metrics.py --pub-check` 验）

## 轴与图例

- 时序类横轴写单位（s / ms），刻度朝内
- 多条件对比用颜色 + 线型双通道区分（色盲可辨）
- 轴标题必须带单位；范围与反向方向写进交付说明

## 交付硬要求

- PNG 宽 ≥ 1800 px，三件套同名同目录（`verify_deliverable.py` 验）
- 导出图必须过水印检查（`verify_deliverable.py` 的 watermark 项，检出 Origin demo 水印即不可交付）

## 实测补充（本 skill 跑过的）

- **本 skill 尚未实跑**：以上为按图型族归纳的约束，具体样式（柱宽/符号/线宽/字号）待实跑后回写。
