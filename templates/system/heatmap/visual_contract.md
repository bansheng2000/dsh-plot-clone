# heatmap 视觉契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/heatmap/visual_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，不是原文照抄。

## 图型与系列

- 图型族：`general`；类别：`general/matrix`
- 系列区分：颜色为主，必要时补符号/线型

## 轴与图例

- 单序列自动隐藏图例；多序列保留图例并逐色区分
- 柱/条形/面积强制零基线
- 页面上限由交付规格定（PNG ≥1800 宽）
- 轴标题必须带单位；范围与反向方向写进交付说明

## 交付硬要求

- PNG 宽 ≥ 1800 px，三件套同名同目录（`verify_deliverable.py` 验）
- 导出图必须过水印检查（`verify_deliverable.py` 的 watermark 项，检出 Origin demo 水印即不可交付）

## 实测补充（本 skill 跑过的）

- 走 LabTalk plotm，不是 origin_matrix_plot（那条工具自述 heatmap 不支持）
- 矩阵→热图的坐标是索引（0–10），不是物理坐标，要真实轴得另设
- 色标范围与配色未调，投稿级需要再补
