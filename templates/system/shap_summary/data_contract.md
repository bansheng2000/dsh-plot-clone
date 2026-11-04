# shap_summary 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/shap_summary/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：展示模型外部预计算的逐样本 SHAP 值，不在 Origin 中运行解释算法。
- **必填列**：Feature、SHAP value、Feature value
- **可选列**：Sample ID、Feature Order、Mean absolute SHAP、Feature Group、Group contribution (%)
- **数据布局**：长表，每行是一个样本-特征观测
- **最少列数**：3
- **列名别名**（识别用）：特征、SHAP值、特征值、样本编号、特征顺序、平均绝对SHAP、特征组、组贡献百分比

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `feature` | 必填 |
| `shap` | 必填 |
| `feature_value` | 必填 |
| `sample_id` | 可选 |
| `feature_order` | 可选 |
| `mean_abs_shap` | 可选 |
| `feature_group` | 可选 |
| `group_contribution` | 可选 |

## 判据

- 每个特征至少 3 个完整观测，至少 2 个不同特征。
- Feature value 仅在每个特征内部归一化为颜色；原 SHAP 横坐标保持不变。
- 未提供 Mean absolute SHAP 时，可从用户给出的逐行 SHAP 值计算 mean(abs(SHAP))，但必须在元素清单中明确并由用户确认。
- 提供 Feature Group 后，可生成分组贡献面板；未提供百分比时，按组汇总 Mean |SHAP| 后归一到 100%，同样需要确认。
- 不训练模型、不运行 SHAP、不补造模型输出、不静默重排特征。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
