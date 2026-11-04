# percent_stacked_bar 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/percent_stacked_bar/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：比较各类别内部多个组成部分的相对比例。
- **必填列**：一列类别、至少两个非负数值组成列
- **数据布局**：宽表
- **最少列数**：3
- **列名别名**（识别用）：Category/Group/Sample、类别/组别/样品

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `category` | 必填 |
| `series` | 必填 |

## 判据

- 每行总和必须大于零。
- 百分比换算只发生在预览和 Origin helper columns，源文件保持不变。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
