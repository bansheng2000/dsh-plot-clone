# dsh-plot-clone

参考图复刻 SOP（Origin 版）—— 一个给 AI agent 用的 skill（Agent Skills 目录形态，`SKILL.md` + 三个量测脚本）。

仓库：<https://github.com/bansheng2000/dsh-plot-clone>

干什么：给你一张「好看的参考图」（论文插图 / 别人的成品图 / 截图）和你自己的数据，在 OriginLab Origin 里画出**风格、配色、排版、比例逐字段对得上**的图。不限定图型——折线、散点、柱、面积、堆叠谱、双 Y、多面板、带装饰条的复合图都走同一套流程。

**九步，顺序是硬约束**：

| # | 步骤 | 产物 |
|---|---|---|
| 0 | 像素量测 | `measure_ref.py` 输出外框比例、主色板（桶内真实平均色）、指定区域取色、装饰带占比 |
| 1 | 写规格卡 | 十六字段卡：canvas / geometry / family / panels / x,y / y2 / series / fill / deco / yerr / legend / refs / fonts / pub_target / pub_limits / stats；`refs` 记参考图 sha256 + 尺寸 + 字节数 |
| 2 | 科研投稿规格定档 | 成品尺寸 mm、最小字号 / 线宽、位图 dpi、导出格式、配色可辨、统计标注；缺项写 `unknown` |
| 3 | 样式台账 | 每个字段三态之一：`applied` / `retained_default` / `rejected`；来源优先级= 用户明说 > 参考图允许清单 > 默认 |
| 4 | **选模板** | `templates_index.py --check` 验索引（六条断言，含契约镜像）→ 只有数据时先 `--match --roles … --ncols N` 找候选（只推 implemented，缺列缺角色写明）→ `--list` 列三组（收藏 / 系统按 category / 用户）→ 命中 `implemented` 走 `renderer.channel`；命中 `spec-only` 必须原话报 gap 并给两选项；未命中走自由构图 |
| 5 | 图元 → 通道 | 查映射表：点、线、柱、渐变、白遮罩、装饰带、刻线、文字、图例、面板、对数轴、页面几何 |
| 6 | 能力表对照 | 能 / 只能逼近 / 做不到三条线分开，别承诺做不到的 |
| 7 | 收敛循环（最多 3 轮） | `origin_view_graph` 看自己的图 → 只列差项 → 一次批量改 → 再看 |
| 8 | 收尾 | `origin_verify_graph` + 页面尺寸 + **三格式交付（PNG ≥1800 宽 + PDF + OPJU，同名同目录）**，回复里带差量表结论 |

## 红线（前 3 条违反=造假）

- **画图必须基于真实数据，一个点都不许编**：数据只来自用户给的数值 / 文件（交付里写明路径 + 列名）；禁止从参考图像素反推数据点、凭空造曲线 / 基线 / 背景、用「看起来合理」的数补缺列、把模拟或示意数据当实验结果。没有数据就先要数据，不画假图——像素只用来读图形语法（颜色、线型、布局、字号）
- **不许为了「像参考图」而平滑 / 插值 / 重采样用户数据**；确需平滑必须单独说明、保留原始列并在交付话术里写清
- 不抄参考图里的文字、拟合参数、物相 / 峰标注、Logo、水印
- 不承诺 1:1；交付话术固定为「布局与风格已对齐，数据为本实验数据」
- 参考图有、工具没有的能力，如实说做不到，不硬凑近似品

## 关键机制

