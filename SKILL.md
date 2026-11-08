---
name: dsh-plot-clone
description: 【仅限明确要求复刻时使用；只说"画图/作图"、没有参考图时不要用本 skill，走 origin-plotting 的 origin_plot_plan】把参考图（论文插图/别人的成品图/截图）复刻成 **Origin 数据图**的 SOP：第 0 步像素量测取色与几何比例 → 规格卡 → 选模板（49 个系统模板，命中就走模板通道，未命中走自由构图）→ 图元到 Origin 通道映射 → 2~3 轮「渲染-对照-差量修正」→ verify + 交付。含参考图红线（不反推数据/不抄文字水印/不承诺 1:1）、能力表（能/只能逼近/做不到）与实测硬坑清单。当用户给参考图说"画成这样""复刻这张图""照着排版"时使用。可由领域 SOP（如 dsh-xps-peakfit）委派来只做风格对齐。触发词：复刻 / 照着画 / 画成这样 / 模仿这张图 / 参考图排版 / replicate figure。
whenToUse: 仅当用户**明确要求复刻/照着某张图**（"复刻"、"照着画"、"画成这样"、"模仿这张图"、"参考这张排版"）或领域 SOP 委派来做带参考图的风格对齐时使用。**用户只说"画个图/帮我作图"且没有参考图时不要用本 skill**，改走 `origin-plotting` 的 `origin_plot_plan`→`origin_execute_plan` 数据驱动选图型路径。
---

# 参考图复刻 SOP（通用版）

> v2.0：改成「任意类型图」的方法论——新增第 0 步强制量测（`measure_ref.py`，颜色和几何比例都从像素来，禁止目测）、图元→通道映射表、能力表（能/只能逼近/做不到）。v1.x 的单图经验收敛进硬坑清单。
> v2.1：加 `figure_metrics.py`（参考图 ↔ 成品图量化并排对照，收敛循环靠它而不是肉眼）；新增硬坑 11/12（COM 异常可 `origin_release` 救回但工程会丢、字号/点径的正确通道）。
> v2.2：借 editaplot 的参考图契约——新增第 3 步「样式台账」（每字段三态 applied / retained_default / rejected + 来源优先级 + 允许清单），收尾加「缺读回=失败」；参考图只给文字**角色**，不给文字内容。
> v2.7（2026-11-03）：科研投稿规格定档（第 2 步 + `pub_target`/`pub_limits`/`stats` + 自检 17 条 + `--pub-check` 可辨三查）；**同时把范围收回到只做 Origin 复刻**——矢量（Illustrator/SVG）与 3D（Blender）两条通道实测达不到可用水平，已移除，判型选通道那一步不再存在。
> v2.8（2026-11-05）：**技能与插件自此同一版本号**_（此前技能 v2.x / 插件 0.x 两条线并存，0.1.1 未发布使用）_。内容：审计七项落地——删除用户模板同时摘收藏（`--check` 覆盖 `selection.json`）、禁止 `doc -o` 打开 `.oth`、三个读数坑进硬坑清单（`list_pages.graphs` 恒空 / `origin_status.origin_exe` 报错版本 / GDI `#32770` 卡 COM 60s）、`templates_index.py --match` 按 `data_contract` 找候选、用户模板缩略图改由 agent 侧 `origin_export(width=600)` 补、`index.data_contract` 必须逐字镜像模板自己的 `schema.json`、第 4 步补「点名模板 id」三步流程；**编号规范收敛为「第 N 步」连续整数一套**，第 4 步下的子标题去掉 `1. 2. 3.` 层级号，全文不再有 `5.1` 这类编号。插件 `package.json` 与 SKILL 版本号此后一致推进。

> v2.10.3（2026-11-08）：**云端模板（OriginLab Graph Gallery）+ 云端选用 + 面板显示修复 + 27 张证据图去 C**。云端模板：**云端模板（OriginLab Graph Gallery）**——模板多一个来源，与系统模板（随包 49 套只读）、用户模板（只放用户手传）彻底分开：下载件落 `~/.dsh/dsh-plot-clone/gallery-templates/gid-<n>/`，包内只有 `templates/gallery/index.json` 元数据（617 条，453 条有标题且可下载），**不含任何 `.opj/.opju/.otp`**。面板「云端」档按 全部 / 2D / 3D / 统计-QC / 专业坐标 / 其他 / 已安装 分类，可搜索、看详情（来源页 + 许可）、下载、删除；「刷新目录」只在点击时按 GID 枚举线上目录（列表页硬截断 199 条且无翻页），报上次刷新时间与新增条数，不后台跑。许可：Graph Gallery 工程是 OriginLab 版权作品，仅本机个人使用、不随插件分发；版本不兼容时如实回 Origin 的原话。同版补：已安装条目可「选用」（选中 id 写 `gid-<n>`，下载首装自动选用、删除即清空，未安装与畸形 id 一律 400）；面板新增五档卡片尺寸（超大/大/中/小/列表，240/180、190/140、150/112、112/84、行式 52px，存 localStorage `pc.view`）与整面板滚动；27 张证据图全部重出，C 框 (5,149)-(59,236) 暗像素 0，其中 9 张无数据存档的按同规格合成数据重画并在 md 写明数值与原图不同。
> v2.10.2（2026-11-08）：**弹窗识别与安全点击**——新增 `server/origin_dialogs.py`，按标题/正文/按钮把模态框分类，保存与覆盖一律点「否」或「取消」、错误与警告点「确定」、认不出的不点只回报；`origin_status` 的 `dialogs` 字段可看 Origin 正卡在哪个框上。旧看门狗「见到白名单按钮就点第一个」在中文 Windows 上既匹配不上 `是(Y)`/`否(N)`（只能等 90 秒超时），又会把保存确认框的「是」点掉。同版补回随包漏掉的 `server/origin_e2e.py`（`origin_figure` 曾全线报 `No module named 'origin_e2e'`）。
> v2.10.1（2026-11-07）：**Origin MCP 随插件分发**——`server/` 21 个文件（MIT，来源与 commit 见 `server/VENDOR.md`）进 npm 包，`cordis.patch.yml` 插 `plot-clone-origin-mcp`（serverName `dsh-origin`，工具前缀 `mcp__dsh-origin__*`）；不再首启下载、不再自动写 `mcp_connector.json`。**版本跟着插件走，不单独发版**：`serverInfo.version` 启动时读本包 `package.json`，上游 fork 版本（2.7.5 / `03acc24…`）记在 `VENDOR.md` 与 `origin_status.upstream`。`server/` 是冻结快照，包内为唯一真源（state 镜像每次启动校验哈希，不一致以包内为准重写）；要跟进上游跑 `node scripts/vendor_sync.mjs --from <dir|tgz>`，只打印差异、不写盘、不联网。同名连接只做只读检测：面板红条 + 一键把停用请求发成消息（备份→停用→重启），请求落 `mcp-migration-request.json`。首启只建 venv，进度/失败原因/可复制命令（含镜像）都在面板，`lib/bootstrap.py --stage venv|server|register --status --check` 可手动复跑。面板另加取消选择、系统模板别名（`aliases.json`）、每卡 ★ 与重命名；README 精简为速查，细节以 `SKILL.md` 为准。 **v2.10 增补**：新增 `server/origin_idle.py` 空闲自动释放（默认 120s，`DSH_ORIGIN_IDLE_RELEASE` 覆盖，`0` 关闭）——释放 COM 引用并显示窗口、不杀进程，下一次调用自动重连；修掉「另一个应用正在控制 Origin」，不停在任务管理器强杀。

