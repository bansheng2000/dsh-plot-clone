# bland_altman 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/bland_altman/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：判断两个连续测量方法之间的偏倚与一致性范围。
- **必填列**：Mean、Difference、Bias、Lower LoA、Upper LoA
- **数据布局**：每行一个明确配对病例，三条参考值列重复同一个输入值
- **最少列数**：5
- **列名别名**（识别用）：均值/差值/偏倚/一致性下限/一致性上限

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `mean` | 必填 |
| `difference` | 必填 |
| `bias` | 必填 |
| `loa_lower` | 必填 |
| `loa_upper` | 必填 |

## 判据

- V1 不从 Method A/Method B 静默计算统计量。
- 不根据行号猜配对，不计算比例偏倚或 LoA 的置信区间。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
