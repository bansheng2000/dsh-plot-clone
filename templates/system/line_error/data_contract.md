# line_error 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/line_error/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：展示有序 X 上的中心值变化及其已计算不确定性。
- **必填列**：一个数值 X 列、一个或多个中心值列、每个中心值的配对误差列
- **数据布局**：宽表
- **最少列数**：3
- **列名别名**（识别用）：Time/X/时间、_SD/标准差、_SE/_SEM/标准误、_err/误差

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `x` | 必填 |
| `series` | 必填 |
| `error` | 必填 |

## 判据

- 不从重复观测计算均值或误差。
- 自定义误差必须由用户确认统计含义。