> v2.6（2026-11-01）：量测层重写——新增 `pixel_core.py`（阈值 / 取色 / 框检测 / 装饰带 / 刻度 / 点径 / 文字行只此一份）与 `test_synth.py`（29 条合成真值断言，改量测代码必须先跑它）；修 14 处实测缺陷（框坐标 −2px、渐变带报 3px、4x 刻度报 25px、点径上限砍掉大游程、细线色被降采样丢弃、半宽与多面板量不到框、两取色器口径不一、反斜杠路径打整条）；判据按实测精度重定（frame ≤1px / band <5% / dot ≤10% 或 ≤1px / tick ≤2px），做不到的三项（多段非单调渐变、>40px 大符号、无闭合框组图）明写进文档。

目的：把"看着像"变成"逐字段对得上"。入口是量测 + 规格卡，出口是一张差量表为空的图。

## 触发边界（先判这条，再决定走不走复刻）

| 用户说的话 | 走哪 |
|---|---|
| 「复刻 / 照着这张画 / 画成这样 / 模仿这张图 / 参考这张排版」+ 给了图 | **本 skill** |
| 给了图，但只说「参考一下配色 / 看看风格」，没要求整体复刻 | 先问一句；不明确就**不套**复刻流程 |
| 只说「画个图 / 出张图 / 帮我作图 / 这张数据画什么好」，**没有图** | **不要用本 skill** → 先 `python templates_index.py --match --roles <角色> --ncols <列数>` 看 49 套里有没有现成的 `implemented` 候选（命中就走模板、省一轮；`--match` 只推荐 implemented，缺列/缺角色会写出来）；再走 `origin-plotting`：`origin_plot_plan`（逐列画像 → 角色建议 → questions → 确认 → `origin_execute_plan`），领域模板用 `origin_plot_template`（stacked_spectra / xrd_pattern / dual_y / forest / multi_panel）|
| 领域 SOP 委派（如 dsh-xps-peakfit）但只交数据 + 版面约束、没有参考图 | 不套复刻 → 上游按 `origin-plotting` 建图；本 skill 只接「带参考图的风格对齐」|

| 「用 matplotlib / Python 画就行」「随便哪个软件」 | 先按红线 6 说明：本流程只出 Origin 图；要换引擎需你明确批准 |

判据一句话：**有没有"要照着的那张图"**。有 → 复刻（量测 → 规格卡 → 台账 → 差量收敛）；没有 → 数据驱动选图型（`origin_plot_plan` 的列画像 + questions 就是选型依据），两套流程不混。

**科研投稿图再加一条**：只要图里有坐标轴 + 数据系列（误差棒 / 单位 / 显著性标记按需），规格卡必须同时填 `pub_target` / `pub_limits` / `stats`，并走第 2 步定档——**投稿合规优先于"像不像"**，两者冲突时先满足期刊要求再谈复刻相似度。

## 第 0 步之前：会话隔离（每会话一个 Origin 工程）

复刻开始前先判工程归属：`origin_status` → `origin_list_pages`。

- 页面为空或只有一个空 `Book1` → 直接开工。
- 页面里已有**别的任务**的工作簿/图页（或拿不准）→ `origin_new_project(path="<本任务>.opju")`：先存旧工程再建新工程，确认只剩空 Book1 再写数据。**不要直接丢，也不要接着在别人的工程里加页面**。
- 收尾固定 `origin_save_project` 存本会话专属 .opju（三格式之一）。

坑：未保存直接 `doc -n` 会弹「是否保存」模态框，后续 COM 调用全部 60s 超时；`origin_new_project` 已内置「先存后建」。
坑：本机残留 **2 个 Origin64 进程** 会让 COM 连错实例，报 `<built-in function ApplicationBase_Path> returned a result with an exception set`——症状和"会话中毒"一样，先 `taskkill /F /IM Origin64.exe` 清干净再重连。

## 先划红线（前 3 条违反=造假，用户硬要也要先明说；第 6 条违反=自作主张换工具）
1. **Origin 画图必须建立在真实数据上，一个点都不许编**。数据只能来自用户给的数值/文件（给出文件路径与列名，交付时写明）；**禁止**：从参考图像素反推数据点、凭空造曲线/背景/基线、用"看起来合理"的数补齐缺失列、把模拟/示意数据当实验结果画。像素只用来读"图形语法"（颜色、线型、布局、字号、比例）。**没有数据就先要数据，不画假图**。
2. 不抄参考图里的文字、拟合参数、物相/峰标注、Logo、水印；标注内容一律用用户自己的。
3. 不承诺 1:1；交付话术固定为"布局与风格已对齐，数据为本实验数据"。
4. 参考图有、本插件没有的能力，如实说做不到，别硬凑一个近似品假装对齐（见能力表）。
5. **不许为了"像参考图"而平滑/插值/重采样用户数据**（参考图的包络平滑是它的画法，不是改数据的授权）。原始数据保持原样；确需平滑必须单独说明、保留原始列、并在交付话术里写清。
6. **只用 Origin（dsh-origin MCP）出图**，matplotlib / seaborn / R / GraphPad / Excel / PPT / AI 生图一律不算交付通道——Origin 报错（未授权 demo 态、COM 卡死）先按 `origin_diagnose`→`origin_release`→重开 opju 的顺序救，救不回来**停下来说明并等指令**，不许"那就换 matplotlib 顶上"。任何时候要换工具，**必须先向用户申请**：说明为什么 Origin 做不到 + 换成哪个 + 会丢什么（可编辑 opju、渐变/白遮罩通道、字号统一、AI 可编辑性），得到明确同意再动。

## 上游委派接口（被领域 SOP 调用时，如 dsh-xps-peakfit）

被别的领域 SOP 委派进来时：**只接风格对齐这一段，不替上游做领域判断**。

| 上游交什么 | 我这里怎么用 |
|---|---|
| 1 **数据文件** | 原始数据文件路径 + 列名与单位；**只给文件，不给截图或反推像素** |
| 2 **系列表** | 顺序＝图层顺序（散点 / 背景 / 各分量 / 总拟合），逐条给名称与含义；按清单建 series，不改数值、不乱改系列序 |
| 3 **绘制约定** | 同组多条线是否同色、实线/虚线、粗细优先级；没给就落规格卡 `series` 行并标 `unknown` |
| 4 **标注文本** | 要标的文本**逐字**给出（含数值/单位/归属），原样上 `origin_annotate`——不润色、不改一个字符 |
| 5 **轴** | x/y 标题与单位、范围、是否反向、刻度类型；落规格卡 `x` / `y` / `y2` |
| 6 **页面与字体** | 单栏 8.9cm / 双栏 18.3cm、字号下限；落 `canvas` / `fonts`，不覆盖上游下限 |
| 7 **禁止项** | 不许改数据、平滑、插值、画残差子图等；叠加到红线，**从严**执行 |
| 8 **参考图** | 有则给图，只表版面与配色意图；**没有参考图就不套复刻流程**，转 `origin-plotting` |
| 9 **交付要求** | 格式与分辨率（PNG ≥1800 宽 / PDF / 工程文件）；落收尾清单 |
| 10 **验收口径** | 图上每一项对着上游哪张表逐条核对、容差多少；交付时按此逐条回 |

**缺项不许开工**：10 项里缺 1/2/4/7 直接要，不许用「看起来合理」的值补（这条与红线第 1 条同源）。回给上游：规格卡 + 差量表结论 + 交付路径；**unknown 与未对齐项如实回报，不自行抹平**。

两种入口别混：**有参考图** → 走本 skill；**只有版面约束、没参考图** → 不套复刻流程，直接转 `origin-plotting` 常规建图。

## 第 0 步：量测（跳过这步 = 瞎画，返工一次就够）

