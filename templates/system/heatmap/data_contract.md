# heatmap 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/heatmap/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：用颜色编码类别与系列交叉位置上的数值。
- **必填列**：一列行类别、至少两个数值系列
- **数据布局**：宽表；行是类别，数值列是热力图列
- **最少列数**：3
- **列名别名**（识别用）：Dataset/Category/Sample、数据集/类别/样品、其余数值列作为热力图列

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `category` | 必填 |
| `series` | 必填 |

## 判据

- 小矩阵自动显示单元格数值；高密度矩阵关闭单元格文字以避免重叠。
- 同时包含正负值时自动使用以零为中心的发散色阶；源表不被改写。
