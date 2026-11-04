# nmr 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/nmr/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：绘制化学位移与一个或多个预处理完成的 NMR 强度系列。
- **必填列**：Chemical Shift/化学位移列、一个或多个 Intensity/强度数值系列
- **数据布局**：宽表
- **最少列数**：2
- **列名别名**（识别用）：Chemical Shift/化学位移、ppm、NMR Intensity/核磁强度

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `x` | 必填 |
| `series` | 必填 |

## 判据

- 化学位移按 NMR 惯例由大到小显示，核种只在源表明确给出时保留。
- 不自动做相位校正、基线校正、积分、峰识别、峰归属或定量。
- 多谱线默认直接叠加；只有用户明确确认后才能增加显示偏移。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
