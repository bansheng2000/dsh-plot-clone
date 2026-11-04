#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""sync_skills.py — 把仓库里的技能文件同步到 ~/.agents/skills/dsh-plot-clone

为什么要有脚本而不是手工挑：`templates/` 有 200+ 个文件，手工挑必然漏。
排除规则写在这里，改规则改一处。

**排除**（只留在仓库、不进技能副本）：
  · `templates/evidence/**/*.png`  —— 全是 Origin demo 水印图，只作通道连通证明。
    技能目录是最容易被误当成品示例的地方，所以图不进副本；每份 evidence md 里
    已经写了 PNG 的尺寸与字节数，要核对回仓库找原图。
  · `templates/evidence/probes/**` —— 5 张探针失败现场图，同上。

用法：
    python sync_skills.py              # 同步并逐文件核 md5
    python sync_skills.py --check      # 只核对，不写
"""

from __future__ import annotations

import argparse
import hashlib
import io
import os
import shutil
import sys

REPO = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.expandvars(r"%USERPROFILE%\.agents\skills\dsh-plot-clone")

# 仓库根下的技能文件（sync_skills.py 自己不进副本：它是仓库工具，不是技能内容）
FILES = [
    "README.md",
    "SKILL.md",
    "figure_metrics.py",
    "measure_ref.py",
    "extract_palette.py",
    "pixel_core.py",
    "test_synth.py",
    "verify_deliverable.py",
    "templates_index.py",
]

# 整棵子树同步，但排除这些
TREES = ["templates"]

EXCLUDE_DIRS = [
    "templates/evidence/probes",
]
EXCLUDE_SUFFIXES = [
    "templates/evidence",   # 只排这个目录下的 .png（.md 要留）
]

SKIP_EXT = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".pdf", ".opju"}


def rel_norm(p):
    return p.replace("\\", "/")


def excluded(rel):
    r = rel_norm(rel)
    for d in EXCLUDE_DIRS:
        if r == d or r.startswith(d + "/"):
            return True
    base, ext = os.path.splitext(r)
    if ext.lower() in SKIP_EXT:
        return True
    return False


def collect():
    """返回 [(相对路径, 绝对源路径)]。"""
    out = []
    for f in FILES:
        src = os.path.join(REPO, f)
        if os.path.isfile(src):
            out.append((f, src))
    for tree in TREES:
        root = os.path.join(REPO, tree)
        if not os.path.isdir(root):
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if not excluded(rel_norm(os.path.join(dirpath, d)) + "/")]
            for fn in filenames:
                full = os.path.join(dirpath, fn)
                rel = rel_norm(os.path.relpath(full, REPO))
                if excluded(rel):
                    continue
                out.append((rel, full))
    return sorted(out)


def md5(path):
    h = hashlib.md5()
    with io.open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main(argv=None):
    ap = argparse.ArgumentParser(description="同步技能文件到 ~/.agents/skills（带排除规则）")
    ap.add_argument("--check", action="store_true", help="只核对，不写")
    args = ap.parse_args(argv)

    items = collect()
    print("== sync %d files -> %s%s" % (len(items), DEST, "  [check only]" if args.check else ""))

    if not args.check:
        os.makedirs(DEST, exist_ok=True)
        # 先删掉副本里所有不该在的图片（包括历史遗留）
        for dirpath, _dirnames, filenames in os.walk(DEST):
            for fn in filenames:
                if os.path.splitext(fn)[1].lower() in SKIP_EXT:
                    os.remove(os.path.join(dirpath, fn))
        for rel, src in items:
            dst = os.path.join(DEST, rel.replace("/", os.sep))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copyfile(src, dst)

    ok = diff = missing = 0
    for rel, src in items:
        dst = os.path.join(DEST, rel.replace("/", os.sep))
        if not os.path.isfile(dst):
            missing += 1
            print("  MISSING %s" % rel)
            continue
        if md5(src) == md5(dst):
            ok += 1
        else:
            diff += 1
            print("  DIFF    %s" % rel)

    # 副本里多出来的文件（非图片）也要报出来
    extra = []
    for dirpath, _dirnames, filenames in os.walk(DEST):
        for fn in filenames:
            full = os.path.join(dirpath, fn)
            rel = rel_norm(os.path.relpath(full, DEST))
            if rel not in {r for r, _ in items}:
                extra.append(rel)
    for e in sorted(extra):
        print("  EXTRA   %s" % e)

    print("   OK=%d DIFF=%d MISSING=%d EXTRA=%d" % (ok, diff, missing, len(extra)))
    all_ok = diff == 0 and missing == 0 and not extra
    print("   ALL_MATCH %s" % all_ok)
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
