# signal_stack 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/signal_stack/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：上传Time、Channel、Amplitude长表；时间与幅度的单位写在列名括号里。
- **必填列**：Time (s)、Channel、Amplitude (uV)
- **数据布局**：长表，每行一个通道的一个已处理观测
- **最少列数**：3
- **列名别名**（识别用）：时间、通道、ROI、幅值、振幅、电压、响应、Intensity

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `x` | 必填 |
| `series` | 必填 |
| `category` | 必填 |

## 判据

- 每通道至少2个有限数值，时间已严格递增；允许不同通道使用不同采样时间，不自动对齐或插值。
- 保留通道首次出现顺序和所有源值；仅纵向显示偏移，共同幅度单位，不逐通道归一化或居中。
- 通道标签和共同幅度尺放在页边，X轴只显示真实时间范围，Y数值刻度隐藏。
- 原始设备文件需先在上游处理成表格；不做滤波、重参考、去伪迹、事件检测或频谱分析。
