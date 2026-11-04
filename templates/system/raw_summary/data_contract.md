# raw_summary 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/raw_summary/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：用全部原始观测比较多个组，避免只展示汇总柱。
- **必填列**：一个或多个原始数值列
- **数据布局**：宽表，每个数值列代表一组
- **最少列数**：1
- **列名别名**（识别用）：Control/Treatment、对照/处理组

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `series` | 必填 |

## 判据

- 不自动删除异常值，不修改原始观测。
- 中心线由 Origin 官方统计图对象计算并保持可编辑。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
