# 变更记录

## v2.9.0（2026-11-07）

- 安装即带 Origin MCP：`server/` 随包分发 21 个文件（MIT，来源与 commit 见 `server/NOTICE.md`），`cordis.patch.yml` 插入 `plot-clone-origin-mcp` 条目；不再下载 tarball、不再自动注册 connector，首次启动只建 venv。
- 同名冲突改为只读检测：面板红条 + 「停用旧连接」发一条消息给 agent（备份 → 停用 → 重启），本插件**从不**写 `mcp_connector.json`，请求落 `mcp-migration-request.json` 留痕。
- 依赖安装三步进面板：stage / progress / 失败原因 / 可复制的三条命令（含清华镜像）/ 镜像提示 / 重试；`bootstrap.json` 状态直接显示在面板，`--check` 可给脚本判定。
- 自检：新增 `test/patch_check.mjs`（静态 22 项 + 组合 0 重复 id/serverName + 三条变异真红 + `--handshake` 真握手 76 工具）。
- 面板：可取消选择——`POST /plot-clone/selection` 接受 `null`/空串，顶部「取消选择」+ 卡片「已选 / 取消」，落盘后 `--selected` 报 `none`。
- 面板：系统模板可改名——新增 `GET|POST /plot-clone/aliases`，只写 `~/.dsh/dsh-plot-clone/aliases.json` 的显示名，仓库 `templates/system/*` 零改动；用户模板仍改自己的 `meta.json`。
- 面板：★ 收藏与「重命名」统一到每张卡（系统 + 用户），收藏档计数按实际收藏数；`--check` 增悬空别名断言。
- 文档：README 精简为速查（7 节 / 60–90 行），细节留在 `SKILL.md` 与本文件。

## v2.8.0（2026-11-05）

- 审计七项：删用户模板同时摘收藏（`--check` 覆盖 `selection.json`）、禁止 `doc -o` 打开 `.oth`、三个读数坑进硬坑清单、`templates_index.py --match`、用户模板缩略图改由 agent 侧补、`index.data_contract` 逐字镜像 `schema.json`、第 4 步补「点名模板 id」流程。
- 编号规范收敛为「第 N 步」连续整数一套，去掉 `5.1`、`### 1.` 这类层级号。
- 技能与插件自此同号：`v2.8` / `2.8.0`（`0.1.1` 未发布使用）。

## v2.7（2026-11-03）

- 科研投稿规格定档：规格卡增 `pub_target` / `pub_limits` / `stats`，新增第 2 步与 `figure_metrics.py --pub-check`（灰度 ΔL* / 色盲 ΔE00 / 白底对比度），自检扩到 17 条。
- 范围收回到只做 Origin 复刻：矢量与 3D 通道实测不可用，已移除。

## v2.6（2026-11-01）

- 量测层重写：新增 `pixel_core.py`（阈值/取色/框检测/装饰带/刻度/点径/文字行只此一份）与 `test_synth.py`（29 条合成真值断言）。
- 修 14 处实测缺陷，判据按实测精度重定（frame ≤1px / band <5% / dot ≤10% 或 ≤1px / tick ≤2px）。

## v2.0

- 改为通用方法论：量测前置、图元→通道映射表、能力表、硬坑清单。

## v1.5 及更早

- v1.5 注释 y 口径 / 面积填充底锁定轴下限 / 装饰条留白缝；v1.4 装饰条贴基线；v1.3 fill-to-next 不吃 `-pfm` 与列短名；v1.2 面积渐变已验证；v1.1 填充形态进卡；v1.0 初版。
