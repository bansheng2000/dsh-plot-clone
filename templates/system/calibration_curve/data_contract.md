# calibration_curve 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/calibration_curve/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：展示预测概率与实际发生率的一致性，不在绘图阶段静默分箱或拟合。
- **必填列**：Predicted probability、Observed fraction、Bin count
- **数据布局**：一行一个预计算概率箱
- **最少列数**：3
- **列名别名**（识别用）：预测概率/平均预测概率、观察比例/实际发生率、分箱样本数/频数

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `x` | 必填 |
| `series` | 必填 |
| `count` | 必填 |

## 判据

- 所有概率必须位于 0–1，Bin count 必须非负且至少一个大于 0。
- 不计算校准斜率、截距、Brier score、置信区间或平滑曲线。
- 底部分布条是工作簿 helper column，仅用于显示，原始数据保持不变。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
