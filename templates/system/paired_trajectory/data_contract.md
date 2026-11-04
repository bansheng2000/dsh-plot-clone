# paired_trajectory 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/paired_trajectory/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：显示同一病例或受试者在不同访视/条件下的变化方向。
- **必填列**：一个数值 Time/Visit/Condition index、每个 Subject 一列数值
- **数据布局**：宽表；列名是稳定 Subject ID
- **最少列数**：3
- **列名别名**（识别用）：Time/Visit/时间/访视/条件序号、Subject/病例/受试者

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `x` | 必填 |
| `series` | 必填 |

## 判据

- 不根据行号猜 Subject，不插值，不补不存在的时间点。
- V1 使用数值或有序索引作为 X；文本长表将在后续 profile 支持。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
