# dsc 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/dsc/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：绘制温度与一个或多个 DSC 热流系列的关系。
- **必填列**：Temperature/温度列、一个或多个 Heat Flow/热流数值系列
- **数据布局**：宽表
- **最少列数**：2
- **列名别名**（识别用）：Temperature/温度、Heat Flow/热流、DSC

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `x` | 必填 |
| `series` | 必填 |

## 判据

- 吸热或放热向上/向下的约定必须由用户确认，软件不根据曲线形状猜测或静默翻转。
- 不自动识别、拟合或标注 Tg、Tm、Tc、焓变、起始温度或峰温。
- 多曲线默认直接叠加；只有用户明确确认后才能增加显示偏移。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
