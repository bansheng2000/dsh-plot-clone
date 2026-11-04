# shap_dashboard 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/shap_dashboard/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：上传外部预计算 SHAP 长表；Feature Group 是双层环图必需字段。
- **必填列**：Feature、SHAP value、Feature value、Feature Group
- **可选列**：Sample ID、Feature Order、Mean absolute SHAP、Group contribution (%)
- **数据布局**：长表，每行一个样本-特征观测
- **列名别名**（识别用）：特征、SHAP值、特征值、特征组、样本编号、特征顺序、平均绝对SHAP、组贡献百分比

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `feature` | 必填 |
| `shap` | 必填 |
| `feature_value` | 必填 |
| `feature_group` | 必填 |
| `sample_id` | 可选 |
| `feature_order` | 可选 |
| `mean_abs_shap` | 可选 |
| `group_contribution` | 可选 |

## 判据

- 支持 2–20 个特征、2–5 个特征组，每个特征至少 3 个观测。
- 原 SHAP 横坐标保持不变；Feature value 仅组内归一化映射连续颜色。
- 条形标注与双环使用总 Mean |SHAP| 的相同比例分母，派生项先明确确认。
- 外环是特征组、内环是组内特征；环图按组排列，条与蜂群保留输入或明确 Feature Order。
- 可选 dashboard_blue_red（蓝白酒红）、dashboard_viridis（紫绿金）、dashboard_red_blue（红黄蓝）。
- 不训练模型、不计算 SHAP、不复制参考图数值、不自动推断分组。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
