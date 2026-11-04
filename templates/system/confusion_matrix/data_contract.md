# confusion_matrix 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/confusion_matrix/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：展示医学分类器在各真实类别与预测类别之间的错误结构。
- **必填列**：第一列 Actual class、后续每列一个 Predicted class 的计数或已给比例
- **数据布局**：宽矩阵
- **最少列数**：3
- **列名别名**（识别用）：Actual/真实类别/实际类别、预测类别列

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `category` | 必填 |
| `series` | 必填 |

## 判据

- 不静默进行行归一化、列归一化或百分比转换。
- Actual class 保持为行，Predicted class 保持为列。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
