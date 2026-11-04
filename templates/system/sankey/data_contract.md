# sankey 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/sankey/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：用带宽表示来源节点到目标节点之间的正权重流量。
- **必填列**：来源 Source、目标 Target、正数权重 Value
- **数据布局**：三列长表
- **最少列数**：3
- **列名别名**（识别用）：Source/From/来源/起点、Target/To/目标/终点、Value/Weight/Flow/数值/权重/流量

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `source` | 必填 |
| `target` | 必填 |
| `value` | 必填 |

## 判据

- 每行是一条有向连接，权重必须大于零。
- 当前不接受自连接；高密度网络会提示人工检查标签可读性。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