- **量测前置**：颜色和几何比例都从像素来。目测配色是本 skill 最高频的返工原因（实测把 `#DE90BA` 估成 `#D0618F`、把深蓝文字估成黑色）；装饰带高度、白缝高度同样按像素占比算，不靠眼估。
- **规格卡先于动手**：固定字段，缺项写 `unknown`，动手前一次性问用户，不许脑补。
- **差量收敛**：每轮只列**差的项**（`字段 | 现状 | 目标 | 动作`），连续两轮差量表为空才停；仍有 unknown 项如实回报，不抹平。差量来自 `figure_metrics.py 参考图.png 成品图.png` 的归一化读数，不靠肉眼打分。
- **结论按五段写**：给用户/上游的结论、建议、交付说明必须含「当前证据 → 改什么 → 为什么 → 依据 → 如何判定」，缺一段即降级为「未验证」。`如何判定` 写不出可执行命令或读数的，就是没验证——与「缺读回 = 失败」互补：五段式管文字层，`verify_deliverable.py` + `origin_verify_graph` 管文件/对象层。
- **交付物固定三种格式**：PNG（≥1800 宽）+ PDF + OPJU（可在 Origin 里继续编辑）；缺一件不算交付，交付里同时写明数据文件路径与列名，逐列可追溯。交付前先跑 `verify_deliverable.py` 做文件层硬检查（存在/非空/同 basename/宽度），再用 `origin_verify_graph` 查对象层。
- **交付前 17 条自检**：颜色必须等于卡上 hex（像素验过，不是「差不多」）、填充形态与下边界、装饰带高度 = 量测值、页面尺寸与图层几何、verify 无 fail、数据可追溯、三格式齐等。
- **上游委派接口**：被领域 SOP（如 `dsh-xps-peakfit`）委派时只接风格对齐这一段——按上游系列清单建 series、不改数值、不润色标注文本、上游禁止项从严执行；回给上游规格卡 + 差量表 + 交付路径。**只有版面约束、没有参考图时不套复刻流程**，转 `origin-plotting` 常规建图。
- **模板只是加速器**：49 个模板（27 `implemented` / 22 `spec-only`，2026-11-05 批量实跑后从 9/40 更新）上面有四道闸——`--check` 验证据 + **契约镜像（`index.data_contract` 必须逐字等于模板自己的 `schema.json`，以 schema 为唯一真源；2026-11-05 补了 `min_rows`/`supported_extensions`）**、`--match` 按契约找候选、`--selected` 读用户选的、命中后按 `renderer.channel` 走。用户在页面上选过的模板**优先**，但列角色对不上就改自动匹配并给「推荐 id + 缩略图」，不硬套、不报错；`spec-only` 必须原话报 gap，绝不静默降级成自由构图。

## 文件

