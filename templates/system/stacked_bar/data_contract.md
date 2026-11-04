# stacked_bar 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/stacked_bar/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：比较每个类别的绝对总量及其多个非负组成部分。
- **必填列**：一列类别、至少两个非负数值组成列
- **可选列**：一个显式总量 SD/SE/SEM/误差列
- **数据布局**：宽表
- **最少列数**：3
- **列名别名**（识别用）：Category/Group/Sample、类别/组别/样品

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `category` | 必填 |
| `series` | 必填 |
| `error` | 可选 |

## 判据

- 每行的柱高是原始组成值之和。
- 不接受负值，也不把绝对量自动换算为百分比。
- 误差棒仅在源文件明确提供总量误差时显示，不合成分量误差。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
