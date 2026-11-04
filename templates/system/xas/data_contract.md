# xas 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/xas/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：绘制能量与吸收信号关系，保留用户提供的数值。
- **必填列**：能量列、一个或多个吸收信号列
- **数据布局**：宽表
- **最少列数**：2
- **列名别名**（识别用）：Energy/Photon Energy/能量、mu/μ(E)/Absorption/吸收

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `x` | 必填 |
| `series` | 必填 |

## 判据

- 不自动归一化、扣背景、求导或拟合
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