```
python measure_ref.py 参考图.png --box band:330,282,470,300 --box peak:575,190,605,215
```

**解释器**：Windows 上别用裸 `python`（WindowsApps 存根静默退出码 49、零输出），用装好 numpy/Pillow 的解释器绝对路径，例如
`C:\Users\12576\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe`；先 `python -c "print(1)"` 探一下能打印再往下跑。框线偏浅被漏掉时加 `--dark 150`。

输出三样东西，分别对应后面要用的参数：
- `frame: rows/cols + plot pct` —— 外框占画幅的比例，倒推页面尺寸与图层几何（`origin_edit_page(page_size_cm=, layer_geometry_pct=)`）。
- `palette` —— 主色板，报的是**桶内真实平均色**（不是量化色）。占比最大的一般是背景/装饰条底色，先剔除再挑系列色。
- `box 区域取色` —— 指定矩形的主色，用来取"峰顶填充色 / 装饰条底色 / 文字颜色"这种局部色。

铁律：
1. **颜色必须来自像素**。目测配色是本 skill 最高频的返工原因（实测一次目测把 #DE90BA 估成 #D0618F、把深蓝文字估成黑色）。
2. **比例必须来自像素**（装饰带高占比、白缝高占比、外框占画幅），别用眼睛对齐。
3. 量不到的字段在卡里写 `unknown`，动手前一次性问用户，别猜两轮。
4. **绑哈希**：量测前记参考图 `sha256 + 尺寸 + 字节数` 进规格卡 `refs`（`sha256sum` 一行即可）。对外记录只留 hash，不留私有路径；换图就要重写卡，不许沿用旧卡。

精确取色补充：`extract_palette.py`（量化分桶 + 桶内真实平均）看全局色板；`measure_ref.py` 取局部区域 + 量比例。

**增量对照**（收敛循环每轮都跑，替代肉眼打分）：

```
python figure_metrics.py 参考图.png 成品图.png   # 并排输出可比的归一化量
python figure_metrics.py 成品图.png --json --band-hex "#FCE4EA" --dot-hex "#DE90BA"
python figure_metrics.py 成品图.png --pub-check --series-color "#0072B2,#E69F00"   # 第 2 步配色可辨三查
python test_synth.py                            # 改过量测代码就跑这个：29 条合成真值断言
```

**调用约定（缺测 ≠ 测得合格，必须能分辨）**：测不到的项在文本里是 `band: unmeasured(<reason>)`、在 `--json` 里是 `null` + `band_reason`，字段永不省略；`status` = `ok`（框+带+点径都测到）/ `partial`（框测到，带或点径没测到，或多面板）/ `none`（框没测到，其余读数不可比），rc 对应 `0/3/4`（`2` = 用法错误）。不给 `--band-hex` / `--dot-hex` 时按色板前几名猜，实际用的色值与来源（`palette_guess` / `cli`）写在输出里；`band: null` 且原因 `hex_not_found` 时先确认色值，别把「没测到」当成「没有装饰带」。多面板会给 `panel_count` + `panels[]`（逐面板 frame/band/tick），扁平字段置 `null` 并说明，不会拿两个面板混出一个假框。

**投稿可辨（第 2 步配色三查）**：`figure_metrics.py 成品图.png --pub-check` 直接验——① 相邻系列灰度亮度差 ΔL* ≥ 10；② Brettel 1997 色盲模拟（protanopia + deuteranopia，取 ΔE00 较小者）≥ 10；③ 对白底 WCAG 对比度 ≥ 1.5:1。不给 `--series-color` 时从成品图主色提；每项输出实测值 + 阈值，不达标时列出冲突系列（序号 + hex）、命中的模拟种类，并从 Okabe-Ito 八色里给一个能同时过 ΔL* 与 ΔE00 的换色建议。rc `0/3/4` = ok/partial/fail（缺测项 `null` + `*_reason`，字段不省略），用法错误 `2`。

统一口径 = 各自画幅归一化：`frame` left/top/w/h %、`band` 装饰带高/绘图高（`kind` = solid / gradient ）、白缝 %、`tick` 刻度长、`TEXT` 每行字高（`kind` = label / title）、`dot` 点径、`PALETTE` 主色（hex+计数+占比，与 `extract_palette.py` 同口径）。

**判据与量测精度**（阈值按修好后的实测精度定，不是拍脑袋）：`band/绘图高` 相对差 <5%、`dot` 差 ≤10% 或 ≤1px（取大者）、`tick` 差 ≤2px、`frame` 各边 ≤1px。本工具在合成真值图上的实测误差：frame / band / tick **0px**（断言公差 ±1px）、点径 0px（d=10 与 d=20）、渐变带 0px（公差 ±2px）、字高 ≤1px；真实截图带抗锯齿与缩放，会比这差，5%/10% 这一档就是留给它的。**做不到的精度不许写成能达到的数**：目前明确做不到的是「渐变带的多段/非单调渐变」与「点径 >40px 的大符号」（`dot_diameter` 有 `max_frac` 上限，超了会被当实线排除）。

## 第 1 步：规格卡（先写卡再动手，缺项写 unknown）

| 字段 | 取值 | 怎么读 |
|---|---|---|
| canvas | 单栏 8.9cm / 双栏 18.3cm / 方形 / 其它；宽高比 | 目测 + 投稿惯用尺寸 |
| geometry | 外框占画幅 %、图层四周留白 %、装饰带高 %、白缝高 % | measure_ref.py `plot pct` + 竖扫像素 |
| family | 折线 / 散点 / 线+符号 / 柱 / 箱线 / 堆叠谱 / XRD / 双Y / 森林 / 多面板 | 目测 |
| panels | 1×1 / 2×1 / 2×2 …；是否共享 X 轴 | 目测 |
| x, y | 轴标题（物理量+单位）、范围、刻度类型（线性/log10/ln）、是否反向、刻度朝内/外 | 目测 |
| y2 | 有无次轴、次轴标题与范围 | 目测 |
| series | 逐条：颜色 #hex、线宽 pt、线型、符号形状/大小、透明度 | measure_ref.py `box` + 目测 |
| fill | 形态：none / 纯色 / 渐变（起止色 + 方向 + 是否逐形状独立）/ 图案；作用对象；下边界（轴底 / 背景曲线 / 装饰带） | 放大看是否渐变 + `box` 取顶部与底部色 |
| deco | 装饰元素：整幅宽色带（含条内文字）、面板字母、刻线、参考线、水印 | measure_ref.py 量带高占比 |
| yerr | 误差棒有无与样式 | 目测 |
| legend | 位置（tr/tl/br/bl）、字号、有无边框 | 目测 |
| refs | 参考线 / 阈值线 / 峰位刻线 | 目测 + `layout_info` 坐标 |
| fonts | 字体族（有无衬线）、轴标题/刻度/标注字号 pt、颜色 | `box` 取文字色 + 目测字形 |
| pub_target | 投稿去向：期刊名 / 通用；成品宽度 mm（单栏 85 / 双栏 170 / 自定义）、成品高度上限 | 用户说；没说 → `unknown`，按 170 mm 画并注明 |
| pub_limits | 最小字号 pt、线宽 pt 区间、位图 dpi、导出格式（矢量 + 位图各要什么） | 期刊 Guide for Authors；未见 → 用下方默认档并注明 |
| stats | 误差棒含义（SD / SEM / 95% CI）+ n + 显著性标记的检验方法 | 用户给；没说 → `unknown`，**不许自造**（见第 2 步） |

## 第 2 步：科研投稿规格定档（科研图必过；非科研图可跳）

