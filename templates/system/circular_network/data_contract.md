# circular_network 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/circular_network/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：用长表描述不同面板中的有向关系；线宽编码权重，颜色编码已提供的正负语义。
- **必填列**：Panel、Source、Target、Weight
- **可选列**：Sign、SourceGroup、TargetGroup、EdgeLabel
- **数据布局**：有向边长表；每行一条边；支持 1–4 个面板
- **最少列数**：4
- **列名别名**（识别用）：Panel/Period/阶段/时期、Source/From/来源/起点、Target/To/目标/终点、Weight/Value/权重/强度、Sign/Direction/符号/正负、SourceGroup/来源组、TargetGroup/目标组、EdgeLabel/边标签

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `panel` | 必填 |
| `source` | 必填 |
| `target` | 必填 |
| `weight` | 必填 |
| `sign` | 可选 |
| `source_group` | 可选 |
| `target_group` | 可选 |
| `edge_label` | 可选 |

## 判据

- Weight 必须是大于零的有限数；正负关系由可选 Sign 单独提供，不能把负权重当作线宽。
- 不接受自连接或同一面板内重复的 Source→Target；节点组在所有行中必须保持一致。
- 最多支持 4 个节点组；单面板超过 12 条边时保留 EdgeLabel 源文字但默认不在图中显示。
- 本路线已经通过 Origin 2024b 的 OPJU、PNG、PDF、TIF、对象反读和人工视觉验收。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
