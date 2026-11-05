# AGENTS.md

## 工作方式
- 用简体中文回复；报告要给出实测数值，不要只说通过/不通过。
- 改完先跑全套自检，全 rc=0 才算过：`test_synth.py`、`measure_ref.py` / `figure_metrics.py` / `extract_palette.py` / `verify_deliverable.py` / `templates_index.py` 的 `--selftest`、`node test/selftest.mjs`。
- 不自行改版本号、不 commit，改动留在工作区等复核；技能版本与插件版本两个号并存，都不得擅自 bump，发版前先问用户。
- 改完仓库里的技能文件（SKILL.md / README.md / *.py）后，需同步到 `C:\Users\12576\.agents\skills\dsh-plot-clone`，并核对两边 md5 一致；副本目录只放技能文件，不放 `.probe`/`.dsh-ops` 之类的临时目录，也不放 `templates/evidence/**/*.png`——证据图留在仓库当证据、不进技能副本，同步脚本按此排除（`sync_skills.py` 的 `SKIP_EXT`/`EXCLUDE_DIRS`）。