复刻对了但投不了稿 = 白做。**画之前**把这张表填进规格卡，缺项写 `unknown` 并在交付时说明。

| 项 | 常见要求 | 本机怎么落地 |
|---|---|---|
| 成品尺寸 | 单栏 85 mm（国内部分 89）、双栏 170–183 mm | `origin_edit_page(page_size_cm=...)`，1 mm = 2.834645 pt |
| 最小字号 | 正文 7–8 pt、轴标题 8–9 pt、标注 ≥6 pt（**按印刷尺寸算，不是屏幕看着不小**） | `layer.x.label.pt`、`TextN.fsize`、`origin_verify_graph(min_font_pt=7)` |
| 线宽 | 0.5–1 pt（<0.25 pt 印不出来，>1.5 pt 笨） | `origin_edit_plot(line_width_pt=)` |
| 位图分辨 | 线条图/示意图 600–1200 dpi；照片/显微图 300 dpi；**不许插值放大** | `origin_export(width=)` 按 dpi 反算像素宽（170 mm @600 dpi ≈ 4016 px） |
| 导出格式 | 矢量优先 PDF/EPS/SVG；多数期刊还要一套 300–600 dpi TIFF | 三件套 PNG+PDF+OPJU 是底线，投稿再补 TIFF |
| 配色可辨 | 红绿对色盲不可辨；灰度打印后仍要能分（相邻系列亮度差 ΔL ≥ 10） | Okabe-Ito 八色：`#000000 #E69F00 #56B4E9 #009E73 #F0E442 #0072B2 #D55E00 #CC79A7` |
| 字体族 | 多数期刊要 Arial / Helvetica / Times | **本机改不了字体族**（`TextN.font$` 静默 no-op）→ 画前在 Origin 模板里设好，或交付时明确写「请在 GUI 里把字体族改成 X」 |
| 统计标注 | 误差棒写明 SD / SEM / 95% CI 并给 n；`*`/`**`/`***` 写明检验方法与阈值 | **图上不写、图注里写**；只有误差棒没有定义 = 审稿人第一刀 |
| 图注 | 图内不放长句图注；面板字母 a/b/c 在左上角 | `origin_annotate` 加面板字母；图注写给用户，不进图 |

**mm → pt 换算（字号/线宽一律按最终印刷尺寸算）**：1 mm = 72/25.4 = **2.834645 pt**，1 pt = 0.352778 mm。同一张图从 170 mm 缩到 85 mm 单栏，视觉尺寸**减半**：`印刷 pt = 设定 pt × 目标宽 mm / 当前画布宽 mm`。

| 想在 85 mm 单栏上看到的字号 | 画布就按 85 mm 时设 | 画布按 170 mm 时设（最后缩半） |
|---|---|---|
| 6 pt（标注下限） | 6 pt | 12 pt |
| 7 pt（正文下限） | 7 pt | 14 pt |
| 8 pt（轴标题） | 8 pt | 16 pt |
| 9 pt（轴标题上限） | 9 pt | 18 pt |

线宽同理：0.5–1 pt 指**成品尺寸下的 pt**——在 170 mm 画布上要设 1–2 pt，缩到 85 mm 才回到 0.5–1 pt。`origin_edit_page(page_size_cm=...)` 先定页面物理尺寸，Origin 里的 pt 按该尺寸解释；**先定 mm、再设 pt**，顺序反了字号就不是你要的。

三条铁律：
1. **不许为了好看改数据**（平滑、截断、只画半段都不行，做了就写进图注）。
2. **不许自造统计**：用户没给 SD/SEM/CI、n、检验方法 → 标 `unknown` 并问，不许填"看起来合理"的值。
3. **字号按最终印刷尺寸算**：先定成品 mm 再定 pt；170 mm 上用 6 pt，缩到 85 mm 单栏就变 3 pt，看不见。

## 第 3 步：样式台账（每个字段必须落三态之一，不许含糊）

**来源优先级（高→低）**：① 用户明确给的值 ② 从参考图抽象出的、允许清单内的建议 ③ Origin/模板默认。
用户的值压过参考图；**用户给的值非法（超范围/不存在）→ 直接报错要正确值，不许静默回退默认**。

参考图只能动**允许清单**（本机实测能精确落地**且能读回**）：

| 允许清单 → 可 `applied` | 通道 |
|---|---|
| 系列颜色 hex | `set -pfb/-pff`、`origin_edit_plot(color=)` |
| 线宽 pt / 线型 / 符号形状 | `origin_edit_plot` |
| 符号尺寸（只改 size，**不删点**） | `symbol_size` |
| 填充透明度、渐变起止色 | `-pfm 3` + `-pfb/-pff` |
| 轴范围 / 刻度类型 / 反向 / 刻度与轴标题字号 | `origin_edit_axis`、`layer.x.label.pt` |
| 页面尺寸与图层几何 | `origin_edit_page` |
| 装饰带、白遮罩、文字位置与颜色 | LabTalk 派生列 + `TextN` |

**默认 `retained_default`（参考图改不动，除非用户明确要求且本机实测读回）**：字体族、图例位置/边框、网格、背景、面板结构、图表类型本身。
做不到的（如字体族 `TextN.font$` 静默 no-op）→ `rejected` 并写原因，别写成"差不多对齐"。

**台账格式（交付时贴给用户或上游）**：

| 字段 | 参考图 | 采用值 | 状态 | 依据 |
|---|---|---|---|---|
| 系列色 | #DE90BA | #DE90BA | applied | 像素取色 + 导出回读 |
| 带高/绘图高 | 14.7% | 14.6% | applied | `figure_metrics.py` 读数 |
| 字体族 | Arial | Times（Origin 默认） | rejected | `TextN.font$` no-op，只能 GUI 手改 |
| 图例位置 | br | 默认 | retained_default | 用户未要求，参考图不构成指令 |

**`unverified`（改了但读不回）不算 applied**：交付前必须降级为 rejected，或补一次导出取像素回读。

**渐变填充的 `applied_unverified` 不算 applied**：`origin_edit_plot(fill_mode="gradient", fill_top_color=..., fill_bottom_color=...)` 只回报 `applied_unverified`（该通道没有读回）。必须导出 PNG 后在**峰顶与底部各取一个点**的 hex（`measure_ref.py --box name:x0,y0,x1,y1`），与设的起止色对上才记 `applied`；取不到或对不上 → 记 `rejected` 并写原因。台账「依据」列写成「导出后峰顶/底取色：<hex> / <hex>」。只凭 `applied_unverified` 或「看着像渐变」就记 applied = 交付失败。

## 第 4 步：选模板（有就加速，没有就自由构图）

模板是**加速器，不是必经之路**。这一步只花几十秒：查得到就用，查不到就走自由构图，两条都是正常路径。

### 先看用户选了什么（手动选择优先于自动匹配）

插件在 DSH **右侧栏**加了一个「Origin 模板」标签（`sidebar.right.pane.tab`，key `dsh-plot-clone/templates`，只改显示名、标识符固定）：点开就是模板选择器，搜索 / 按来源过滤（`全部 / 预设 / 用户 / 收藏`）/ ★ 收藏 / 「用这个」，选中「预设」时下面再多一层分类子筛选（通用 / 光谱 / 电化学 / 医学 / 热分析 / 研究信号，各带该分类系统模板数），用户档里还能「＋ 上传模板」、重命名、删除。同一个页面也能直接开：`http://127.0.0.1:<DSH 端口>/plot-clone/`（无外部依赖，老版本宿主没这个标签时用它）。用户点「用这个」写的是：

```
%USERPROFILE%\.dsh\dsh-plot-clone\selection.json      # 设了 DSH_HOME 则在它下面
```

