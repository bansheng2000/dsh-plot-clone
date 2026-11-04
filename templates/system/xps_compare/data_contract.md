# xps_compare 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/xps_compare/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：对比共享结合能轴上的两条或更多独立实测 XPS 谱线。
- **必填列**：Binding Energy/结合能列、至少两个独立实测 Intensity/Counts 数值系列
- **数据布局**：宽表；第一条物理 X 列加两条或更多独立实测谱线
- **最少列数**：3
- **列名别名**（识别用）：Binding Energy/结合能、Intensity/强度、Counts/计数、Experimental/实测

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `binding_energy` | 必填 |
| `measured_series` | 必填 |

## 判据

- 默认直接叠加源谱线；只有用户明确确认后才能采用纵向显示偏移。
- 结合能按 XPS 惯例由高到低显示，但源表数值和顺序保持不变。
- Background、Envelope/Fit、Residual、Component/Peak 等列属于拟合语义，不由本模板自动当作独立实测谱线。
- 不自动归一化、扣背景、平滑、拟合、分峰、识别谱区或指认化学态。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
