# grouped_box 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/grouped_box/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：比较多个条件下两组或多组原始观测分布。
- **必填列**：至少四个数值列，列名写成 Category | Group
- **数据布局**：宽表；每列是一组原始观测，允许列尾缺失
- **最少列数**：2
- **列名别名**（识别用）：Condition | Control、条件 | 对照组

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `series` | 必填 |

## 判据

- 每列至少五个有限观测。
- Origin 从原始值计算箱体统计并叠加全部原始点；不会修改源表。
- n 由非空观测数计数；不静默计算显著性或添加星号。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
