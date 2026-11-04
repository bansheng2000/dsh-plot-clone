# diagnostic_curve 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/diagnostic_curve/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：比较医学分类模型的区分能力；ROC 与 PR 使用不同的明确输入合同。
- **必填列**：ROC：FPR + 一个或多个 TPR；PR：Recall + 一个或多个 Precision
- **可选列**：PR 模式需要一列恒定 Prevalence；AUC/AUPRC/CI 只作为用户提供的说明
- **数据布局**：宽表，每个模型一列
- **最少列数**：2
- **列名别名**（识别用）：FPR/假阳性率、TPR/敏感度、Recall/召回率、Precision/精确率、Prevalence/患病率

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `x` | 必填 |
| `series` | 必填 |
| `reference` | 可选 |

## 判据

- 不从标签和预测分数静默计算曲线、AUC、CI 或 DeLong 检验。
- ROC 使用 0–1 方形数据区和机会参考线；PR 使用显式患病率基线。
- 示例库同时提供 ROC 与 PR 两种规范文件。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
