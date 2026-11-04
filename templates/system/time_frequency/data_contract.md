# time_frequency 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/time_frequency/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：上传含单位的 Time、Frequency、Power（或 Value）三列完整规则网格。
- **必填列**：Time (s)、Frequency (Hz)、Power (dB)
- **数据布局**：长表，每行一个时间×频率单元
- **最少列数**：3
- **列名别名**（识别用）：时间、频率、功率、数值

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `x` | 必填 |
| `frequency_axis` | 必填 |
| `series` | 必填 |

## 判据

- 时间、频率、数值的单位必须在列名括号或方括号中明确；中文列名支持人工映射。
- 不做FFT、STFT、小波、滤波、重采样、dB转换或基线处理。
- 保留全部单元和两个坐标的原有方向；不等距、缺格、重复坐标或非有限值停止并说明。
- 色阶只表达所给值的高低，负dB不会被自动解释为相对基线的下降。
- 半格边缘仅定义可视单元边界，不是增加新的观测。额外列需要逐一确认保留用途。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