| 路径 | 内容 |
|---|---|
| `SKILL.md` | 技能正文：红线 → 量测 → 规格卡 → 投稿定档 → 样式台账 → 图元映射 → 能力表 → 收敛 → 收尾 → 自检 → 上游委派接口 |
| `pixel_core.py` | 三个脚本共用的像素层：暗色阈值（默认 130，`--dark` 可调）、取色（桶宽 16、剔近白/近黑）、框/面板检测、装饰带（纯色+渐变）、刻度、点径、文字行。**改阈值或取色口径只改这里**，否则两个脚本会给出不可比的结果 |
| `measure_ref.py` | 参考图量测：外框（全图坐标，无偏移）、面板候选数、主色板（桶内真实平均色 + 计数 + 占比）、指定区域取色、装饰带占比（整行 ≥90% 扫描，最长连续段）；`--selftest` 自带断言 |
| `extract_palette.py` | 只看全局色板时的精简取色：全图统计（**不缩放**，细线不丢）+ 桶内真实平均 hex + 计数 + 占比 + 尺寸；`--min-frac` 只过滤不截断（被挡桶数会报出来）、`--keep-dark`；`--selftest` 自带断言 |
| `figure_metrics.py` | 参考图 ↔ 成品图**量化并排对照**：外框 %、面板数（多面板逐面板输出）、装饰带高/绘图高（纯色/渐变）、白缝 %、刻度长、文字行与字高（label/title）、点径、主色——收敛循环每轮回跑它；`--json`（缺测项落 `null` + `<字段>_reason`，`status` 三态 ok/partial/none 对应 rc 0/3/4）、`--band-hex`/`--dot-hex`/`--dark`、`--selftest`；投稿级可辨性 `--pub-check`（灰度 ΔL*≥10 / 色盲 ΔE00≥10 / 白底对比度≥1.5:1，逐项给实测值与阈值；`--series-color "#hex,..."` 可显式指定，否则从主色提） |
| `verify_deliverable.py` | **交付三件套文件层检查**（不读 Origin 对象属性，那是 `origin_verify_graph` 的活）：三个文件存在且非空、三者同 basename、PNG 宽 ≥ `--min-width`（默认 1800）；逐项 PASS/FAIL，rc 0 全过 / 4 有 FAIL / 2 用法错误；`--selftest` 用临时文件造「缺文件 / basename 不一致 / 宽度不够 / 全过」四种场景断言 |
| `test_synth.py` | **合成真值自检**：画出几何已知的图（框位置、20px 带、渐变带、1x/2x/4x 刻度、d=10/20 点径、已知字高、2px 细线、半宽面板、双面板），对三个脚本的读数逐项断言（29 条，公差 ±1px/±2%）。改量测代码先跑它 |
| `templates_index.py` | **模板索引的机器闸门**：`--check` 六条断言（implemented 必须有实测证据文件且非空 / spec-only 必须有 `gap` / system 模板 path 必须在 `templates/system/` 下 / 收藏不许悬空（`favorites.json` 与 `selection.json` 两处都查）/ `renderer.channel` 的工具名与变体必须在白名单 / **`index.data_contract` 必须逐字镜像模板自己的 `schema.json`**，以 `schema.json` 为唯一真源），rc 0 全过 / 1 有 FAIL / 2 索引缺失；`--list` 按「收藏置顶 → 系统按图型分组 → 用户」列三类；`--match --roles a,b --ncols N` 按 `data_contract` 打分找候选（只列 `implemented`，缺列缺角色写成 `缺：…`，不硬套）；`--selected` 读用户在页面上选的那个模板（四分支：none / 过期选择 / implemented 给通道 / spec-only 报 gap）；`--selftest` 11 条变异 + 5 条 `--match` + 3 条 `--selected` 分支全部必须真红。**没证据的 implemented、写歪的契约都过不了这道闸** |
| `lib/templates.js` | **模板选择页的服务端**：`/plot-clone` 下 8 条路由（prefix 注册在 `webServer` seam，不新开端口）；**前缀必须独立**——早期把整段挂在 `/plugins/dsh-plot-clone` 下，把宿主下发客户端 bundle 的路由一起吃掉（`/plugins/<id>/client.js` 404），标签就永远显示「这类内容还没有可用的查看方式」；现在遇到非自有前缀一律 `return undefined` 让位；`/plot-clone/diag` 是客户端诊断（GET 读最近 50 条、POST 追加、坏 JSON 400），回答「bundle 到底有没有执行 apply」；列表 = 49 条系统模板 + 用户模板，缩略图**只认 `templates/evidence/<id>.png`（系统）或 `user-templates/<id>/thumb.png`（用户）**，没有就给 `thumb: null` 且 404 `no-thumbnail`（不许拿 implemented 的图冒充）；选中与收藏写 `~/.dsh/dsh-plot-clone/selection.json`，选中用户模板时把 `origin_file` 绝对路径与 `usage` 一起写盘 |
| `lib/user_templates.js` | 用户模板 = 一个 **Origin 文件**（`.otp .otpu .opj .opju .oth`）原样复制 + `meta.json`（sha256/原始文件名/尺寸/时间）。**不解析 Origin 格式、不量测、不建 spec**；单文件上限 64 MB；`templateDir(root, id)` 是唯一目录穿越闸门 |
| `make_user_template.mjs` | CLI：`node make_user_template.mjs --from <file> [--name][--category][--note]`，把 Origin 存下来的 `.opju/.otpu` 收进 `~/.dsh/dsh-plot-clone/user-templates/<id>/`（SKILL 第 8 步「保存模板」用它；仓库零新增） |
| `lib/page.js` | 页面本体：自包含 HTML（内联 CSS+JS，无外部依赖、无构建链），卡片=缩略图/名称/分类/status 标/★收藏/「用这个」，顶部搜索 + status 过滤（后备网页；主入口是侧栏标签）；无图卡片显示「无实拍 / 仅规格，渲染未对接」，用户条目显示「无缩略图 / Origin 文件」 |
| `lib/client.js` | **DSH 右侧栏的「Origin 模板」标签**（`sidebar.right.pane.tab`，key `dsh-plot-clone/templates`；只改显示名、`id`/`kind` 钉死不动）；手写 classic script，`window.__ModuleLoader__.load` 挂载，无构建链。双注册：`sidebarRightTabs.register` 出标签、`slots.register` 出内容与标题——**tab 的 `id` / `kind` 与 slot 的 `key` 必须同一个字符串**，宿主按 `kind` 查内容体，不等就是「标签在、面板空白」；**另外保留一个 kind 兼容别名**（`id=dsh-plot-clone/templates-compat`、`kind=plot-clone-templates`，同一套内容/标题槽位、**不给 `guide`**）——侧栏会把标签实例连同 kind 一起持久化，早期版本用的旧 kind 残留在用户侧栏里，宿主按实例的 kind 找不到定义就渲染 `tab.unavailable`（「这类内容还没有可用的查看方式」），别名让这些旧标签自愈；等旧标签清干净（约一个版本）可以删；顶部筛选按**来源**分 `全部 N` / `预设 N` / `用户 N` / `收藏 N`（用户档空态「还没有你自己的模板，可以上传 Origin 模板或工程」、收藏空态「还没有收藏的模板」），**分类子筛选只挂在「预设」下**（通用 / 光谱 / 电化学 / 医学 / 热分析 / 研究信号，各带该分类的系统模板数，取自 `category` 首段；切到「全部」「收藏」「用户」时清空，绝不残留成隐藏过滤），`implemented` / `spec-only` 只作系统模板的状态徽标、不占筛选位；用户卡片标「用户」+ 扩展名、显示原件名/大小/「怎么用」一行，可「重命名」「删除」，「＋ 上传模板」只回执文件名/大小/类型/时间，**不画伪造预览**；「用这个」写 `selection.json` 后原地标「已选」，写盘失败显式报错；宿主无该 slot 时安全跳过、不炸侧栏；**缩略图悬停 150 ms 放大**：放大层是原生 `div` 挂 `document.body`（不引入 react-dom），因为侧栏祖先 `div.acoR2W_tabBody` 是 `overflow:hidden`，CSS `transform: scale` 和子树内 `position:fixed` 都可能被裁；位置由纯函数 `placePreview()` 夹进视口 8 px 边距（右侧放不下翻左），点缩略图钉成全屏遮罩，`Esc` / 面板滚动 / 窗口缩放 / 卸载都会收层；**是否绑定只看这张卡最终有没有 `<img>`（不写 id 白名单，用户自带预览图的模板照样生效）**，图取不到时卡片 `onError` 撤掉悬停绑定、换成「缩略图加载失败」占位块，放大层里的图加载失败则立刻收层——一律不留裂图 |
| `test/preview.mjs` | 开发预览（不进 npm 包）：`node test/preview.mjs` 用与插件同一个 handler 起临时端口并打印 `templates_dir:` / `selection:` / `page:`，`PORT=` 可固定——插件还没装进 profile 时用它验路由和页面 |

