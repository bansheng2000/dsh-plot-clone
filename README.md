# dsh-plot-clone

把一张参考图（论文插图 / 别人的成品图 / 截图）复刻成**可编辑的 Origin 数据图**：像素量测 → 规格卡 → 模板或自由构图 → 2~3 轮渲染-对照-差量收敛 → 交付。

只在**有「要照着画」的图**时用；只有数据、没有参考图，走 `origin-plotting` 的 `origin_plot_plan`。完整方法论与实测硬坑见 `SKILL.md`。

## 安装

前置：OriginLab Origin；技能侧量测脚本要 Python 3 + numpy + Pillow。**Origin MCP 不用另装**——插件随包带 server（MIT，来源与提交号见 `server/NOTICE.md`），首次启动自动建 venv 并挂上 `dsh-origin`。

1. 技能：把本仓库拷到 agent 技能目录，如 `~/.agents/skills/dsh-plot-clone/`。
2. 插件壳：在 DSH profile 的 `package.json` 加 `file:` 依赖，并把 `dsh-plot-clone` 写进 `dsh.profile.bundles`。
3. 重装并重启 DSH，右侧栏出现「Origin 模板」即装好：

```bash
pnpm install                                      # 在 profile 目录执行，然后重启 DSH
curl http://127.0.0.1:<port>/plot-clone/templates # 返回 JSON 即就绪
```

首次启动面板会显示依赖安装进度（建 venv → pip 装 mcp/originpro/pywin32/numpy）。装不上时面板直接给失败原因和**可复制的三条命令**（含清华镜像）；也可以手动跑 `python lib/bootstrap.py --stage venv`。若本机已有一条 enabled 的同名 `dsh-origin` 连接，面板出红条、**不会自动改你的配置**：点「停用旧连接」把请求发成一条消息，由 agent 备份后停用、重启生效。

## 快速开始

```bash
python measure_ref.py 参考图.png                          # 外框比例、主色板、装饰带占比
python templates_index.py --check                         # 49 套模板的索引闸门（七条断言）
python templates_index.py --match --roles x,y --ncols 2   # 只有数据时按契约找候选
python figure_metrics.py 参考图.png 成品.png              # 收敛循环每轮跑
python verify_deliverable.py 成品.png 成品.pdf 成品.opju --min-width 1800
```

流程：量测 → 16 字段规格卡（缺项写 `unknown`）→ 模板（`--selected` / `--match` / `--list`）或自由构图 → Origin 渲染 → 差量表 → `origin_verify_graph` → 交付 PNG（≥1800 宽）+ PDF + OPJU。

## 关键概念与限制

| 项 | 说明 |
|---|---|
| 能做什么 | 颜色精确到 hex、线型/线宽/符号/透明度、柱与面积渐变、白遮罩做峰填充、装饰带、轴范围与反向、页面几何、高 DPI 导出 |
| 只能逼近 | fill-to-next 的渐变（填充到轴底 + 白遮罩截断）、每峰各自从峰顶饱和渐变、字体族（`TextN.font$` 静默 no-op，需用户在 GUI 改） |
| 做不到 | 从参考图反推数据、像素级 1:1、按字体名指定字体 |
| 红线 | 数据只来自用户数值/文件；不反推、不插值造点、不抄文字水印；不承诺 1:1 |
| 模板 | 49 套：27 套 `implemented` 可直接出图，22 套 `spec-only` 必须原话报 gap，绝不静默降级 |
| 分工 | 领域 SOP（如 `dsh-xps-peakfit`）给数据与约束；本技能管复刻；`origin-plotting` 管工具参数与错误恢复 |

## 数据目录

全在 `~/.dsh/dsh-plot-clone/`，pnpm 重装不清：

- `selection.json` — 选中的模板与收藏；`POST /selection` 传 `null`/空串即取消选择（`--check` 同时查仓库 `templates/favorites.json` 与这里的收藏悬空）。
- `aliases.json` — 系统模板显示名；只写这里，**不动仓库 `templates/system/*`**。
- `user-templates/<id>/` — 用户上传的 Origin 原件 + `meta.json` + 可选 `thumb.png`。
- `server/`、`venv/`、`cache/`、`mcp-state.json` — 壳自动装好的 MCP 连接器与依赖。
- `mcp-migration-request.json` — 点过「停用旧连接」后的留痕（请求时间、连接 key、给 agent 的提示词）；本插件从不自己改 `mcp_connector.json`。

系统模板缩略图只认 `templates/evidence/<id>.png`；用户 `.opj/.opju` 的 `thumb.png` 由 agent 侧 `origin_export(width=600)` 补，`.otp/.otpu` 不生成（空框会误导）。

## 故障排查

| 现象 | 处置 |
|---|---|
| 侧栏标签在、内容空白 | tab 的 `id`/`kind` 与 slot `key` 必须同一字符串；先看 `/plot-clone/diag` 的 `panel-error` |
| 导出或建页后 COM 调用卡 60s | 弹了 `#32770` GDI 框；`PostMessage(hwnd,0x00F5,0,0)` 点掉，批量导出后重启 Origin |
| `doc -o` 打开 `.oth` 后工程空了 | `.oth` 禁止 `doc -o`；让用户在 GUI Theme Manager 应用，或改用 `.otpu` |
| Windows 上 `python` 无输出、退出码 49 | 用了商店版存根；换解释器绝对路径（如 DSH 自带 `python.exe`） |
| 设完渐变再导出，三通道全失败 | 同一批调用毒化 COM 会话；设色与导出拆成两次调用 |
| 面板红条说 `dsh-origin` 同名冲突 | 本机另有一条 enabled 的同名连接，宿主只保留一条；点「停用旧连接」发消息给 agent（先备份、后停用），重启生效 |
| 依赖装不上 / 面板一直转 | 看面板给的失败原因与三条手动命令；或手动 `python lib/bootstrap.py --stage venv --status` 复跑 |

## 版本与变更

当前 `2.10.1`（技能与插件同号）。变更记录见 `CHANGELOG.md`。

**Origin MCP 随 dsh-plot-clone 版本，不单独发版**：`serverInfo.version` 在启动时读本包 `package.json`（不硬编码），上游 fork 的版本（2.7.5 / `03acc24…`）另记在 `server/VENDOR.md`，`origin_status` 的 `upstream` 字段也会回报。

`server/` 是**冻结快照**，上游更新不会自动进来、也不会覆盖我们；要跟进跑 `node scripts/vendor_sync.mjs --from <上游目录|.tgz>`（只打印差异，不写盘、不联网），确认后人工合并并更新 `VENDOR.md` 的哈希表。

## 许可

暂未附 `LICENSE`，默认保留所有权利。模板规格的部分来源与许可见 `templates/NOTICE`。
