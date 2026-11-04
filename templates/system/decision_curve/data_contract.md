# decision_curve 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/decision_curve/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：比较模型在临床阈值范围内的净获益。
- **必填列**：Threshold、一个或多个模型 Net benefit、Treat all、Treat none
- **数据布局**：宽表，每条曲线一列
- **最少列数**：4
- **列名别名**（识别用）：Threshold/阈值概率、Treat all/全部干预、Treat none/不干预

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `x` | 必填 |
| `series` | 必填 |
| `treat_all` | 必填 |
| `treat_none` | 必填 |

## 判据

- 阈值必须位于 0–1。
- 不从标签、预测概率或患病率静默计算净获益。
- Treat all 与 Treat none 使用中性灰，模型使用同一医学蓝青色族。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
