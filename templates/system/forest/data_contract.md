# forest 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/forest/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：比较多个对象的点估计和显式置信区间或不确定性区间。
- **必填列**：Label、Estimate、CI Low、CI High
- **可选列**：Reference，非空值必须相同
- **数据布局**：每行一个对象
- **最少列数**：4
- **列名别名**（识别用）：标签/估计值/置信区间下限/置信区间上限/参考值

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `category` | 必填 |
| `estimate` | 必填 |
| `lower` | 必填 |
| `upper` | 必填 |
| `reference` | 可选 |

## 判据

- 软件不计算 CI；上下限必须由输入明确提供。
- Reference 缺失时不自动假设零或一。
