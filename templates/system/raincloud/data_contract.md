# raincloud 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/raincloud/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：比较多个模型、组别或扫描条件的原始观测分布。
- **必填列**：一个或多个原始数值列，每列至少 5 个观测
- **数据布局**：宽表，每个数值列代表一组
- **最少列数**：1
- **列名别名**（识别用）：Baseline/Proposed、对照/处理组、模型A/模型B

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `series` | 必填 |

## 判据

- Origin 使用已隔离验证的 Box_HalfViolin 官方主题。
- 密度、原始点和均值 ± 1 SD 都是显示对象；源 CSV/XLSX 保持不变。
- 不静默删除异常值，也不把小样本伪装成稳定密度。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
