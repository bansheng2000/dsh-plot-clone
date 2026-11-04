# histogram 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/histogram/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：检查连续观测的中心、范围、偏斜和多峰结构。
- **必填列**：一个或多个原始数值列，每列至少 5 个观测
- **数据布局**：宽表
- **最少列数**：1
- **列名别名**（识别用）：Value/Measurement、数值/测量值

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `series` | 必填 |

## 判据

- bin 规则冻结到计划和 Origin 反读报告，不静默拟合分布曲线。
- 多列叠加容易遮挡，缺少明确意图时需要人工确认。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
