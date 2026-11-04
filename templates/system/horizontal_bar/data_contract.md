# horizontal_bar 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/horizontal_bar/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：当类别名称较长时，横向比较一个或多个已汇总数值系列。
- **必填列**：一列类别、一个或多个数值系列
- **可选列**：与系列同名的 SD/SE/SEM/误差列
- **数据布局**：宽表
- **最少列数**：2
- **列名别名**（识别用）：Category/Group/Sample、类别/组别/样品

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `category` | 必填 |
| `series` | 必填 |
| `error` | 可选 |

## 判据

- 系列数会自动影响组内宽度、同族颜色与图例。
- 不从重复观测自动计算均值或误差。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
