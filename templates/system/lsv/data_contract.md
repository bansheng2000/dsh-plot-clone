# lsv 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/lsv/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：绘制线性扫描电位下的一个或多个电流响应。
- **必填列**：电位或电压列、一个或多个电流系列
- **数据布局**：宽表
- **最少列数**：2
- **列名别名**（识别用）：Potential/Voltage/E、电位/电压、Current/Current density、电流/电流密度

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `x` | 必填 |
| `series` | 必填 |

## 判据

- 不自动计算 onset、Tafel slope 或极限电流
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
