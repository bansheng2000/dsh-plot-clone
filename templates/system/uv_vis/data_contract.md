# uv_vis 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/uv_vis/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：绘制单样品或多样品 UV–Vis 吸收/透射曲线和可选 Tauc 插图。
- **必填列**：Wavelength、一个或多个 Absorbance/Transmittance 系列
- **可选列**：Photon energy、Tauc value、Tauc fit、Band gap
- **数据布局**：宽表；多光谱系列按源列顺序保留；可选插图列允许列尾空白
- **最少列数**：2
- **列名别名**（识别用）：Wavelength/波长、Absorbance/吸光度、Transmittance/透过率、Photon energy/光子能量、Band gap/带隙

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `x` | 必填 |
| `series` | 必填 |
| `photon_energy` | 可选 |
| `tauc` | 可选 |
| `tauc_fit` | 可选 |
| `bandgap` | 可选 |

## 判据

- 不从波长静默计算光子能量，不选择 Tauc 指数，不拟合，不求 Eg。
- 只有 Photon energy 与 Tauc value 同时存在时才创建插图。
- Band gap 若存在必须为一个重复常数或单个非空显式值。
- 不嵌入参考论文的样品照片、箭头或文字；这些元素可在后期排版中添加。
- 波长加未知数值系列但没有 Absorbance/Transmittance 语义时，必须让用户确认。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
