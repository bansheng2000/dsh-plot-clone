# violin 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/violin/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：比较多个组的分布形状、中位数和四分位范围。
- **必填列**：一个或多个原始数值列，每列至少 5 个观测
- **数据布局**：宽表，每个数值列代表一组
- **最少列数**：1
- **列名别名**（识别用）：Control/Treatment、对照/处理组

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `series` | 必填 |

## 判据

- 密度由 Origin 官方 Violin/Box 统计图对象生成。
- 不把小样本伪装成稳定分布；样本太少时改用原始点图。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
