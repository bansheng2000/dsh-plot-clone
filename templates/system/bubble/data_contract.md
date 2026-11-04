# bubble 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/bubble/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：在连续 X/Y 关系上用气泡大小表达第三个正值变量。
- **必填列**：一个数值 X、一个数值 Y、一个正值 Size
- **数据布局**：X/Y/Size 三列
- **最少列数**：3
- **列名别名**（识别用）：Exposure/Response/Sample size、暴露/响应/样本量

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `x` | 必填 |
| `series` | 必填 |
| `size` | 必填 |

## 判据

- Size 必须为正；缩放规则和原始范围写入计划与反读报告。
- 不把颜色同时编码为第四变量，避免难以解释的默认多重编码。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