取色用法（需要精确 hex 时才跑）：

```
python extract_palette.py 参考图.png --top 8
python extract_palette.py --selftest
```

占比最大的通常是背景 / 网格，挑系列色前先剔除；输出 hex 直接进 `style_overrides.series_colors`。

对照用法（收敛循环每轮跑，需要脚本化就读 `--json`）：

```
python figure_metrics.py 参考图.png 成品图.png
python figure_metrics.py 成品图.png --json --band-hex "#FCE4EA" --dot-hex "#DE90BA"
python figure_metrics.py 成品图.png --pub-check --series-color "#0072B2,#E69F00,#009E73"
python figure_metrics.py 成品图.png --pub-check --json
python figure_metrics.py --selftest
python test_synth.py       # 合成真值：29 条几何断言（框/带/渐变/刻度/点径/字高/细线/半宽/双面板）
```

交付校验（收尾必跑，文件层）：

```
python verify_deliverable.py 成品.png 成品.pdf 成品.opju --min-width 1800
python verify_deliverable.py --selftest
```


**判据按实测精度定**（`test_synth.py` 合成真值实测）：frame / band / tick 误差 0px（断言公差 ±1px）、点径 0px（d=10 与 20）、渐变带 0px（±2px）、字高 ≤1px；真实截图因抗锯齿/缩放会更差，所以交付判据是 `band/绘图高` 相对差 **<5%**、`dot` **≤10% 或 ≤1px**、`tick` **≤2px**、`frame` 各边 **≤1px**。明确做不到：多段/非单调渐变带、>40px 的大符号（`max_frac` 上限，超了会被当实线排除）。

**渐变带不可用于台账**：`figure_metrics.py` 判到渐变时仍给数值，但会标 `band_kind: gradient_unsupported` + `band_usable: false`（文本与 `--json` 都有）；第 3 步台账只能记 `rejected`，不许因为「有个数」就记 `applied`。纯色带是 `band_kind: solid` + `band_usable: true`。

**缺测 ≠ 合格**：测不到的项在文本里是 `BAND unmeasured(<reason>)`、在 `--json` 里是 `null` + `band_reason`，字段永不省略。`status`：`ok` = 外框+装饰带+点径都测到，`partial` = 外框测到但带/点径没测到，`none` = 外框没测到（其余读数不可比）；rc 依次 `0/3/4`，用法错误 `2`。不给 `--band-hex`/`--dot-hex` 时按色板前几名猜，实际用的色值与来源（`cli` / `palette_guess`）回显在 `band_hex_used` / `band_hex_source`。装饰带只量**纯色**（单一 hex ± tol），渐变带会被量小——那属于已记录待修项，不是「没测到」。

**投稿可辨 (`--pub-check`)**：三项各自给实测值与阈值——相邻系列灰度亮度差 ΔL*（判据 ≥10）、Brettel 1997 色盲模拟（protanopia + deuteranopia）后的 CIEDE2000 ΔE00（取两模拟较小值，判据 ≥10）、系列色对白底 `#FFFFFF` 的 WCAG 对比度（判据 ≥1.5:1）。不达标时列出冲突系列的序号 + hex + 模拟种类，并从 Okabe-Ito 八色里给一个能同时满足 ΔL* 与 ΔE00 的换色建议。`--json` 里每项含 `pass`/`reason` 与实测值，缺测项为 `null` + 原因；`status` 三态 ok/partial/fail 对应 rc `0/3/4`，用法错误 `2`。颜色数学全部纯标准库（sRGB↔线性↔XYZ↔Lab、CIEDE2000、Brettel 投影），公式锚点由 `--selftest` 钉住。

## 与 editaplot 的关系（v2.2 借鉴了什么）

