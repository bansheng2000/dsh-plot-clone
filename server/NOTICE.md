# 来源与许可（server/ 目录）

本目录下的 Python 源码**不是本仓库原创**，而是 dsh-origin-plugin 的原样副本
（未修改任何一行），随 dsh-plot-clone 一起分发，好让「装插件 = Origin MCP 一起装好」，
不必首启再从 GitHub 下载、也不必经过代理。

## 来源

- 项目：dsh-origin-plugin
- 仓库：https://github.com/Fantasality/dsh-origin-plugin
- 版本：2.7.5
- 提交：`03acc24181aae6c6ac3a8502aa6ae24a8d1708da`
- 上游 npm 最后发布版本是 2.7.4；2.7.5 只在这个提交里（新增 `origin_new_project`），
  本技能依赖该工具，所以固定到上面的提交，不做「装最新 npm 版」这种漂移。

## 许可

MIT License，Copyright (c) 2026 Fantasality。许可全文见 `server/LICENSE`（与上游
`LICENSE` 逐字节相同）。MIT 允许再分发与随包分发，前提是保留版权声明与许可全文——
这两条都在本目录里，请勿删除。

## 目录内文件

`origin_mcp_stdio.py`、`origin_mcp_server.py`、`origin_engine.py`、`origin_edit.py`、
`origin_template.py`、`origin_errors.py`、`origin_annotate.py`、`origin_capabilities.py`、
`origin_verify.py`、`origin_mcp_http.py`、`origin_analysis.py`、`origin_bridge.py`、
`origin_e2e.py`（`origin_figure` / `warmup` / `pages_gc` 的实现）、`origin_fileio.py`、`origin_plan.py`、`origin_proof.py`、`origin_spec.py`、
`origin_matrix.py`、`origin_gallery.py`、`plot_style.py`、`requirements.txt`。

## 升级方式

上游有更新时，把新提交的对应文件整份覆盖到 `server/`，同步更新本文件里的版本与
提交号；`lib/bootstrap.py` 用逐文件 sha256 指纹判断是否需要重新拷贝到
`<DSH_HOME>/dsh-plot-clone/server/`，所以升级后首启会自动刷新副本。
