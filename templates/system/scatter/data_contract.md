# scatter 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/scatter/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：展示一个连续 X 与一个或多个连续观测系列之间的关系。
- **必填列**：一个数值 X 列、一个或多个数值 Y 列
- **数据布局**：宽表
- **最少列数**：2
- **列名别名**（识别用）：X/Time/Concentration、时间/浓度/自变量、Response/Signal/响应/信号

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `x` | 必填 |
| `series` | 必填 |

## 判据

- 不自动拟合回归线、删除离群点或计算相关系数。
- 点数增加时只调整显示密度，正式 Origin 仍使用全部数据。
