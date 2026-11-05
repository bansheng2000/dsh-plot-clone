#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""templates_index.py — 模板索引的机器闸门（纯标准库，无依赖）

为什么要有这个脚本：47 个模板全收，但「收录」不等于「能用」。`status` 只能靠
人自觉写就一定会有人写虚；这里把它变成退出码 —— 没证据的 implemented、
没写 gap 的 spec-only，`--check` 直接 rc 非 0。

五条断言（缺一条都不许发版）：
  1. status=implemented 必须有非空 status_evidence.evidence，且该证据文件存在非空
  2. status=spec-only 必须有非空 gap（缺口原因）
  3. kind=system 的 path 必须在 templates/system/ 下
  4. favorites.json 里每个 id 必须在 index 里存在（不许悬空收藏）
  5. renderer.channel 每一项的通道名必须在白名单里（防手写不存在的工具名）

用法：
    python templates_index.py --check                # 校验，rc 0 全过 / 1 有 FAIL / 2 用法或索引缺失
    python templates_index.py --list                 # 三类模板清单（收藏置顶 / 系统按图型分组 / 用户）
    python templates_index.py --list --group system --status implemented
    python templates_index.py --selftest             # 四条变异自检，每条都必须真红
"""

from __future__ import annotations

import argparse
import io
import json
import os
import shutil
import sys
import tempfile

# 真实存在的 dsh-origin MCP 工具名（通道名取 ':' 前的基名）。
# 加通道时先确认工具真的存在，再往这里加 —— 这张表就是「不许手写幻觉工具名」的闸门。
CHANNEL_WHITELIST = {
    "origin_plot",
    "origin_plot_template",
    "origin_plot3d",
    "origin_plot_contour",
    "origin_matrix_plot",
    "origin_matrix_write",
    "origin_fit",
    "origin_peak_fit",
    "origin_edit_plot",
    "origin_edit_axis",
    "origin_edit_legend",
    "origin_edit_page",
    "origin_add_line",
    "origin_add_text",
    "origin_annotate",
    "origin_manage_plots",
    "origin_export",
    "origin_export_delivery",
    "origin_save_project",
    "origin_view_graph",
    "origin_verify_graph",
    "origin_labtalk",
    "origin_layout_info",
}

# 带变体子键的通道：'工具:变体' 里的变体也必须是真实存在的图型，否则就是在写幻觉参数
# （例如 `origin_plot:violin` —— origin_plot 的 plot_type 里没有 violin，小提琴只能走 LabTalk）。
VARIANT_WHITELIST = {
    "origin_plot": {"line", "scatter", "line_symbol", "column", "histogram", "box", "bar"},
    "origin_plot_template": {"stacked_spectra", "xrd_pattern", "dual_y", "forest", "multi_panel"},
    "origin_plot3d": {"surface", "scatter"},
    "origin_plot_contour": {"contour", "contour_fill", "3d_wire"},
    "origin_matrix_plot": {"surface", "scatter", "contour", "contour_fill", "3d_wire"},
}

STATUSES = ("implemented", "spec-only")
GROUPS = ("all", "favorites", "system", "user")

# 数据契约：schema.json 里这 5 个字段是唯一真源，index.json 的 data_contract 必须逐字镜像它。
CONTRACT_KEYS = ("required_roles", "optional_roles", "min_columns", "min_rows", "supported_extensions")
# index 侧允许的补充字段（给人看的中文列名，来自 editaplot 原表；不进 schema.json）。
CONTRACT_INDEX_ONLY = ("required_columns_zh",)

RC_OK = 0
RC_FAIL = 1
RC_USAGE = 2


# ───────────────────────── 读写 ─────────────────────────


def load_json(path):
    with io.open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def paths_for(root):
    tdir = os.path.join(root, "templates")
    return {
        "templates": tdir,
        "index": os.path.join(tdir, "index.json"),
        "favorites": os.path.join(tdir, "favorites.json"),
    }


# ───────────────────────── 五条断言 ─────────────────────────


def check_index(root, env=None):
    """返回 (rc, lines)。lines 是给人和脚本看的逐条结果。

    env 只在传了的时候才去查 selection.json 的收藏（页面写的那份偏好）；
    不传就只看仓库里的 favorites.json —— 自检用临时目录跑，绝不能读用户真实偏好。
    """
    p = paths_for(root)
    lines = []

    if not os.path.isfile(p["index"]):
        return RC_USAGE, ["ERROR index not found: %s（模板库未生成）" % p["index"]]

    try:
        index = load_json(p["index"])
    except Exception as exc:  # noqa: BLE001 - 报错要给人看，不吞
        return RC_FAIL, ["ERROR index.json 解析失败: %s" % exc]

    templates = index.get("templates")
    if not isinstance(templates, list) or not templates:
        return RC_FAIL, ["ERROR index.json 没有 templates 数组或为空"]

    ids = set()
    issues = []

    # 1 + 2：status 与证据/gap 的对应关系
    implemented = spec_only = 0
    for tpl in templates:
        tid = str(tpl.get("id") or "")
        if not tid:
            issues.append("missing id: %r" % (tpl,))
            continue
        if tid in ids:
            issues.append("duplicate id: %s" % tid)
        ids.add(tid)

        status = tpl.get("status")
        if status not in STATUSES:
            issues.append("bad status %r on %s（只允许 %s）" % (status, tid, "/".join(STATUSES)))
            continue

        if status == "implemented":
            implemented += 1
            ev = tpl.get("status_evidence") or {}
            rel = str(ev.get("evidence") or "").strip()
            if not rel:
                issues.append("missing evidence: %s 标了 implemented 但没有 status_evidence.evidence" % tid)
                continue
            ev_path = rel if os.path.isabs(rel) else os.path.join(p["templates"], rel)
            if not os.path.isfile(ev_path):
                issues.append("missing evidence: %s 的证据文件不存在 %s" % (tid, rel))
            elif os.path.getsize(ev_path) == 0:
                issues.append("missing evidence: %s 的证据文件为空 %s" % (tid, rel))
        else:
            spec_only += 1
            if not str(tpl.get("gap") or "").strip():
                issues.append("missing gap: %s 标了 spec-only 但没写 gap（缺口原因）" % tid)

    # 3：system 模板的路径
    system_count = 0
    for tpl in templates:
        if tpl.get("kind") != "system":
            continue
        system_count += 1
        tid = tpl.get("id")
        rel = str(tpl.get("path") or "").replace("\\", "/")
        if not rel.startswith("system/"):
            issues.append("bad path: %s 是 system 模板但 path=%r（必须 system/ 下）" % (tid, rel))

    # 4：收藏不许悬空
    favorites = []
    if os.path.isfile(p["favorites"]):
        try:
            raw = load_json(p["favorites"])
            favorites = raw if isinstance(raw, list) else raw.get("favorites") or []
        except Exception as exc:  # noqa: BLE001
            issues.append("bad favorites: favorites.json 解析失败 %s" % exc)
            favorites = []
    dangling = 0
    for fav in favorites:
        fid = str((fav or {}).get("id") or "")
        if fid and fid not in ids:
            dangling += 1
            issues.append("dangling favorite: %s 不在 index 里（收藏不许指向不存在的模板）" % fid)

    # 4b：页面写的 selection.json 收藏同样不许悬空。
    # 用户模板不在 index.json 里（它在 runtime 目录），所以已知集合 = index ids + user-templates/<id>/。
    selection_favorites = 0
    if env is not None:
        sel = read_selection(env)
        known = ids | user_template_ids(env)
        for fid in sel["favorites"]:
            selection_favorites += 1
            if fid not in known:
                dangling += 1
                issues.append(
                    "dangling favorite: %s 在 selection.json 的 favorites 里，但既不是 index 模板也不是用户模板"
                    "（删模板必须同时摘收藏）" % fid
                )

    # 5：通道白名单
    channel_count = 0
    for tpl in templates:
        tid = tpl.get("id")
        renderer = tpl.get("renderer") or {}
        channels = renderer.get("channel") or []
        if not isinstance(channels, list):
            issues.append("unknown channel: %s 的 renderer.channel 不是数组" % tid)
            continue
        for ch in channels:
            channel_count += 1
            parts = str(ch).split(":", 1)
            base = parts[0].strip()
            variant = parts[1].strip() if len(parts) > 1 else ""
            if base not in CHANNEL_WHITELIST:
                issues.append("unknown channel: %s 用了不存在的通道 %r（不在白名单）" % (tid, ch))
                continue
            allowed = VARIANT_WHITELIST.get(base)
            if allowed is not None and variant and variant not in allowed:
                issues.append(
                    "unknown channel: %s 的 %r 变体 %r 不存在（%s 只支持 %s）"
                    % (tid, base, variant, base, "/".join(sorted(allowed)))
                )

    # 6：数据契约两处必须一致 —— schema.json 是唯一真源（契约跟随模板目录走），index.json 是给 CLI/UI 读的镜像。
    # 镜像漏字段最危险：--match 会按缺了 min_rows 的契约推荐模板，3 行数据也算"够"。
    contract_count = 0
    for tpl in templates:
        tid = str(tpl.get("id") or "")
        rel = str(tpl.get("path") or "").replace("\\", "/")
        if not rel:
            continue
        sp = os.path.join(p["templates"], rel.replace("/", os.sep), "schema.json")
        ic = tpl.get("data_contract") or {}
        if not os.path.isfile(sp):
            issues.append("missing schema: %s 没有 %s（数据契约必须写在模板目录里）" % (tid, rel + "/schema.json"))
            continue
        try:
            schema = load_json(sp)
        except Exception as exc:  # noqa: BLE001
            issues.append("bad schema: %s 的 schema.json 解析失败 %s" % (tid, exc))
            continue
        contract_count += 1
        missing = [k for k in CONTRACT_KEYS if k not in ic]
        unexpected = [k for k in ic if k not in CONTRACT_KEYS and k not in CONTRACT_INDEX_ONLY]
        mismatch = []
        for k in CONTRACT_KEYS:
            a, b = ic.get(k), schema.get(k)
            if isinstance(a, list) and isinstance(b, list):
                a, b = sorted(a), sorted(b)
            if a != b:
                mismatch.append("%s（index=%r schema=%r）" % (k, ic.get(k), schema.get(k)))
        if missing or unexpected or mismatch:
            parts = []
            if missing:
                parts.append("缺 " + ", ".join(missing))
            if unexpected:
                parts.append("多出 " + ", ".join(unexpected))
            if mismatch:
                parts.append("值不一致 " + "；".join(mismatch))
            issues.append(
                "bad contract: %s 的 index.data_contract 与模板自己的 schema.json 不一致（以 schema.json 为准）：%s"
                % (tid, "；".join(parts))
            )

    # 汇总
    lines.append("CHECK evidence   implemented=%d  spec-only=%d" % (implemented, spec_only))
    lines.append("CHECK path       system=%d" % system_count)
    lines.append("CHECK contract   schemas=%d  keys=%d" % (contract_count, len(CONTRACT_KEYS)))
    lines.append("CHECK favorite   favorites=%d  selection=%d  dangling=%d" % (len(favorites), selection_favorites, dangling))
    lines.append("CHECK channel    channels=%d  whitelist=%d" % (channel_count, len(CHANNEL_WHITELIST)))

    if issues:
        lines.append("")
        for issue in issues:
            lines.append("FAIL %s" % issue)
        lines.append("")
        lines.append("STATUS FAIL (%d issue(s))" % len(issues))
        return RC_FAIL, lines

    lines.append("")
    lines.append("STATUS PASS (%d templates)" % len(templates))
    return RC_OK, lines


# ───────────────────────── 清单 ─────────────────────────


def list_templates(root, group="all", status=None):
    p = paths_for(root)
    if not os.path.isfile(p["index"]):
        return RC_USAGE, ["ERROR index not found: %s" % p["index"]]
    index = load_json(p["index"])
    templates = index.get("templates") or []

    favorites = []
    if os.path.isfile(p["favorites"]):
        try:
            raw = load_json(p["favorites"])
            favorites = raw if isinstance(raw, list) else raw.get("favorites") or []
        except Exception:  # noqa: BLE001
            favorites = []
    fav_ids = [str((f or {}).get("id") or "") for f in favorites]
    fav_set = set(fav_ids)

    def row(tpl):
        mark = "*" if tpl.get("id") in fav_set else " "
        gap = tpl.get("gap")
        note = "" if tpl.get("status") == "implemented" else "  [spec-only: %s]" % (gap or "未写 gap")
        return "%s %-22s %-13s %-34s %s%s" % (
            mark, tpl.get("id"), tpl.get("status"), tpl.get("category") or "-",
            ",".join((tpl.get("renderer") or {}).get("channel") or []), note,
        )

    def keep(tpl):
        if status and tpl.get("status") != status:
            return False
        if group == "system":
            return tpl.get("kind") == "system"
        if group == "user":
            return tpl.get("kind") == "user"
        return True

    lines = []
    if group in ("all", "favorites"):
        lines.append("## 收藏（置顶，共 %d）" % len(fav_ids))
        by_id = {t.get("id"): t for t in templates}
        for fid in fav_ids:
            tpl = by_id.get(fid)
            if tpl and keep(tpl):
                lines.append(row(tpl))
        lines.append("")

    if group in ("all", "system"):
        lines.append("## 系统模板（按图型分类）")
        buckets = {}
        for tpl in templates:
            if tpl.get("kind") != "system" or not keep(tpl):
                continue
            buckets.setdefault(tpl.get("category") or "未分类", []).append(tpl)
        for cat in sorted(buckets):
            lines.append("### %s" % cat)
            for tpl in sorted(buckets[cat], key=lambda x: x.get("id") or ""):
                lines.append(row(tpl))
        lines.append("")

    if group in ("all", "user"):
        lines.append("## 用户模板")
        users = [t for t in templates if t.get("kind") == "user" and keep(t)]
        for tpl in sorted(users, key=lambda x: x.get("id") or ""):
            lines.append(row(tpl))
        if not users:
            lines.append("(无)")
        lines.append("")

    lines.append("注：标 [spec-only: ...] 的是「只有规格、渲染未对接」，选它时必须明确告知用户，不许静默降级成自由构图。")
    return RC_OK, lines


# ───────────────────────── 自检（四条变异都要真红） ─────────────────────────


def _write(root, index, favorites=None):
    p = paths_for(root)
    os.makedirs(p["templates"], exist_ok=True)
    with io.open(p["index"], "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, indent=1)
    if favorites is not None:
        with io.open(p["favorites"], "w", encoding="utf-8") as fh:
            json.dump(favorites, fh, ensure_ascii=False, indent=1)


def _schema_contract(**over):
    contract = {
        "required_roles": ["category", "series"],
        "optional_roles": ["error"],
        "min_columns": 2,
        "min_rows": 1,
        "supported_extensions": [".csv", ".txt", ".xls", ".xlsx"],
    }
    contract.update(over)
    return contract


def _write_schema(root, contract=None):
    d = os.path.join(paths_for(root)["templates"], "system", "bar")
    os.makedirs(d, exist_ok=True)
    body = {"template_id": "bar"}
    body.update(contract if contract is not None else _schema_contract())
    with io.open(os.path.join(d, "schema.json"), "w", encoding="utf-8") as fh:
        json.dump(body, fh, ensure_ascii=False, indent=2)


def _tpl(**over):
    tpl = {
        "id": "bar",
        "kind": "system",
        "origin": "editaplot",
        "name_zh": "柱状图",
        "category": "general/statistics",
        "status": "implemented",
        "status_evidence": {"verified_at": "2026-11-04T00:00:00+08:00", "evidence": "evidence/bar.md"},
        "gap": None,
        "renderer": {"channel": ["origin_plot:column"]},
        "data_contract": _schema_contract(),
        "path": "system/bar",
    }
    tpl.update(over)
    return tpl


def _baseline(root):
    _write(root, {"schema_version": 1, "templates": [_tpl()]}, [{"id": "bar", "added_at": "2026-11-04"}])
    _write_schema(root)
    ev = os.path.join(paths_for(root)["templates"], "evidence")
    os.makedirs(ev, exist_ok=True)
    with io.open(os.path.join(ev, "bar.md"), "w", encoding="utf-8") as fh:
        fh.write("# bar 实测证据\norigin_plot(column) 跑通，导出 1800px PNG\n")


def selftest():
    failures = []
    checks = []

    def run_case(label, mutate, expect_kw, expect_rc):
        root = tempfile.mkdtemp(prefix="tplidx-")
        try:
            _baseline(root)
            mutate(root)
            rc, lines = check_index(root)
            text = "\n".join(lines)
            hit = (expect_kw in text) if expect_kw else True
            good = rc == expect_rc and (hit if expect_kw else True)
            checks.append((label, rc, expect_rc, expect_kw, hit, good))
            if not good:
                failures.append("%s: rc=%s(expect %s) kw=%r hit=%s" % (label, rc, expect_rc, expect_kw, hit))
        finally:
            shutil.rmtree(root, ignore_errors=True)

    # 基线：全过
    run_case("baseline pass", lambda root: None, None, RC_OK)

    # 变异 1：implemented 缺证据
    def m1(root):
        _write(root, {"schema_version": 1, "templates": [_tpl(status_evidence=None)]}, [{"id": "bar"}])
    run_case("M1 implemented 缺 evidence", m1, "missing evidence", RC_FAIL)

    # 变异 1b：证据文件不存在（写了路径但文件没有）
    def m1b(root):
        _write(root, {"schema_version": 1, "templates": [_tpl(status_evidence={"evidence": "evidence/nope.md"})]}, [])
    run_case("M1b evidence 文件不存在", m1b, "missing evidence", RC_FAIL)

    # 变异 2：spec-only 缺 gap
    def m2(root):
        _write(root, {"schema_version": 1, "templates": [_tpl(status="spec-only", gap=None, status_evidence=None)]}, [])
    run_case("M2 spec-only 缺 gap", m2, "missing gap", RC_FAIL)

    # 变异 3：通道名不在白名单
    def m3(root):
        _write(root, {"schema_version": 1, "templates": [_tpl(renderer={"channel": ["origin_plot:violin"]})]}, [])
    run_case("M3 未知通道 origin_plot:violin", m3, "unknown channel", RC_FAIL)

    # 变异 4：收藏悬空
    def m4(root):
        _write(root, {"schema_version": 1, "templates": [_tpl()]}, [{"id": "bar"}, {"id": "nope"}])
    run_case("M4 收藏指向不存在 id", m4, "dangling favorite", RC_FAIL)

    # 变异 5：system 模板路径不在 system/ 下
    def m5(root):
        _write(root, {"schema_version": 1, "templates": [_tpl(path="user/bar")]}, [])
    run_case("M5 system 模板 path 不在 system/", m5, "bad path", RC_FAIL)

    # 变异 6：status 写了非法值
    def m6(root):
        _write(root, {"schema_version": 1, "templates": [_tpl(status="done")]}, [])
    run_case("M6 非法 status", m6, "bad status", RC_FAIL)

    # 变异 7：页面写的 selection.json 收藏悬空（「删模板只清 selected」的后果）
    def m7():
        root = tempfile.mkdtemp(prefix="tplidx-sel-fav-")
        home = tempfile.mkdtemp(prefix="tplidx-home-")
        try:
            _baseline(root)
            env = {"DSH_HOME": home}
            sp = selection_path(env)
            os.makedirs(os.path.dirname(sp))
            with io.open(sp, "w", encoding="utf-8") as fh:
                json.dump({"selected": None, "favorites": ["bar", "ghost"]}, fh, ensure_ascii=False)
            rc, lines = check_index(root, env=env)
            text = "\n".join(lines)
            good = rc == RC_FAIL and "dangling favorite" in text and "ghost" in text
            checks.append(("M7 selection.json 收藏悬空", rc, RC_FAIL, "dangling favorite", "dangling favorite" in text, good))
            if not good:
                failures.append("M7: rc=%s text=%s" % (rc, text))

            # 用户模板不算悬空：favorites 里放一个真实存在的 user-templates/<id>/meta.json 必须 PASS
            ut = os.path.join(home, "dsh-plot-clone", "user-templates", "tpl-user001")
            os.makedirs(ut)
            with io.open(os.path.join(ut, "meta.json"), "w", encoding="utf-8") as fh:
                json.dump({"id": "tpl-user001"}, fh, ensure_ascii=False)
            with io.open(sp, "w", encoding="utf-8") as fh:
                json.dump({"selected": None, "favorites": ["bar", "tpl-user001"]}, fh, ensure_ascii=False)
            rc2, lines2 = check_index(root, env=env)
            good2 = rc2 == RC_OK and "selection=2" in "\n".join(lines2)
            checks.append(("M7b 用户模板收藏不误报", rc2, RC_OK, "selection=2", "selection=2" in "\n".join(lines2), good2))
            if not good2:
                failures.append("M7b: rc=%s text=%s" % (rc2, "\n".join(lines2)))
        finally:
            shutil.rmtree(root, ignore_errors=True)
            shutil.rmtree(home, ignore_errors=True)

    m7()

    # 变异 8：schema.json 与 index.json 的契约值不一致（改 schema 侧）
    def m8(root):
        _write_schema(root, _schema_contract(min_rows=2))
    run_case("M8 schema 与 index 契约不一致", m8, "bad contract", RC_FAIL)

    # 变异 9：index 镜像缺字段（删掉 min_rows）
    def m9(root):
        contract = _schema_contract()
        contract.pop("min_rows")
        _write(root, {"schema_version": 1, "templates": [_tpl(data_contract=contract)]})
    run_case("M9 index 镜像缺 min_rows", m9, "bad contract", RC_FAIL)

    # 变异 10：模板目录里没有 schema.json（契约无处可依）
    def m10(root):
        os.remove(os.path.join(paths_for(root)["templates"], "system", "bar", "schema.json"))
    run_case("M10 缺 schema.json", m10, "missing schema", RC_FAIL)

    # 选中查询（--selected）：三个分支必须各自说清，不许含糊
    def sel_case(label, selected, expect_kw, spec_only=False):
        root = tempfile.mkdtemp(prefix="tplidx-sel-")
        home = tempfile.mkdtemp(prefix="tplidx-home-")
        try:
            _baseline(root)
            tpl = _tpl(status="spec-only", gap="通道未对接", status_evidence=None) if spec_only else _tpl()
            _write(root, {"schema_version": 1, "templates": [tpl]}, [])
            env = {"USERPROFILE": home, "DSH_HOME": ""}
            p = selection_path(env)
            os.makedirs(os.path.dirname(p))
            with io.open(p, "w", encoding="utf-8") as fh:
                json.dump({"selected": selected, "favorites": []}, fh, ensure_ascii=False)
            rc, lines = selected_report(root, env)
            text = "\n".join(lines)
            good = rc == RC_OK and expect_kw in text
            checks.append((label, rc, RC_OK, expect_kw, expect_kw in text, good))
            if not good:
                failures.append("%s: rc=%s kw=%r text=%s" % (label, rc, expect_kw, text))
        finally:
            shutil.rmtree(root, ignore_errors=True)
            shutil.rmtree(home, ignore_errors=True)

    sel_case("S1 选中 implemented", "bar", "按用户选择做")
    sel_case("S2 选中 spec-only", "bar", "只有规格、渲染未对接", spec_only=True)
    sel_case("S3 选中过期 id", "ghost", "过期选择")

    print("templates_index selftest")
    for label, rc, expect_rc, kw, hit, good in checks:
        print("  %-34s rc=%d (expect %d) kw=%r hit=%s -> %s"
              % (label, rc, expect_rc, kw, hit, "ok" if good else "FAIL"))

    if failures:
        print("\nSELFTEST FAIL:")
        for f in failures:
            print("  " + f)
        return 1
    print("\nselftest ok: %d/%d（1 条基线 + 11 条变异 + 3 条 --selected 分支，全部按预期 rc 与关键词判定）" % (len(checks), len(checks)))
    return 0


# ───────────────────────── 选中的模板（插件页面写的偏好） ─────────────────────────


def selection_path(env=None):
    """与插件 `lib/templates.js:selectionPath` 同口径：<DSH_HOME 或 %USERPROFILE%\\.dsh>\\dsh-plot-clone\\selection.json"""
    env = env if env is not None else os.environ
    home = env.get("DSH_HOME") or os.path.join(env.get("USERPROFILE") or os.path.expanduser("~"), ".dsh")
    return os.path.join(home, "dsh-plot-clone", "selection.json")


def user_template_ids(env=None):
    """用户模板 id：<state>/dsh-plot-clone/user-templates/<id>/meta.json（与 lib/user_templates.js 同口径）。"""
    env = env if env is not None else os.environ
    home = env.get("DSH_HOME") or os.path.join(env.get("USERPROFILE") or os.path.expanduser("~"), ".dsh")
    base = os.path.join(home, "dsh-plot-clone", "user-templates")
    try:
        names = os.listdir(base)
    except OSError:
        return set()
    return {n for n in names if os.path.isfile(os.path.join(base, n, "meta.json"))}


def read_selection(env=None):
    path = selection_path(env)
    try:
        raw = load_json(path)
    except (IOError, OSError, ValueError):
        return {"selected": None, "favorites": [], "path": path, "exists": False}
    if not isinstance(raw, dict):
        return {"selected": None, "favorites": [], "path": path, "exists": True}
    sel = raw.get("selected")
    fav = raw.get("favorites")
    return {
        "selected": sel if isinstance(sel, str) else None,
        "favorites": [x for x in fav if isinstance(x, str)] if isinstance(fav, list) else [],
        "path": path,
        "exists": True,
    }


def selected_report(root, env=None):
    """--selected：只说「用户选了谁、这条能不能用」，不做自动匹配。

    选中只是偏好：这里绝不因为 selected 而对数据做判断，只把事实交给流程。
    返回 (rc, lines)；rc 恒为 0（这是查询，不是校验）。
    """
    sel = read_selection(env)
    lines = []
    if not sel["exists"]:
        lines.append("SELECTED none（没有 selection.json：%s）→ 走自动匹配" % sel["path"])
        return RC_OK, lines

    sid = sel["selected"]
    if not sid:
        lines.append("SELECTED none（用户没点「用这个」）→ 走自动匹配")
        if sel["favorites"]:
            lines.append("FAVORITES %s" % ", ".join(sel["favorites"]))
        return RC_OK, lines

    try:
        index = load_json(paths_for(root)["index"])
    except (IOError, OSError, ValueError):
        lines.append("SELECTED %s（索引读不到，无法判定这条模板是否可用）" % sid)
        return RC_OK, lines

    by_id = {t.get("id"): t for t in index.get("templates", []) if isinstance(t, dict)}
    t = by_id.get(sid)
    if t is None:
        lines.append("SELECTED %s（索引里没有这个 id → 过期选择，走自动匹配并告知用户）" % sid)
        return RC_OK, lines

    status = t.get("status")
    thumb = os.path.join(paths_for(root)["templates"], "evidence", sid + ".png")
    thumb_txt = "templates/evidence/%s.png" % sid if os.path.exists(thumb) else "null（无实拍）"
    lines.append("SELECTED %s  %s  [%s]  thumb=%s" % (sid, t.get("name_zh") or sid, status, thumb_txt))
    if status == "implemented":
        ch = (t.get("renderer") or {}).get("channel") or []
        lines.append("  → 按用户选择做：channel=%s；读同目录 data_contract.md / visual_contract.md 当默认值" % (", ".join(ch) or "?"))
    else:
        lines.append("  → 只有规格、渲染未对接（gap: %s）；必须原话说明，不许静默降级" % (t.get("gap") or "未写"))
    if sel["favorites"]:
        lines.append("FAVORITES %s" % ", ".join(sel["favorites"]))
    return RC_OK, lines


# ───────────────────────── CLI ─────────────────────────


def main(argv=None):
    ap = argparse.ArgumentParser(description="模板索引机器闸门（--check / --list / --selftest）")
    ap.add_argument("--check", action="store_true", help="校验 index.json（5 条断言）")
    ap.add_argument("--list", action="store_true", help="列出三类模板")
    ap.add_argument("--selected", action="store_true", help="只读：用户选中的模板（插件页面写的偏好）")
    ap.add_argument("--selftest", action="store_true", help="自检（变异必须真红）")
    ap.add_argument("--group", default="all", choices=GROUPS, help="--list 的分组")
    ap.add_argument("--status", default=None, choices=STATUSES, help="--list 只列某档 status")
    ap.add_argument("--root", default=None, help="仓库根目录（默认脚本所在目录）")
    args = ap.parse_args(argv)

    root = args.root or os.path.dirname(os.path.abspath(__file__))

    if args.selftest:
        return selftest()
    if args.check:
        rc, lines = check_index(root, env=os.environ)
        print("\n".join(lines))
        return rc
    if args.selected:
        rc, lines = selected_report(root)
        print("\n".join(lines))
        return rc
    if args.list:
        rc, lines = list_templates(root, group=args.group, status=args.status)
        print("\n".join(lines))
        return rc

    ap.print_help()
    return RC_USAGE


if __name__ == "__main__":
    sys.exit(main())
