# xrd 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/xrd/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：绘制普通 XRD 图谱，或读取 GSAS-II Powder / Publication CSV 的 Rietveld 精修元素。
- **必填列**：普通图谱：2θ 衍射角列 + 一个或多个强度列、精修图：X/2θ + Obs/实测 + Calc/计算
- **可选列**：Bkg/背景、Diff/差值、具有明确物相名称的 Phase 刻线列、weight、Q、Used、diff/sigma、Axis-limits 等辅助或控制列
- **数据布局**：普通 XRD 宽表、GSAS-II Powder CSV、GSAS-II Publication CSV
- **最少列数**：2
- **列名别名**（识别用）：2Theta/TwoTheta/2θ/衍射角、Intensity/Counts/强度/计数、Obs/y_obs/Observed/实测、Calc/y_calc/Calculated/计算、Bkg/y_bkg/Background/背景、Diff/Difference/Residual/差值/残差

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `x` | 必填 |
| `series` | 必填 |
| `background` | 可选 |
| `difference` | 可选 |
| `phase_tick` | 可选 |
| `support` | 可选 |
| `ignored` | 可选 |

## 判据

- 不根据曲线形状自动添加材料峰位、物相名称或精修结论
- 未识别的数值列必须先确认用途，默认不会画成曲线
- GSAS-II Publication 的 Diff 保留其原始显示偏移，不会再次偏移
- 辅助和控制列保留在映射与 Origin 工作簿中，但不会误画成数据系列
- 原始 CSV/TXT/XLS/XLSX 始终只读