[editaplot](https://github.com/hang-jin/editaplot) 是同一件事的另一种做法（Codex skill + 自带 originpro 运行时 + 逐图型模板）。

**借鉴**：参考图只是「视觉 brief」，不是数据也不是指令；样式分三态落账（applied / retained_template_default / rejected）；允许清单刻意很小（只放能精确落地**且能读回**的字段）；文字只记**角色**不抄内容；「缺读回 = 失败」，导出存在不等于成功；样式来源优先级（用户明说 > 参考图建议 > 模板默认）。

**不借**：template registry 与 plan 冻结（我们按参考图自由构图，不预设图型）、自带 Python/originpro 运行时（我们用 dsh-origin MCP，多一层 runner 是纯负担）。

## 与另外两个技能的分工（三层，不合并）

| 层 | 技能 | 交什么 |
|---|---|---|
| 领域 SOP | `dsh-xps-peakfit` 等 | 数据、系列与含义、轴标题单位、要标注的文本、版面约束、禁止项 |
| 复刻方法论 | **本 skill** | 规格卡、渲染-对照-差量修正循环、verify |
| 工具层 | `origin-plotting` | 工具参数、错误码、失败恢复 |

分层理由是触发面、硬依赖（XPSPeak vs dsh-origin MCP）与复用面都不同，合并会让复刻件被绑死在单一领域；分工条款记录见 <https://github.com/bansheng2000/dsh-xps-peakfit/blob/main/docs/v2.4-figure-routing.md>。

## 触发边界（什么时候**不**该用这个 skill）

| 用户说的话 | 走哪 |
|---|---|
| 「复刻 / 照着这张画 / 画成这样 / 模仿这张图 / 参考这张排版」+ 给了图 | 本 skill |
| 给了图但只说「参考一下配色」，没要求整体复刻 | 先问一句，不明确就不套复刻 |
| 只说「画个图 / 出张图 / 这张数据画什么好」，**没有图** | **不用本 skill** → `origin-plotting`：`origin_plot_plan`（列画像 + 角色建议 + questions）→ `origin_execute_plan`；领域模板用 `origin_plot_template` |
| 领域 SOP 委派但没参考图 | 不套复刻 → 上游按 `origin-plotting` 建图 |

判据一句话：**有没有"要照着的那张图"**。没有就走数据驱动选图型（`origin_plot_plan`），两套流程不混。

## 科研投稿规格（v2.7 新增）

复刻对了但投不了稿等于白做。规格卡多了三个字段（`pub_target` / `pub_limits` / `stats`），并新增**第 2 步：科研投稿规格定档**（见 `SKILL.md`）：

- 成品尺寸：单栏 85 mm / 双栏 170–183 mm；字号按最终尺寸算（轴标题 8–9 pt、正文 7–8 pt、下限 6 pt）
- 线宽 0.5–1 pt；位图线条图 600–1200 dpi、照片 300 dpi，**不许插值放大**
- 配色要过灰度与红绿色盲（Okabe-Ito 八色），相邻系列亮度差 ≥10
- 误差棒必须写明 SD / SEM / 95% CI 与 n；显著性标记必须写检验方法与阈值——**用户没给就标 unknown 并问，不许自造**
- 字体族本机改不了（`TextN.font$` 是静默 no-op）：期刊要 Arial/Helvetica 时，交付说明必须点名让用户在 GUI 改

交付前自检从 12 条扩到 **17 条**，新增：成品尺寸与字号线宽、灰度/色盲可辨、统计定义与 n、字体族提醒。

## 使用

把本仓库目录放进 agent 的技能目录即可（例如 DSH 的 `~/.agents/skills/dsh-plot-clone/`）。

前置：本机装好 OriginLab Origin + `dsh-origin` MCP 插件（插件安装见 `install-dsh-origin` skill）。

脚本要 Python 3 + numpy + Pillow。**Windows 上别用裸 `python`**：微软商店的 `WindowsApps` 存根会以退出码 49 静默结束、一行输出都没有（看起来像脚本没生效）。用装了依赖的解释器绝对路径，例如 DSH 自带的 `C:\Users\12576\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe`；先 `python -c "print(1)"` 探一下，能打印再跑脚本。

触发词：复刻 / 照着画 / 画成这样 / 模仿这张图 / 参考图排版 / replicate figure。

## 边界（本 skill 不做什么）

- 不从参考图反推或抄写数据；不代做领域判断（峰归属、占比、拟合参数由上游 skill / 用户给）
- 不产生科学结论，不对数据「够不够发」下判断
- 不内置图像 diff 打分，也不承诺像素级一致
- **能**：颜色精确到 hex、线型线宽符号透明度、柱/条/面积渐变（`-pfm 3`，按绘图区高度插值）、峰填充止于背景曲线（白遮罩法）、整幅宽装饰带与条内文字、轴范围/刻度类型/反向、页面尺寸与图层几何、高 DPI 导出
- **只能逼近**：fill-to-next 模式的渐变（该模式忽略 `-pfm`，改用「填充到轴底 + 白遮罩截断」）；每个峰各自从峰顶饱和渐变（渐变按绘图区统一插值，峰越矮越淡）
- **做不到**：按字体名指定字体（`TextN.font$` / `layer.x.label.font$` 静默 no-op，改数字索引会变等宽/粗体）；从参考图读数据；像素级 1:1
- 渐变设色与导出必须分开调用（同一批会毒化 COM 会话），失败就重启 Origin 再来
- 面积填充的下边界锁定在设色时的轴下限：先定轴范围再设填充，改轴不会让填充跟随
- `origin_annotate` 的 y 是文字顶边、`origin_layout_info` 报的是底边，两者差一个字高；`style.size` 常被忽略，要 LabTalk `TextN.fsize` 强制
- 没装 Origin / dsh-origin 插件的机器上不适用

## 模板证据图（`templates/evidence/`）

实跑留下的产物：**27 份 `<id>.md`**（真实调用参数 + 对象层反读值 + 导出字节数）和 **27 张 `<id>.png`（1800×1276）**；`failed/` 下 2 张是 spec-only 的失败尝试现场图（`bland_altman`、`horizontal_bar`），`probes/` 下 5 张是旧探针图。

**水印已清（2026-11-05 重出）**：最早那 9 张（`bar` `dual_y` `forest` `heatmap` `line_error` `multi_panel` `scatter` `signal_stack` `xrd`）曾带满幅青色 `demo` 水印，本轮逐张重出后 `watermark_report` 全部 `mask 0 px / bands 0`，与其余 18 张同规格（1800×1276、`verify_deliverable --min-width 1800` → `STATUS PASS (6/6)`）。每份 md 都有 `## 水印复检` 一节记重出前后的判定值；图仍是**合成数据**验证图，不是实验示例。授权问题归用户处理，本 skill 不碰、不去水印、不换证书。

## 插件壳（让 MCP 连接器跟着插件一起装好）

技能本体是纯文件（装进 `~/.agents/skills/` 只是拷贝，没有任何安装/启动钩子），所以本仓库同时是一个 DSH 插件 bundle：`package.json` + `cordis.patch.yml` + `lib/index.js`。

壳只做**检测与决策**，不画图、不阻塞启动：

| 阶段 | 行为 |
|---|---|
| `apply()` | 懒加载 `webServer` seam 取端口 → `POST /mcp-connector/api {"method":"status"}` |
| 已有 `custom-dsh-origin` 且启用 | **复用，一个字节都不改**（只读 status，绝不 configure） |
| 已有但被禁用 | 返回 `enable` 决策，**不擅自启用** |
| 没有连接 + 依赖就位 | 走 `configure` 注册（connector 会先真启动 server 并 tools/list 验证，失败自动回滚） |
| 没有连接 + 依赖缺失 | `spawn detached` bootstrap，`apply()` 立刻返回 |

为什么注册走 HTTP API 而不写 `storages/mcp_connector.json`：connector 在 `apply` 时把 domain open 进内存且全库无文件监听，外部写入必须重启 DSH 才生效，还会绕过快照/回滚与 scope 校验。HTTP API 是它自己的 UI 也在用的接口（有方法白名单与回环信任校验）。

状态与产物都在用户目录，**不放插件目录**（pnpm 重装会清空 `node_modules`）：`~/.dsh/dsh-plot-clone/{venv,server,cache,mcp-state.json,selection.json,user-templates/,bootstrap.json,bootstrap.log}`。

### 模板选择页（入口在右侧栏「Origin 模板」标签）

**可见入口是 DSH 右侧栏的「Origin 模板」标签**（`sidebar.right.pane.tab`，key `dsh-plot-clone/templates`，显示名「Origin 模板」；只改 title 文本，`id` / `kind` / 槽位 key 不动）——`lib/client.js` 手写 classic script 注册，`package.json` 用 `dsh.client = {platform:"web", immediately:true, inject:["slots","sidebarRightTabs","sidebarRight"]}` 声明，无构建链。宿主太老、没有这个 slot 时：注册函数整体跳过，不抛异常、不炸侧栏；此时用下面的网页入口。

路由和 MCP 自注册挂在同一个 `webServer` seam 上（`kind:"prefix"`，prefix `/plot-clone`），不新开端口。网页入口 `http://127.0.0.1:<DSH 端口>/plot-clone/` 与标签页是同一份数据、同一套路由。客户端自带诊断上报（`/plot-clone/diag`，失败静默 + `keepalive`）：`apply`（origin / hasInject / hasSlots / version）、`inject-cb`（注入的服务名、`typeof tabs`、injected 的键）、`no-service` / `no-register` / `no-slots` / `no-inject`、`register-attempt` / `register-result`（返回值 `typeof` 与键、是否有 disposer）、`registered`（成功条数）、`slot-result` / `slot-error`（每条槽位注册）、`error` / `inject-error` / `slots-error`、`window-error`；渲染侧：`panel-enter` / `panel-ready`（带张数与错误）、`panel-error`（含 stack，页面同时显示红字 pre-wrap，**不许白屏无痕迹**）、`title-enter`；取数侧：`fetch`（url / status / ok）与 `fetch-base-fallback`——宿主页面 origin 是 `dsh-app://app` 时相对路径未必通，先试相对路径，非 200 或抛异常再回落 `http://127.0.0.1:<port>`（拿不到 port 用 `document.baseURI` 解析），成功就记住该 base。面板顶层永远先渲染一行「模板 · 加载中 / 共 N 个」，用来区分「一点内容都没有」和「内容为空」。布局取证：`panel-ready` 之后（以及 `title-enter` 之后）用 `requestAnimationFrame` 补一条 `panel-rect` / `title-rect`，上报 `wrap.getBoundingClientRect()`、父级 rect 与 `getComputedStyle` 的 `display/height/overflow`、第一张卡片的 rect、以及 `styleApplied`（注入的 `<style id=dsh-plot-clone-tab-style>` 在不在）——DOM 有但屏幕空白时，只有几何能区分「被压成 0 高」和「被裁掉」。同一条 `panel-rect` 还带：`cards`（`wrap.querySelectorAll('[data-template-id]').length` / `.pc-card` 计数 / `.pc-list` 的 `children.length` 与 rect，判「卡片到底渲染没有」）、`innerLen` + `innerHead`（前 300 字 HTML，压缩空白）、`ancestors`（往上 4 层，每层 `tagName.class` + rect + `display/visibility/opacity/overflow/clipPath/height/position/zIndex`，哪一层 `display:none`/`height:0`/`overflow:hidden` 立刻现形）、`atPoint`（`document.elementFromPoint` 命中元素的 `tagName.class`，判是否被别的层盖住）、`rootKind`（`getRootNode() === document` ? document : shadow/other）、`pass`（`raf` = 提交后第一帧；`late` = 600 ms 后复测，`firstCard:null` 多是这种竞态）。**强可见兜底已撤**：诊断期的 `.pc-wrap` 内联 `minHeight:420px; height:auto; background:#20242c` 是临时的，确认不是外层高度塌陷后已恢复成只靠 CSS（`.pc-wrap` 自身的 `height:100%`），成品里不许留这两项。宿主给的 body 容器是 `.tabBody{height:100%;min-height:0;overflow:hidden}`，不等你撑高、也不防被压成 0 高，所以 `height:100%` 只有在祖先链有确定高度时才解析成真实像素。渲染走 `React.createElement`（**不是** `react/jsx-runtime` 的 `jsx`：后者的第三个参数是 key，而本文件全写成 `jsx(type, props, [子元素])`，children 会被整个丢掉 → 面板只剩空壳、`innerHTML` 长度 0、卡片 0 张；`createElement(type, props, ...children)` 与该调用形态兼容）。客户端要等的服务是 `sidebarRightTabs` **与** `sidebarRight`（两个 provide 在宿主同一个 effect 里，`package.json` 的 `dsh.client.inject` 与 `ctx.inject` 都写全）；`tabs.register` 的返回值按函数 / `{dispose}` / `undefined` 三种都算注册成功，拿不到 disposer 只影响卸载。

| 路由 | 返回 |
|---|---|
| `GET /` | 自包含 HTML（无外部资源） |
| `GET /templates` | `{ok, count, system, user, templates, selected, favorites}`；条目 `id/name/category/status/channels/thumb/evidencePath/kind/gap`，用户条目另带 `origin_file/original_name/ext/sha256/size/usage/createdAt` 且 `status:"external"` |
| `GET /thumb/<id>` | `image/png`，且**只有 `templates/evidence/<id>.png`（系统）或 `user-templates/<id>/thumb.png`（用户）存在时**才 200；否则 404 `no-thumbnail` |
| `POST /user-templates?filename=&name=&category=&note=` | body 是文件**原始字节**；只认 `.otp .otpu .opj .opju .oth`，其它 400 `unsupported-ext`（附 `accepted` 五项），超 64 MB 413 `too-large`；成功回 `{ok, id, template, count, system, user}` |
| `DELETE /user-templates/<id>` | 删运行时目录；删的正是当前选中项时自动清空 `selected`，回 `selection` 视图 |
| `POST /user-templates/<id>/rename` | body `{name?, category?, note?}` |
| `GET /selection` | `{selected, favorites, updatedAt, origin_file, usage}` |
| `POST /selection` | body `{selected: "<id>"\|null, favorites: ["<id>"]}`；非法 id 400 并逐条报错，收藏可增可删 |

选中落 `~/.dsh/dsh-plot-clone/selection.json`（与 `mcp-state.json` 同目录，pnpm 重装不清）。它只是**偏好**，不改自动匹配判据：第 4 步先用 `python templates_index.py --selected` 读它，命中就按用户选的做；数据对不上就改自动匹配并给「推荐 id + 缩略图」，不报错也不硬套。选中**用户模板**时文件里还带 `origin_file`（绝对路径）和 `usage`——agent 拿这两样去 Origin 里打开、读图层、存样式快照再套用，插件不解析 Origin 格式。缺缩略图时由 **agent 侧**补（插件进程没有 Origin 通道）：`.opj`/`.opju` → `origin_export(fmt="png", width=600, file_path="<id>/thumb.png")`，落盘即生效（`GET /plot-clone/thumb/<id>` 命中就 200，不用重建索引）；`.otp`/`.otpu` 打开是 0 曲线空框，**不生成**缩略图。

用户模板存 `~/.dsh/dsh-plot-clone/user-templates/<id>/`：`source.otp|figure.opju`（原件，字节不变）+ `meta.json`（sha256/原始文件名/尺寸/时间）+ 可选 `thumb.png`（用户自己给才显示）。仓库里**零新增**。

### bootstrap（首次安装器）

`lib/bootstrap.py` 三个阶段，任一失败都写 `bootstrap.json`（ok/error/hint）+ `bootstrap.log`，hint 是能直接复制执行的手动命令：

| 阶段 | 做什么 | 实测 |
|---|---|---|
| `server` | 按**钉死 commit** 下 codeload tarball → sha256 校验 → 解包到 `server/`；下过一次只校验不重下；离线无缓存明确报错 | commit `03acc24…`、tarball 1.39 MB、sha256 `c2637e…`；重跑实测「只校验，不重下」 |
| `venv` | 用 DSH 自带 Python 3.12.14 建 venv → `pip install -r requirements.txt`；不强制代理（PyPI 直连可通） | **134 MB**，约 25 秒 |
| `register` | `status` 查 `serverName == dsh-origin` → 命中且启用就**只记录、不 configure**；被禁用则提示用户，不擅自启用；都没有才 `configure`（字段是 **`params`**） | 实测走复用路径，日志「复用，不 configure」 |

`--offline` 禁网只用缓存；`--status` 打印当前状态；`--stage venv|server|register` 单独跑。

**「装完就能用」已实测**：注册一条临时连接（`custom-plot-clone-test` → 只暴露 `ping` 的假 MCP server）后，**同一个已开着的会话**直接调 `mcp__plot-clone-test__ping` 返回 `pong` —— 不需要新开会话。验完已 `disconnect`，用户的 `custom-dsh-origin` 全程未被触碰（4 条连接 → 5 → 4）。

测试：`node test/selftest.mjs`（9 条，含幂等键 `custom-<serverName>`、已存在只读复用、configure 失败不落半条记录、patch 必须 `- insert:` 形态）。

## 版本号（两个，别混）

本仓库同时是一个技能包和一个 DSH 插件包，因此有**两个独立版本号**：

| 版本 | 位置 | 管什么 | 变更时机 |
|---|---|---|---|
| 技能版本 `v2.7` | `SKILL.md` 顶部注记 + 本节下方「版本」段 | 复刻方法论本身：步骤、判据、能力表、脚本行为、模板库 | 改 SKILL/脚本/模板时**记入变更记录**，但版本号只在发版时改 |
| 插件版本 `0.1.1` | `package.json` 的 `version` | 插件壳：检测、注册 connector、bootstrap | 改 `lib/index.js` 时**不动号**，发版时改 |

两者**都不许擅自 bump**：改代码不等于发版，发版前会单独确认。

## 版本

变更记录写在 `SKILL.md` 顶部（当前 **v2.7**：科研投稿规格定档（第 2 步 + `--pub-check` 可辨三查 + 自检 17 条）；范围收回到**只做 Origin 复刻**——矢量与 3D 两条通道实测达不到可用水平，已移除。v2.6：量测层重写——`pixel_core.py` 统一阈值/取色/框检测，`test_synth.py` 29 条合成真值断言，14 处实测缺陷修复，判据按实测精度重定；v2.0：改为通用方法论——量测前置、图元映射表、能力表、硬坑清单；v1.5 注释 y 口径 / 面积填充底锁定轴下限 / 装饰条留白缝；v1.4 装饰条贴基线；v1.3 fill-to-next 不吃 -pfm 与列短名；v1.2 面积渐变已验证；v1.1 填充形态进卡；v1.0 初版）。

## 许可

暂未附 `LICENSE` 文件，默认保留所有权利；需要开源许可（MIT / CC-BY 等）请提出。