第 4 步开工先读它，别猜：

```
python templates_index.py --selected
```

- `SELECTED none` → 用户没选（含点过面板的「取消选择」：`selected` 落成 `null` 或空串），走自动匹配（见下文「再验索引」到「未命中」）。
- 有 selected 且 `[implemented]` → **直接按这条模板的 `renderer.channel` + 两份契约走**，跳过「再验索引」「列三组模板」两段。用户明确选的图型不许换成你觉得更好的。
- 有 selected 且 `[spec-only]` → 原话说明「这个图型我只有规格、渲染未对接」，给自由构图 / 近似 implemented 两个选项（同下文「命中 spec-only」）。这是用户自己选的，如实告知**不算静默降级**。
- 有 selected 但**是用户模板**（列表项 `kind:"user"`、`status:"external"`）→ `selection.json` 里带 `origin_file`（绝对路径）和 `usage`。**不要解析这个 Origin 文件、不要量测、不要建 spec**，走已有通道把样式取出来：
  1. 先 `origin_save_project(临时路径)` 存当前工程（切工程前必须存，见硬坑 9）；
  2. `origin_labtalk(script="doc -o <origin_file>;")` 打开用户的模板/工程（`.oth` 禁止，见硬坑 14）；
     - **这套模板还没有缩略图、且扩展名是 `.opj`/`.opju` 时，顺手补一张**：插件进程没有 Origin 通道，只能在 agent 侧做——图页里有数据就 `origin_export(fmt="png", width=600, file_path="<origin_file 所在目录>/thumb.png")`（即 `<id>/thumb.png`）。落盘后立刻生效：`GET /plot-clone/thumb/<id>` 命中文件就返 200，**不用重建索引、不用重装**，让用户刷新侧栏即可看到图。
     - `.otp`/`.otpu` **不生成缩略图**：打开是 0 曲线空框，画成缩略图会误导，继续显示「无缩略图 · Origin 文件」。
  3. `origin_list_graphs` 找到目标图 → `origin_inspect_graph` 读现状（颜色/线宽/轴/图例）；
  4. `origin_template_save(graph, template_name="user-<id>")` 存成样式快照；
  5. 切回本次工程后再 `origin_template_apply(graph, template_name="user-<id>")` 套用。
  **`.oth` 主题文件不同，而且禁止 `doc -o` 打开它**（实测会把当前工程清空：`origin_list_graphs` 回 `[]`、`page.name$` 回读字面量；磁盘文件不动，但内存里打开的工程没了，见硬坑 14）。`.oth` 只能让用户在 Origin GUI 的 Theme Manager 里 Apply，或请他改给 `.otpu` / 工程文件。
  `.otp` / `.otpu` 走的是「用模板新建一个图页」，新页会有图页但**0 条曲线**（模板只存格式，不存数据）：轴标题、轴范围、图层几何、图例位置能读能存，曲线颜色/线宽/符号取不到——要套样式就等数据画上去后再 `origin_template_apply`。
- 有 selected 但与本次数据不匹配（列角色不满足该模板的 `data_contract.md`）→ **不报错、不硬套**：改走自动匹配，同时把建议给出来：

  > 你选的 `<id>` 要的是 `<roles>`，这次数据是 `<实际角色>`，套不上。建议用 `<推荐 id>`——缩略图 `templates/evidence/<推荐 id>.png`（页面里是 `/plot-clone/thumb/<推荐 id>`），理由是 `<一句话>`。

  推荐必须是 `implemented`：spec-only 拿不出实拍缩略图，不许推荐。
- `过期选择`（id 已不在索引里）→ 说明它不存在了，走自动匹配。

**选中只是偏好，不是闸门**：它只改优先顺序，不改任何判据。

### 云端模板（OriginLab Graph Gallery，第二来源）

模板有三个来源，**必须各自独立**，别混：系统模板随包只读（`templates/system/`，49 套）／云端模板下载件落 `~/.dsh/dsh-plot-clone/gallery-templates/gid-<n>/`／用户模板落 `~/.dsh/dsh-plot-clone/user-templates/`（只放用户手动上传的）。**云端下载绝不写进 `user-templates/`，也不进仓库**；包内 `templates/gallery/index.json` 只有元数据（617 条，其中 453 条有标题且可下载），没有一个工程文件。

用户要「照 Graph Gallery 那种图」时，按四步走：

1. **找**：右侧栏「Origin 模板」切到「云端」档，分类是 全部 / 2D / 3D / 统计-QC / 专业坐标 / 其他 / 已安装，可按标题与关键词搜索；点开条目看大图、来源页（`?GID=<n>`）与许可提示。
2. **下**：点「下载」→ `POST /plot-clone/gallery/download {gid}` → 服务端拉 zip、解出 `.opju/.opj/.otp`，写 `gallery-templates/gid-<n>/source.<ext>` + `meta.json`（含 sha256/bytes/许可）+ 本地化缩略图。已经装过回 409，要覆盖得再确认；失败给结构化错误码（网络 / 404 / zip 内无工程文件 / 版本不兼容），不静默。
3. **用**：与用户模板同一条打开通道——先 `origin_save_project(<临时路径>)` 存当前工程，再 `origin_labtalk(script="doc -o <gallery-templates/gid-<n>/source.opju>;")`（`.oth` 禁止 `doc -o`，见硬坑 14），`origin_inspect_graph` 读样式，`origin_template_save` 存成快照后切回本次工程 `origin_template_apply`。**这是借样式，不是借数据**：下载件里的数据不参与本次复刻，数据仍只来自用户。
4. **管**：「已安装」档列本机下载件，可逐条删除；「刷新目录」只在用户点按钮时按 GID 枚举线上目录，写 `gallery-cache.json` 并报「上次刷新时间 / 新增 N 条 / 失败原因」，不后台跑、不开定时器。

两条硬话先说：**许可**——Graph Gallery 的工程文件是 OriginLab 版权作品，只许本机个人使用，不随插件分发、不二次发布；**版本兼容**——拿对应版本的 Origin 打开，打不开就把 Origin 的原话回给用户，不猜不绕。

### 再验索引，再谈模板

```
python templates_index.py --check
```

- `rc=0`（输出 `STATUS PASS (N templates)`）→ 索引可用，进「列三组模板」。
- `rc=2`（`ERROR index not found`）→ **模板库不可用**。原话告诉用户「本次没有模板库，走自由构图」，直接跳到第 5 步。**不许装作有模板**，也不许凭记忆报一个模板名。
- `rc=1`（有 `FAIL` 行）→ 索引坏了。把 FAIL 原文贴给用户，同样走自由构图。

### 列三组模板，说清差别

```
python templates_index.py --list
```

输出固定三组：

| 组 | 是什么 | 谁维护 |
|---|---|---|
| **收藏（置顶）** | 用户标了「以后还用」的模板 id，只存 id + 收藏时间，**不复制目录** | 用户（`templates/favorites.json`） |
| **系统模板** | 随交付发的 49 个（47 个规格来自 editaplot + 2 个本 skill 原生），按 `category` 分组 | 本 skill |
| **用户模板** | 用户上传/保存的 **Origin 文件**（`.otp .otpu .opj .opju .oth`，原件原样复制 + `meta.json`），存在 `~/.dsh/dsh-plot-clone/user-templates/<id>/`，不在仓库里 | 用户（运行时目录） |

用户模板的 `status` 是 `external`——它渲染在 Origin 里，不是我们的通道，所以**不标 implemented、也不标 spec-only**；没有缩略图就显示「无缩略图」，不许拿别人的实拍图顶。

