# dual_y 视觉契约

> 本 skill 原生模板，无上游来源（不在 editaplot 的 47 个之内）

## 图型与系列

- 图型族：`general`；类别：`general/axis`
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

- 2025b 上走 doubley 模板
- 左右轴标题默认是列名，必须显式改
- 层 100% 重叠属正常
