# event_raster 数据契约

> 来源：https://github.com/hang-jin/editaplot `runtime/templates/event_raster/data_contract.md`（Apache-2.0）。本文件按本 skill 字段重写，非原文照抄。

## 需要什么数据

- **用途**：上传Time、Trial、Condition长表；时间单位写在列名括号里，空Time可显式声明无事件试次。
- **必填列**：Time (s)、Trial、Condition
- **数据布局**：每行一个已提供事件，或一个空Time的试次清单项
- **最少列数**：3
- **列名别名**（识别用）：时间、事件时间、试次、试次编号、条件、组别

## 列角色（机器读，见同目录 `schema.json`）

| 角色 | 是否必填 |
|---|---|
| `x` | 必填 |
| `category` | 必填 |
| `series_id` | 必填 |

## 判据

- 按首次出现顺序从上到下保留1–200个试次，每试次仅属于一个条件，最多8个条件。
- 空Time不是0事件时间；该试次保留空白泳道，原始表不修改。
- 仅将Trial映射到显示序号；不检测spike、不排序效果、不计算PSTH或发放率。
- 密集图只稀疏显示文字，不删除试次或事件；条件说明在图外且无框。
- **本 skill 尚未实跑**，以上列约束来自上游声明，未逐条验证。