面板上每张卡都有 ★ 收藏 与「重命名」：系统模板的改名只写 `~/.dsh/dsh-plot-clone/aliases.json` 的显示名（仓库 `templates/system/*` 不动，留空即恢复原名），`--list` 会显示「<别名>（别名）」；`--check` 会报指向已删 id 的悬空别名。已选状态顶部有「取消选择」、卡片按钮变「已选 / 取消」，再点一次即写 `selected:null`。

筛选用 `--group system|user|favorites`、`--status implemented|spec-only`。

收藏有两个落点，别混：页面上的收藏写 `selection.json`（`--selected` 会打 `FAVORITES` 行），`templates/favorites.json` 是随交付携带的那份。两边都当收藏看，页面优先（用户刚点的）。

只有数据、还没定图型时，先让契约说话：

```
python templates_index.py --match --roles category,series --ncols 2
```

`--roles` 用列画像（`origin_plot_plan`）得出的角色名，`--ncols` 是数据列数。输出只列 `implemented`，按「可用 / 缺项」排序，缺列或缺角色会直接写 `缺：…`（例如 `缺角色 facet`、`缺 1 列（要 ≥3）`）——照着挑，缺项就别硬套。不传 `--roles` 也能列（按列数排序），适合先看一眼有什么。

### 命中 `implemented` → 按模板的通道走

用户直接点名模板（「用 xps 模板」「用 forest 那张」）时，三步走，别凭名字猜：

```
python templates_index.py --list --group system   # 第 1 步：找 id（也可 grep -i xps 过滤）
# 第 2 步：读该 id 的 renderer.channel（templates/index.json）与 schema.json 的 data_contract
# 第 3 步：按通道出图（见下表），再 origin_verify_graph 复核
```

| `renderer.channel` | 怎么出图 |
|---|---|
| `origin_plot:<plot_type>` | `origin_plot(worksheet=…, plot_type=…, y_columns=[…])` |
| `origin_plot_template:<template_id>` | `origin_plot_template(template_id=…, data={…})` |
| `origin_labtalk` | 手写 LabTalk（如 heatmap 的 `plotm`） |

侧栏「Origin 模板」页点「用这个」是同一件事的另一半：它写 `selection.json`，下一次 `--selected` 会读懂，不必再手工找 id。

`renderer.channel` 是主通道，`renderer.helpers` 是辅助，例如：

```
origin_plot(worksheet=..., plot_type="column", y_columns=[...], yerr_column="SD")   # origin_plot:column
origin_plot_template(template_id="stacked_spectra", data={...})                     # origin_plot_template:stacked_spectra
origin_labtalk(script="plotm im:=[M001]1!1 plot:=105 ogl:=[<new>]!;")               # origin_labtalk（heatmap）
```

同时读同目录的 `data_contract.md`（要什么列）和 `visual_contract.md`（视觉判据 + 实测补充），把它们当第 1 步规格卡的**默认值**；用户明说的优先于模板默认。

### 命中 `spec-only` → 必须原话说明，绝不静默降级

原话告诉用户：

> 这个图型我只有规格、渲染还没对接（gap: <把 `index.json` 里那条 gap 原文贴出来>）。

然后给两个选择让用户挑：

1. **自由构图**：按第 5 步的图元映射表自己搭，能达到什么程度如实说（缺什么看 gap）。
2. **换一个 `implemented` 的近似图型**：从 `--status implemented` 里挑视觉上能替代的（例如 `violin` 不可用时用 `box` + 散点），并说明会丢掉什么信息。

**不许静默降级成自由构图**——用户有权知道他要的图型我们到底有没有。

### 未命中 → 自由构图

索引里没有这个图型（或用户要的是参考图那种非常规构图）→ 直接进第 5 步。这是**正常路径**，不是失败。

### 收尾两个动作（交付成功后再问，不要提前问）

- **存成用户模板**：用户说「保存模板」/「这张以后还能用」→ **不要让他提供图片**，从当前 Origin 里刚改完的那张图存：
  1. `origin_template_save(graph, template_name="<名字>")` 存样式快照（`.otpu` 的 save 通道在这台机器上不可靠，快照才是稳的）；
  2. `origin_save_project("<临时>/figure.opju")` 把工程存下来作可追溯原件；
  3. `node make_user_template.mjs --from <figure.opju> --name "<名字>" --category "user/<分类>"` 把它收进 `~/.dsh/dsh-plot-clone/user-templates/<id>/`（原件原样复制 + `meta.json` 记 sha256/尺寸/原始文件名）。
  **快照只含样式，不含数据**——这句话要跟用户说一次。仓库零污染：用户模板只写运行时目录，`templates/` 里不新增任何东西；删除只动那个 `<id>` 目录。
- **收藏**：用户说「收藏」→ 只往 `templates/favorites.json` 加 `{"id": "...", "added_at": "..."}`，**不复制目录**（复制就有两份源，改一份忘一份）。

## 第 5 步：图元 → Origin 通道（照着查，别自己发明）

| 参考图里的元素 | Origin 通道 | 关键点 |
|---|---|---|
| 原始数据点（密集小圆点） | `origin_edit_plot({"symbol_kind":2,"symbol_size":1.5,"color":"#hex"})`；不显示时用 LabTalk `plotxy iy:=[Book]1!2 plot:=201 ogl:=[Graph]1!` 重新追加 | 追加的 plot 永远在最上层；追加后必须 `origin_edit_axis(props={rescale:0})` 复位轴 |
| 包络线 / 拟合线 | `origin_edit_plot({"line_width_pt":2,"color":"#hex"})` | — |
| 柱/条/面积 纯色填充 | `set <Book>_<Col> -pfb color(r,g,b);`（边框 `-pbc`） | 数据集名是**列短名** |
| 柱/条/面积 渐变填充 | **首选** `origin_edit_plot(edits=[{plot:N, fill_mode:"gradient", fill_top_color:"#RRGGBB", fill_bottom_color:"#FFFFFF", fill_to:"axis"}])`（插件 2.7.4+ 原生参数，返回 applied_unverified）；旧插件/需要更多 set 选项时才手写 `layer -s 1; layer.plot = <第几条>; set %C -pf 1; set %C -pfm 3; set %C -pfb color(顶色); set %C -pff color(底色);` | 顶=起始色、底=终止色；`-pfm` 只试 0/1/2/3；`-pff color(255,255,255)` = 峰顶浓、到底部褪白的参考图效果（2026-10-23 实测）；**填充永远铺到轴底**，`-pf 2` 也一样，偏移/堆叠谱必须配白遮罩截断 |
| **峰填充止于背景曲线** | 白遮罩法：另起一列 `= 背景列 - 150`，`-pfm 0` + `-pfb color(255,255,255)` + 填到轴底，压住背景线以下的峰填充 | fill-to-next（`-pfv 9`）忽略 `-pfm`，只能纯色；白遮罩视觉等价且能带渐变 |
| 整幅宽装饰色带（area ratio 条） | 两条常数/派生曲线夹出填充区：底=轴下限常数、顶=`col(背景)-间距`；条色 `-pfb`、线色设成条色 | 与谱之间靠"背景列−间距"自动留白缝；条内文字 y 落在带内 |
| 峰位刻线 | `origin_add_line(graph, orientation="vertical", at=<峰位>, line_style=0)` | — |
| 文字（名称 + 数值，颜色不同） | `origin_annotate` 批量加，颜色/字号用 LabTalk 精调 `TextN.fsize=7; TextN.color=color(160,48,56);` | annotate 的 y=文字**顶边**，`layout_info` 报的 y=**底边**，差一个字高 |
| 图例 | `origin_edit_legend({"position":"tr","font_size_pt":11,"frame":false})` | 关自动更新后改文本 |
| 多面板 / 双 Y / 堆叠谱 / XRD | `origin_plot_template`：multi_panel / dual_y / stacked_spectra（`gradient=true`）/ xrd_pattern / forest | 面板数受数据份数限制 |
| 对数轴 / 反向轴 / 刻度数 | `origin_edit_axis(scale={2:log10,3:ln}, from_value, to_value, props={"rescale":0})` + `layer.x.majorTicks=9` | 改轴会挪文本，改完重排注释 |
| 页面尺寸 / 图层几何 | `origin_edit_page(page_size_cm={"width":8.9,"height":6.5}, layer_geometry_pct={...})` | 用第 0 步量到的 % |
| 导出 | 三件套：`origin_export(fmt="png", width>=1800)` + `origin_export(fmt="pdf")` + `origin_save_project(.opju)`；整包 `origin_export_delivery` | 导出后裁掉页面外的杂散对象比在 Origin 里找快 |

