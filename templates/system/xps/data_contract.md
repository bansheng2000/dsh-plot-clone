# xps 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/xps/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：自动识别扫描谱、拟合谱、可变分峰和残差，并选择相应 XPS profile。
- **必填列**：结合能或动能列、至少一个强度/计数列
- **可选列**：背景、拟合包络、任意数量 component peaks、残差
- **数据布局**：宽表
- **最少列数**：2
- **列名别名**（识别用）：Binding Energy/结合能、Kinetic Energy/动能、Intensity/Counts/强度/计数、Background/背景、Envelope/拟合包络、Residual/残差

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| （未声明） | — |

## 判据

- 不会修改原始文件或补造峰列
- 能量轴方向和 Y 轴规则由识别到的 profile 决定
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
