# ftir 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/ftir/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：绘制波数与一个或多个红外吸收或透射信号的关系。
- **必填列**：Wavenumber/波数列、一个或多个 Absorbance/Transmittance 数值系列
- **数据布局**：宽表
- **最少列数**：2
- **列名别名**（识别用）：Wavenumber/波数、Absorbance/吸光度、Transmittance/透过率、FTIR/红外

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `x` | 必填 |
| `series` | 必填 |

## 判据

- 波数按红外光谱惯例由大到小显示，源表顺序和数值保持不变。
- 不自动做基线校正、平滑、归一化、峰识别、峰指认或峰面积计算。
- 多谱线默认直接叠加；只有用户明确确认后才能增加显示偏移。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