## 第 6 步：能力表（接活前先对照，别承诺做不到的）

| 能做到 | 说明 |
|---|---|
| 颜色精确到 hex | `-pfb/-pff/-pbc`、`TextN.color`、`origin_edit_plot(color=)` |
| 线型/线宽/符号/透明度 | `origin_edit_plot` |
| 渐变（柱/条/面积） | `-pfm 3`；按**整个绘图区高度**插值，不是逐形状独立 |
| 峰填充止于背景曲线 | 白遮罩法（见上表） |
| 整幅宽装饰带 + 条内文字 | 两条曲线夹填充 + `TextN` 定位 |
| 轴范围/刻度类型/反向/刻度数 | `origin_edit_axis` + LabTalk |
| 页面尺寸与图层几何 | `origin_edit_page` + `layer_geometry_pct` |
| 导出多格式与高 DPI | `origin_export` / `origin_export_delivery` |

| 只能逼近 | 差距 |
|---|---|
| fill-to-next 模式的渐变 | 该模式忽略 `-pfm`，只能用「填充到轴底 + 白遮罩截断」逼近；截断边跟白遮罩曲线走，不是逐点贴合 |
| 每个峰各自从峰顶饱和渐变 | 渐变按绘图区高度统一插值，峰越矮越淡 |

| 做不到（如实说） | 原因 / 替代 |
|---|---|
| 按字体名指定字体 | `TextN.font$="Arial"`、`layer.x.label.font$="Arial"`、`layer.x.font$` 全是静默 no-op（2026-10-20 复测）；数字索引只会把字变坏（实测 0→等宽、1→粗体无衬线）。**字体族只能由用户在 Origin GUI 里改**，agent 侧只能对齐字号/字重/位置。**投稿后果**：期刊要 Arial/Helvetica 而 Origin 默认 Times 时，交付说明里必须点名「请在 GUI 改字体族」，不许默认交付 Times 冒充合规 |
| 从参考图读数据 | 红线，禁止 |
| 像素级 1:1 | 不承诺；差量表为空即交付 |
| 参考图有两份数据而用户只有一份 | 如实说"少一个面板"，不复制数据凑数 |

## 第 7 步：收敛循环（照跑，最多 3 轮）
1. `origin_view_graph(graph)` 看自己画的；像素级差异用导出后取色核对，别只靠肉眼。
2. 与参考图**逐字段**对照，只列**差的项**：`字段 | 现状 | 目标 | 动作`。
3. 一次 `origin_edit_*` / 一条 LabTalk 改完（多句合并进一个 call）→ 回到本循环第 1 条。
4. 连续两轮差量表为空 → 停；仍有 unknown → 如实告诉用户哪几项对不上。

## 回复格式（五段，结论/建议必用）

给用户或上游的**结论、建议、交付说明**一律按五段写（过程闲聊、单步进度不用）。五段缺一段 → 该结论降级为「**未验证**」，不许当结论用。

1. **当前证据** —— 实测值 / 读回值 / `文件:行号`；不许用「看起来」「差不多」「应该」。
2. **改什么** —— 具体动作或建议值（字段、色值、尺寸、命令），能直接照做。
3. **为什么** —— 机制 / 原理，一句话说清因果，不堆术语。
4. **依据** —— SKILL 行号 / `measure_ref.py`、`figure_metrics.py` 的读数 / 实测记录（日期或会话锚点）。
5. **如何判定** —— 改完怎么证明对了：**一条可执行命令或一个具体读数**（如 `figure_metrics.py 成品.png --pub-check` 的 ΔL*、导出后峰顶取色 hex、`verify_deliverable.py` 的 rc）。

**降级规则**：`如何判定` 写不出可执行检查（没有命令、没有读数、只有「看起来对」）→ 该结论按「未验证」交付，并说明缺什么验证手段。详细推导可以另起段落，但五段必须在。

这条与「缺读回 = 失败」互补：**文字层**由五段式兜底（结论必须有可执行判定），**文件层**由 `verify_deliverable.py` + `origin_verify_graph` 兜底（文件与对象属性必须有读回）；两层都过，结论才算过。

## 第 8 步：收尾（完成判据）
- **先跑文件层硬检查**：`python verify_deliverable.py 成品.png 成品.pdf 成品.opju --min-width 1800`——三个文件存在且非空、同 basename、PNG 宽 ≥1800，逐项 PASS/FAIL，rc 非 0 不许交付。它只查文件层；图里的对象属性仍归 `origin_verify_graph`。
- `origin_verify_graph(graph, expected_series=卡上系列数, min_font_pt=8)`：`fail` 必修，`warn` 提一句。
- **缺读回 = 失败**：台账里每个 `applied` 必须有读回（verify 的对象属性读数，或导出后取像素）。只有导出 PNG/PDF 存在不算成功；读不回就降级，不靠"看着像"。文件层由 `verify_deliverable.py` 兜底，对象层由 `origin_verify_graph` 兜底，两层都过才算交付。
- **交付物固定三种格式，缺一不算交付**：`origin_export(fmt="png", width>=1800)` + `origin_export(fmt="pdf")` + `origin_save_project(<同名>.opju)`（或一步 `origin_export_delivery(fmts="png,pdf,tif", save_opju=true)`，把 tif 当可选附加）。三件同目录、同名、逐件回报字节数。
- 页面尺寸按卡 canvas 定；PNG 宽度 ≥1800。
- 回复 = 交付文件路径 + 差量表结论（哪几项没对齐、为什么，含能力表里的"只能逼近/做不到"）。

## 交付前自检（18 条有一条 no 就别交付）
1. 数据一项都不来自参考图像素？ 2. 系列数 = 卡上？ 3. 每条颜色 = 卡上 hex（像素验过，不是"差不多"）？
4. 轴标题含单位、范围一致？ 5. 次轴/反向轴/刻度朝内朝外按要求？ 6. 图例位置字号对齐？
7. 页面尺寸与图层几何 = 卡上？ 8. verify 无 fail？ 9. 填充形态（纯色/渐变/起止色/下边界）与卡一致？
10. 装饰带高度与白缝比例 = 量测值（不是估的）？
11. **数据可追溯**：交付里写明数据文件路径 + 用到的列名，逐列说明来源；有没有任何一列是补出来/平滑过/示意数据？
12. **三格式齐**：同名 PNG（≥1800 宽）+ PDF + OPJU 都存在且非空字节？
13. 成品尺寸 = 卡上 pub_target（单栏 85 / 双栏 170 mm）？字号是按**这个尺寸**算的，不是按放大预览？
14. 最小字号 ≥ 卡上 `min_font_pt`（默认 7 pt）、线宽在 0.5–1 pt？
15. 相邻系列在**灰度**下也能分（亮度差 ≥10）且红绿对色盲可辨（ΔE00 ≥10；用 Okabe-Ito 一类安全色板最省事）？——跑 `figure_metrics.py 成品图.png --pub-check` 拿实测值，别靠眼睛。
16. 误差棒写明了 SD/SEM/CI 与 n？显著性标记有检验方法与阈值？**没有任何一个是自造的**？
17. 字体族若期刊要求而本机改不了 → 交付说明里写了「请在 Origin GUI 把字体族改成 X」？
18. **PNG 上没有 Origin demo 水印**？—— 跑 `verify_deliverable.py`，它按「青色 `#00FFFF` 行带 ≥5 条 + 行剖面自相关峰值 ≥0.6（等周期重复）」判定平铺水印，青色数据不会误报（行带只有 2 条）；FAIL 就是「导出图不可用」，必须停下告知用户 Origin 授权状态，不许静默交付、不许想办法去水印。

