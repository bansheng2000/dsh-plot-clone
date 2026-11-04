# eis 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/eis/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：自动识别 Nyquist 或 Bode 阻抗谱列角色。
- **必填列**：Nyquist：Z 实部 + Z 虚部、或 Bode：频率 + 阻抗模/相位
- **可选列**：多个样品系列
- **数据布局**：宽表
- **最少列数**：2
- **列名别名**（识别用）：Zreal/Z'/阻抗实部、Zimag/Z''/阻抗虚部、Frequency/频率、Phase/相位角

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| （未声明） | — |

## 判据

- 不会自动进行等效电路拟合
- 频率对数轴要求全部频率为正
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
