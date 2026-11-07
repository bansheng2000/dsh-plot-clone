# 变更记录

## v2.10.1（2026-11-07）

**补 v2.10.0 的两个生产环境 bug。** v2.10.0 的 Release 保留但请用本版；装过 2.10.0、且首次启动时 bootstrap 报过 `WinError 183` 的机器，本版启动会自动把镜像就地升级。

- **镜像升级必然失败**：state 镜像目录就是运行中 MCP 进程的 cwd，Windows 下既删不掉也改不了名，`rmtree + rename` 静默报 `WinError 183`，镜像停在旧版本——空闲释放的代码根本没进到实际运行的 server。改成逐文件 `copy2 → os.replace` 就地替换、删残留旧文件、写完复算哈希；二次运行只校验。
- **生产握手报 `0.0.0-dev`**：镜像里没有 `package.json`（插件本体在 profile 的 `node_modules`），版本只认 `package.json` 会退回开发版号。改成 bootstrap 每次写 `state/VERSION`，server 依次读「env → package.json → VERSION」。
- 自检：`patch_check` 46 项（新增「镜像 VERSION 握手」与两条静态断言）、`selftest 24/24`、空闲释放单测 9/9。

## v2.10.0（2026-11-07）

**本版把 v2.9 发布后才落地的「装插件即带 Origin MCP」补齐，并修掉它带来的常驻副作用。**

- 安装即带 Origin MCP：`server/` 随包分发（MIT，来源与 commit 见 `server/VENDOR.md`），`cordis.patch.yml` 插入 `plot-clone-origin-mcp` 条目；不再下载 tarball、不再自动注册 connector，首次启动只建 venv（仅当包内缺 `server/` 才回落到 pinned 下载）。
- 版本单一真源：`serverInfo.version` 启动时读本包 `package.json`（`PLOT_CLONE_PACKAGE_JSON` 可覆盖供测试）；上游 fork 版本（2.7.5 / `03acc24…`）记在 `VENDOR.md` 与 `origin_status.upstream`。
- 快照不被覆盖：包内 `server/` 为唯一真源，state 镜像每次启动校验哈希、不一致以包内为准重写；新增 `scripts/vendor_sync.mjs --from <dir|tgz>`（只打印差异，不写盘、不联网）。
- 同名冲突改为只读检测：面板红条 + 「停用旧连接」发一条消息给 agent（备份 → 停用 → 重启），本插件**从不**写 `mcp_connector.json`，请求落 `mcp-migration-request.json` 留痕。
- 依赖安装三步进面板：stage / progress / 失败原因 / 可复制的三条命令（含清华镜像）与重试；`bootstrap.json` 状态直接显示在面板。
- **空闲自动释放 Origin（修复「另一个应用正在控制」）**：MCP 进程随 DSH 常驻，以前首次 `origin_*` 调用后一直占着 Origin，用户手动打开只能任务管理器强杀。新增 `server/origin_idle.py`：旁路线程按空闲阈值（默认 120s，`DSH_ORIGIN_IDLE_RELEASE` 覆盖，`0` 关闭）调 `engine.release()`，只清 COM 引用并显示窗口、不杀进程；`origin_engine.is_connected()` 是只读标志，不碰 COM。正在执行的调用永不打断，释放后下一次调用自动重连。
- 自检：`test/patch_check.mjs` 静态 31 项 / 完整 40 项（含空闲释放单测真跑、三条 YAML 变异真红、真握手 76 工具、版本可变证伪）；新增 `test/origin_idle_test.py`（9 项）与 `test/origin_idle_live_test.py`（真机：连接 → 空闲释放 → status 未连接 → 重连，Origin 进程 1→1 未被杀）。

## v2.9.0（2026-11-07）

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