## 硬坑清单（实测，别重踩）
1. **LabTalk 数据集名 = 列短名**（`Book3_H`），写列名（`Comp1`）静默无效：导出字节和上次一模一样就是没生效的判据。动手前 `origin_inspect_graph` 读真实 dataset 名。
2. **`origin_column_formula` 的 target 用 0 基列索引**；传字符串列名会静默写到别的列（还把结果列变 NaN）。写常数用 LabTalk `range rN=[Book3]1!14; rN=2600;`。
3. **面积填充的下边界锁在设色/首绘时的轴下限**：之后改轴下限填充不跟随。顺序=先定轴范围→再设填充色→再导出。
4. **渐变设色与导出必须分两次调用**：同一批会毒化 COM 会话（`origin_export` 三通道全失败 + `Datasheet_FindCol` 异常），恢复只能重启 Origin。
5. **fill-to-next（`-pfv 9`）忽略 `-pfm`**，要渐变先 `-pfv 0`；想"止于背景曲线"用白遮罩法。
6. **叠放顺序 = plot 追加顺序**，`plotxy` 追加的永远在最上层；因此"白遮罩→装饰带"要求装饰带必须是后追加的。`plotxy` 会触发轴自动重缩放，之后必须 `origin_edit_axis(props={rescale:0})` 复位。
7. **`origin_annotate` 的 y 是文字顶边、`layout_info` 报的底边**（差一个字高）；`style.size` 常被忽略，用 `TextN.fsize=..;` 强制 + 读回复核。`label -r TextN;` 删掉后 layout_info 会留 x/y/fsize 全 NaN 的幽灵条目，不影响渲染，按名删一次就够。
8. **渐变/填充是否生效只能像素验**：导出后在峰中心取一条竖列，`uniq` 色数 <20 就是纯色。文字颜色同理用 `box` 取色核对。
9. **`doc -o` 切工程前先存当前工程**：有未保存修改时切项目，Origin 弹「是否保存」模态框，之后所有 COM 调用 60s 超时（`origin_status` 也超时），只能人工点掉弹窗或重启。正确顺序：`origin_save_project(临时路径)` → `doc -o 目标.opju`。
10. **别乱动字体属性**：`TextN.font$` / `layer.x.label.font$` 静默 no-op；`TextN.font=<索引>` 会把字变等宽或粗体，且 `layer.x.font` 改不回原样——想保字体就别碰，改坏了重开已存的 opju 恢复。
11. **面积/峰渐变实测通道（2026-10-23 验证）**：优先用 `origin_edit_plot` 的 `fill_mode/fill_top_color/fill_bottom_color/fill_to`（dsh-origin 插件 2.7.4+ 已封装，等价于下面的 set 命令，status=applied_unverified 属正常）；插件不可用或需别的 set 选项时，才走 `layer.plot = N` 选第 N 条曲线后 `set %C -pf 1; set %C -pfm 3; set %C -pfb color(R,G,B); set %C -pff color(255,255,255);`，导出取样=顶部饱和、底部褪白，色带按整个绘图区高度线性插值。填充下边界固定为**轴下限**（`-pf 2` 不改），偏移基线谱会被色带糊到轴底——必须后叠白遮罩（值=背景列−Δ，`-pfm 0` 纯白填到轴底）再画基线与数据。
12. **COM 报 `<built-in function ApplicationBase_Path> returned a result with an exception set` = 会话中毒**：诱因是 `origin_labtalk` 里跑带 `$()` 的 `type` 命令、或渐变设色与导出挤在同一批调用。救法=先 `origin_release`，下个调用自动重连（`origin_status` 恢复 ok）；**但 release 会丢掉当前工程**（`list_pages` 变空），所以每次改动前先 `origin_save_project`，救回后 `doc -o 该 opju` 重开。release 救不回时再重启 Origin。
13. **字号/点径只有两条通道，别瞎试**：刻度标签字号=`origin_edit_axis(axis="x", props={label_font_pt:11})`（读回 `x.label.fsize`）；轴标题字号=`layer.x.label.pt`；**`layer.x.pt`/`layer.y.pt` 不是刻度字号（设了静默无效）**；散点= `origin_edit_plot(edits=[{plot:i, symbol_size:..}])`，参照 `symbol_size`≈1.0 @1800 px 宽 ≈ 4~5 px 点径（参考图 0.3% 绘图宽）——1.5 偏粗、0.8 几乎看不见。
14. **禁止 `doc -o` 一个 `.oth`**（2026-11-05 实测）：`origin_labtalk("doc -o ...No Axis Line.oth")` 之后 `origin_list_graphs` 回 `[]`、`page.name$` 读回字面量 `page.name$`——当前工程被清空，只有磁盘上的 `.opju` 还在。`.oth` 只走 GUI Apply Theme，或让用户改给 `.otpu`（`.otp/.otpu/.opj/.opju` 都能 `doc -o`，实测四种都正常出图页/工程）。
15. **`origin_list_pages` 的 `graphs` 字段恒为 `[]`、detail 恒写「图页 0」**（2026-11-05 实测，与 `origin_list_graphs` 返回 1/4/5 个矛盾）：判断有没有图页只用 `origin_list_graphs`，别信 `list_pages` 的计数。
16. **`origin_status.origin_exe` 可能报错版本**（2026-11-05 实测报 `Origin2026b`，本机只有 `C:\Program Files\OriginLab\Origin2025b\`，进程标题是 `… - OriginPro 2025b`）：以安装目录/进程标题为准，别拿这个字段写进报告当版本结论。
17. **批量导出/建页后弹 `#32770`「注意! 可能创建了太多GDI对象…」会卡死 COM**（2026-11-05 连撞 3 次）：模态框只有「确定」，期间所有 COM 调用 60s 超时；`PostMessage(hwnd, 0x00F5, 0, 0)`（BM_CLICK）点掉即恢复，但批量导出后最好直接重启 Origin。

## 备注
- 参数、错误码、失败恢复动作全在 **origin-plotting** skill；本 skill 只管"参考图 → 参数"。
- 参考图小字/细线读不准：读卡阶段问一次，别猜。
- 与 **editaplot**（github.com/hang-jin/editaplot）的关系：三态样式台账、允许清单、文字只记角色、缺读回即失败 —— 概念自它借鉴；**不借**它的 template registry / plan 冻结 / 自带 originpro 运行时（我们用 dsh-origin MCP，多一层 runner 是纯负担）。
- 参考图里的面板字母、水印、页面外杂散对象：数据里没有就别硬造，导出后 `im.crop((x,0,w,h))` 裁掉最快。
- 一次生成的图先存 `_raw.png`（未裁）再裁出交付版，方便下轮改。