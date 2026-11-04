# cv 视觉契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/cv/visual_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，不是原文照抄。

## 图型与系列

- 图型族：`electrochemistry`；类别：`electrochemistry/cv`
- 系列区分：颜色为主，必要时补符号/线型

## 轴与图例

- Nyquist 类图必须等比例轴（x/y 单位长度相等），否则半圆会被压扁
- 电位轴方向按领域惯例（部分体系要求反向），交付说明里写清选了哪个方向
- 多圈/多循环用 cycle_overlay 而不是叠成一条线
- 轴标题必须带单位；范围与反向方向写进交付说明

## 交付硬要求

- PNG 宽 ≥ 1800 px，三件套同名同目录（`verify_deliverable.py` 验）
- 导出图必须过水印检查（`verify_deliverable.py` 的 watermark 项，检出 Origin demo 水印即不可交付）

## 实测补充（本 skill 跑过的）

- **本 skill 尚未实跑**：以上为按图型族归纳的约束，具体样式（柱宽/符号/线宽/字号）待实跑后回写。
