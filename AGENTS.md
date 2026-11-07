# AGENTS.md

## 工作方式
- 用简体中文回复；报告要给出实测数值，不要只说通过/不通过。
- 改完先跑全套自检，全 rc=0 才算过：`test_synth.py`、`measure_ref.py` / `figure_metrics.py` / `extract_palette.py` / `verify_deliverable.py` / `templates_index.py` 的 `--selftest`、`node test/selftest.mjs`。
- 自有 HTTP 路由挂在 `/plot-clone` 前缀（`ROUTE_PREFIX`），绝不要注册 `/plugins/<插件 id>` 前缀：宿主在同一前缀下下发客户端 bundle，会被前缀 handler 吃掉，表现为标签内容空白；前缀下认不出的子路径要 `return undefined` 交回下一个 handler，不要自己回 404。
- 侧栏标签注册：tab 的 `id`、`kind` 与 slot `key` 必须是同一个字符串——宿主按标签实例的 `kind` 找内容体，不匹配就显示「这类内容还没有可用的查看方式」；改 `kind` 时要留一份旧 kind 的兼容别名（别名不给 `guide`，免得「+」菜单多一项）。
- 不自行改版本号：技能版本与插件版本两个号并存，都不得擅自 bump，发版前先问用户。但提交由你来做——每个任务单独 commit，回报里给出 commit hash，并保证 `git status` 干净。
- 改完仓库里的技能文件（SKILL.md / README.md / *.py）后，需同步到 `C:\Users\12576\.agents\skills\dsh-plot-clone`，并核对两边 md5 一致；副本目录只放技能文件，不放 `.probe`/`.dsh-ops` 之类的临时目录，也不放 `templates/evidence/**/*.png`——证据图留在仓库当证据、不进技能副本，同步脚本按此排除（`sync_skills.py` 的 `SKIP_EXT`/`EXCLUDE_DIRS`）。
