# pie 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/pie/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：展示一个整体中少量互斥类别的组成比例。
- **必填列**：一列类别、恰好一个非负数值列
- **数据布局**：两列长表
- **最少列数**：2
- **列名别名**（识别用）：Category/Label、类别/标签、Value/Amount、数值/数量

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `category` | 必填 |
| `series` | 必填 |

## 判据

- 推荐不超过 8 个扇区；过多类别应优先选择条形图。
- 只使用二维饼图，不生成 3D 爆炸效果。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
