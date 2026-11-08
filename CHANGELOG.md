# 变更记录

## v2.10.3（2026-11-08）

**本版四件事：云端模板（OriginLab Graph Gallery）、云端选用、面板显示修复、27 张证据图去掉左上角 `C`。**

- **证据图去 C**：27 张 `templates/evidence/*.png` 全部在新图页上重出（1800×1276，C 框 `(5,149)-(59,236)` 暗像素 0）；C 只在栅格导出路径出现、空白页也有，与 opju 文件无关——换进程后即消失，所以判据定成「C 框内暗像素 0」而不是「左侧 6.5% 带 0」（后者会把纵轴标题误判成残留）。9 张原数据未存档的按各自 `visual_contract` 同规格重画，md 逐张写明「数值与原图不同」；`time_frequency` 复核后本来就没有 C，保持原图。
- **面板显示三处修复**：① 云端块没有滚动容器，外层 742px 且 `overflow:hidden` 会把内容直接裁掉 → 补 flex 列容器 + `min-height:0`，列表内部滚动；② 整面板改 `overflow-y:auto`，MCP 进度条/提示条再高也能滚出来（列表保留最小高度 180px）；③ 缩略图的 `aspect-ratio` 在纵向 flex 卡片里高度算成 0、网格自动行又被压进可视高度（修前卡片 133×48、缩略图 h=0）→ 缩略图改固定高度，网格 `grid-auto-rows:max-content`，并新增五档尺寸：超大 240/180、大 190/140、中 150/112、小 112/84、列表行式 52px，选择存 `localStorage` 的 `pc.view`，系统/用户/收藏/云端四个来源共用。
- **云端选用**：选中 id 走 `gid-<n>` 命名空间（`^gid-[1-9]\d*$`），已安装卡片加「选用」按钮、选中高亮并显示 `GID n · 标题` 与工程绝对路径；`/gallery/download` 首次安装成功自动写 selection，重复下载不改已选；删除正被选中的条目时 selected 归 null；未安装（`gid-9999`）与畸形（`gid-0`/`gid-abc`）一律 400。顺带修掉用户模板改名回执里 selection 不走 `selView` 的遗漏（选中云端时回执会丢 `selected_template`）。
- 自检：`gallery_test` 84 项、`selftest 28/28`、`patch_check` 全量 63/0、`--static 47`、`--static --mutate 50`；三处变异（放宽 `GID` 正则、允许写入未安装 gid、改名回执退回旧写法）均真红后还原。

### 云端模板（OriginLab Graph Gallery）

**模板多一个来源：OriginLab Graph Gallery。随包只带元数据，工程文件按需下载到本机，不进仓库、不随插件分发。**

- **三种来源彻底分开**：系统模板 `templates/system/`（49 套只读）／云端 `~/.dsh/dsh-plot-clone/gallery-templates/gid-<n>/`／用户 `user-templates/`。云端下载**绝不写进 `user-templates/`**（那里只放用户自己上传的）。
- **随包快照**：`scripts/build_gallery_index.mjs` 从 `.probe/gallery/` 的抓取结果生成 `templates/gallery/index.json`——617 条元数据，其中 455 条有下载链接、453 条有标题且可下载；`--check` 与磁盘比对。包内只有这一个 JSON，**没有任何 `.opj/.opju/.otp`**（`patch_check` 静态断言兜底）。
- **下载**：`POST /plot-clone/gallery/download {gid}` 服务端拉 zip（直连失败回落 `HTTPS_PROXY`，默认 `127.0.0.1:7890`），`lib/zip.js` 纯 Node 解包（只认 stored/deflate，拦掉 `../` 与绝对路径、超限、加密），解出工程文件写 `source.<ext>` + `meta.json`（sha256/bytes/许可）+ 本地缩略图；重复下载回 409，覆盖需显式确认；网络/404/无工程文件/版本不兼容都有结构化错误码。
- **面板**：模板页新增「云端」档，分类 全部 / 2D / 3D / 统计-QC / 专业坐标 / 其他 / 已安装（规则在 `lib/gallery.js`，带单测），支持标题 + 关键词搜索、详情（大图 / 来源页 / 许可）、下载、删除。
- **刷新**：只在用户点按钮时按 GID 枚举线上目录（列表页硬截断 199 条且无翻页，只能枚举），写 `gallery-cache.json`，报「上次刷新 / 新增 N 条 / 失败原因」；不后台跑、不开定时器。**「新增」只算有标题的条目**，空标题占位页单独计数——否则会把几十个空页报成新模板。
- 许可：Graph Gallery 工程是 OriginLab 版权作品，仅本机个人使用，不二次分发；`meta.json` 与面板详情都写死这句。
- **实测口径**：真点一次刷新扫 1728 个 GID、150 s，站点返回 701 个页面，**有标题的新增 0 条**、空标题占位 84 个、失败（HTTP 500）1027 个；包内快照是 617 条（其中 594 条有标题），所以「新增」报 0 才对——站点扩容的只是空占位页。
- 自检：`gallery_test` 57 项（schema / 白名单 / 分类 / zip 解包与路径穿越 / 下载与错误分支 / 刷新口径）、`patch_check` 静态与全量各增一段、`selftest 25/25`（新增「云端面板」一条：7 个分类 chip 带计数、3 张卡片带可下载/仅查看/已安装徽标、详情出许可与来源页、下载与刷新各打自己的路由）。

## v2.10.2（2026-11-08）

**补随包漏掉的 `origin_e2e.py`（`origin_figure` 全线崩溃），并把「遇到弹窗就点第一个按钮」改成有策略的安全点击。**

- **`origin_figure` 报 `No module named 'origin_e2e'`**：2.10 把 `server/` 随包时漏了这一支，而 `origin_engine.py` 的 `figure` / `warmup` / `pages_gc` 三处都 import 它，工具直接抛 `TOOL_EXCEPTION`。补回文件并同步 `VENDOR.md` / `NOTICE.md`；实测 `origin_figure` 2353 ms 出图（此前必失败）。
- **旧看门狗的两个真问题**：`_watchdog_dismiss_modals()` 用精确文本匹配 `是`/`否`，中文 Windows 的按钮是 `是(Y)`/`否(N)`，一个都命中不了 → 弹窗点不掉，只能等 90 秒软超时（实测连导 16 张图只成功 6 张）；就算命中，保存确认框的第一个按钮是「是」= 替用户保存并覆盖工程文件。
- **新增 `server/origin_dialogs.py`**：按弹窗标题 + 正文 + 按钮分类（`project-save` / `overwrite` / `error` / `warning` / `unknown`）。保存与覆盖一律点「否」或「取消」，错误与警告点「确定」，认不出的**不点**、只把标题与按钮回报。`origin_status` 新增 `dialogs` 字段，随时能看 Origin 正卡在哪个框上；`_watchdog_dismiss_modals()` 改为调用它。
- 自检：`patch_check` 47 项（新增「弹窗判定 6 组」）、`selftest 24/24`、`--static --mutate` 34 项真红。真机闭环：弹一个 `是(Y)/否(N)/取消` 模态框 → 枚举到 → 判为 `project-save` → 点「否(&N)」→ 对话框返回 `False`（否）。
- 已知未做：`templates/evidence/*.png` 里 27 张历史证据图仍带一个页面级 `C`（11-05 那次重出时烧进去的），重出在下一版做；当前工程里的图页本身没有该对象。

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
