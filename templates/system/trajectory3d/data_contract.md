# trajectory3d 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/trajectory3d/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：仅接受 X/Y/Z/Series 长表；Y 必须是真实实验变量并在列名中写明单位。
- **必填列**：Zreal（数值）、真实第三变量与单位（数值）、-Zimag（数值）、Series（组名）
- **数据布局**：长表；每行一个 XYZ 点；Series 标识 1–6 条轨迹
- **最少列数**：4
- **列名别名**（识别用）：Zreal/Z'/阻抗实部、Condition Position (mm)/Temperature (K)/真实条件变量、-Zimag/-Z''/负阻抗虚部、Series/样品/组别

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `x3d` | 必填 |
| `y3d` | 必填 |
| `z3d` | 必填 |
| `series_id` | 必填 |

## 判据

- 第三轴不能是装饰性序号；列名必须同时给出科学含义和单位。
- 不拟合、不计算等效电路、不添加电阻标注，也不修改源文件。
- 角色证据不完整时必须人工确认；缺少第三轴单位时拒绝绘图。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
