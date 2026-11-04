# density_ridgeline3d 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/density_ridgeline3d/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：仅接受 mixed-wide 六角色表；两列密度和焦点必须由用户在上游提供，绘图层不计算 KDE、峰值、交点或阈值。
- **必填列**：Condition ID（条件标识）、Condition Position（带单位数值）、Density X（带单位数值）、Solid Density（非负数值）、Dashed Density（非负数值）、Focal X（每组仅一行非空）
- **数据布局**：mixed-wide；每行一个横轴位置；同一行同时提供 Solid Density 与 Dashed Density
- **最少列数**：6
- **列名别名**（识别用）：Condition ID/Condition Name/条件标识、Condition Position/Follow-up Time/条件位置、Density X/Response Score/分布横轴、Solid Density/实线密度、Dashed Density/虚线密度、Focal X/焦点横坐标

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `condition_id` | 必填 |
| `condition_position` | 必填 |
| `density_x` | 必填 |
| `density_solid` | 必填 |
| `density_dashed` | 必填 |
| `focal_x` | 必填 |

## 判据

- Density X 和 Condition Position 的表头必须同时写明科学含义与单位；条件轴必须是真实实验变量，不能使用装饰性序号。
- Year、年份、年度可作为日历条件轴，单位按 year 处理；其他条件轴仍需在表头明确单位。
- 六个冻结角色键为 condition_id、condition_position、density_x、density_solid、density_dashed、focal_x。
- 仅支持 2–6 个 Condition ID；每个 ID 必须唯一对应一个 Condition Position，每组至少 5 个完整横轴点。
- Density X 在每组源顺序中严格单调且所有组方向一致；Condition Position 按 Condition ID 首次出现顺序严格递增。
- Focal X 在每组必须恰好一行非空并落在该组 Density X 范围内；它只是在 Z=0 基线上的定位点，不代表软件计算的峰值或交点。
- Threshold X、阈值点、峰值或交点列不自动等同于 Focal X，必须先由用户确认其基线定位语义。
- 本路线已通过真实 Origin OPJU、PNG/PDF/TIF、对象反读与人工视觉验收；仍不得把焦点解释为软件计算结果。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
