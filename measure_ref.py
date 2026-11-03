"""measure_ref.py — 参考图量测：几何比例 + 取色（复刻第一步，别靠眼睛估）。

用法：
  python measure_ref.py <ref.png>                       # 画布/外框/主色板
  python measure_ref.py <ref.png> --dark 130             # 改暗色阈值（框线更浅时用）
  python measure_ref.py <ref.png> --box name:x0,y0,x1,y1 [...]
  python measure_ref.py <ref.png> --emit-card            # 打印可贴进 SKILL.md 第 1 步的 Markdown 规格卡草稿
  python measure_ref.py --selftest                      # 自检
  python -c "print(1)"                                  # 先确认解释器可用（WindowsApps 的 python 存根静默退出码 49）

设计约束：
- 只读参考图像素，不反推数据（值域红线在 SKILL.md）。
- 颜色报「桶内真实平均色」+ 计数 + 占比，与 extract_palette.py 同一份实现（pixel_core.palette）。
- 坐标一律全图坐标：不做「裁剪再回加偏移」，旧版忘了 +2 导致整体偏 2px 的坑从结构上消失。
- 量不到就说 none，不返回残缺读数。
"""
import os
import re
import sys

import numpy as np

import pixel_core as pc
from pixel_core import setup_stdout

BUCKET = pc.BUCKET


def frame_bbox(a, thr=pc.DARK):
    """单面板外框（全图坐标）。多于一个候选时返回 None——多面板请用 frame_panels。"""
    return pc.frame_rect(a, thr=thr)


def frame_panels(a, thr=pc.DARK):
    """全部面板候选（多面板/组图逐面板量测用）。"""
    return pc.frame_candidates(a, thr=thr)


def dominant(a, n=12, min_sat=0, skip_near_white=True):
    """主色板（与 extract_palette 同一实现）：[{hex,count,frac}]。"""
    colors, _ = pc.palette(a, n=n, skip_white=skip_near_white, skip_black=True)
    if min_sat:
        colors = [c for c in colors if int(pc.rgb(c["hex"]).max() - pc.rgb(c["hex"]).min()) >= min_sat]
    return colors


def box_stat(a, x0, y0, x1, y1, n=4):
    return dominant(a[y0:y1, x0:x1], n=n)


def band_proportions(a, color="#FCE4EA", tol=10):
    """装饰带占画幅比例：整行 ≥90% 命中才算带，取**最长连续段**。

    旧实现只探一列（默认 25% 宽），带外同色图例块落在那列就会把带高从 16px 报成 156px。
    「90%」以该色自身最长的整行游程为基准（不是画幅宽）：装饰带通常不顶满画幅两侧留白。
    """
    c = pc.rgb(color)
    h, _, _ = a.shape
    hit = (np.abs(a - c).max(2) <= tol)
    widths = []
    for y in range(h):
        widths.append(max((e - s + 1 for (s, e) in pc._runs(hit[y])), default=0))
    best = max(widths, default=0)
    if best < 2:
        return None
    rows = np.array([1 if w >= 0.9 * best else 0 for w in widths], dtype=bool)
    runs = [z for z in pc._runs(rows) if z[1] - z[0] + 1 >= 2]
    if not runs:
        return None
    s, e = max(runs, key=lambda z: z[1] - z[0])
    return {"rows": [int(s), int(e)], "height_px": int(e - s + 1),
            "pct_of_canvas": round(100.0 * (e - s + 1) / h, 2), "kind": "solid"}


def report(path, boxes=None, dark=pc.DARK):
    a = pc.load(path)
    h, w, _ = a.shape
    print("size:", (w, h), "| dark <", dark)
    panels = frame_panels(a, thr=dark)
    print("panels:", len(panels))
    if not panels:
        print("frame: none (no rectangle closed by long dark lines; try --dark %d)" % (dark + 20))
    else:
        for i, z in enumerate(panels):
            t, b, l, r = z["t"], z["b"], z["l"], z["r"]
            tag = "" if len(panels) == 1 else " #%d" % (i + 1)
            print("frame%s: rows %d..%d cols %d..%d (w=%d h=%d)"
                  % (tag, t, b, l, r, r - l + 1, b - t + 1))
            print("plot pct%s: top %.1f%% height %.1f%% left %.1f%% width %.1f%%"
                  % (tag, 100.0 * t / h, 100.0 * (b - t + 1) / h,
                     100.0 * l / w, 100.0 * (r - l + 1) / w))
    print("palette (hex count share):")
    for c in dominant(a):
        print("  ", c["hex"], c["count"], "%.2f%%" % (c["frac"] * 100))
    for spec in boxes or []:
        name, coords = spec.split(":")
        x0, y0, x1, y1 = (int(v) for v in coords.split(","))
        print("box %-12s" % name, " ".join("%s(%d)" % (c["hex"], c["count"]) for c in box_stat(a, x0, y0, x1, y1)))


def emit_card(path, dark=pc.DARK):
    """Markdown 规格卡草稿（可直接贴进 SKILL.md 第 1 步那张表）。

    只写像素能证明的字段；family/x/y/series/fonts/stats 这类量不到的一律 unknown，
    不猜。refs 绑参考图 sha256 + 尺寸 + 字节数（换图必须重写卡）。
    """
    a = pc.load(path)
    h, w, _ = a.shape
    size_bytes = os.path.getsize(path)
    sha = pc.sha256_file(path)
    ratio = w / float(h)
    orient = "横版" if ratio > 1.05 else ("竖版" if ratio < 0.95 else "方形")
    panels = frame_panels(a, thr=dark)
    rows = [("canvas", "%s %d×%d px（宽高比 %.2f）" % (orient, w, h, ratio), "像素 + 文件属性"),
            ("panels", "%d 个面板候选（排布 / 是否共享轴 unknown）" % len(panels), "像素量测")]
    if len(panels) == 1:
        t, b, l, r = panels[0]["t"], panels[0]["b"], panels[0]["l"], panels[0]["r"]
        left, top = 100.0 * l / w, 100.0 * t / h
        width, height = 100.0 * (r - l + 1) / w, 100.0 * (b - t + 1) / h
        right, bottom = 100.0 - left - width, 100.0 - top - height
        rows.append(("geometry",
                     "外框 left %.1f%% top %.1f%% w %.1f%% h %.1f%%；"
                     "图层四周留白 左 %.1f%% 上 %.1f%% 右 %.1f%% 下 %.1f%%"
                     % (left, top, width, height, left, top, right, bottom),
                     "measure_ref.py 像素量测"))
        bd = pc.band(a, t, b, l, r, None)
        if bd:
            deco = "装饰带高/绘图高 %.2f%%（%d px，kind=%s）" % (
                bd["pct_plot_h"], bd["height_px"], bd["kind"])
            if bd["kind"] == "gradient":
                deco += "；渐变带数值偏小 → 台账记 rejected（第 1.5 步）"
            rows.append(("deco", deco, "measure_ref.py 带高占比"))
        else:
            rows.append(("deco", "unknown", "未检出装饰带（可能本来没有；要确认先 --band-hex）"))
    elif len(panels) > 1:
        rows.append(("geometry", "unknown（多面板 %d 个；逐面板用 figure_metrics.py --json 的 panels[]）"
                     % len(panels), "像素量测"))
        rows.append(("deco", "unknown", "多面板需逐面板量，本卡不拆分"))
    else:
        rows.append(("geometry", "unknown", "no_frame：未检出外框，先试 --dark 或核对图"))
        rows.append(("deco", "unknown", "no_frame：无绘图区，带高不可比"))
    for field, how in (("family", "目测"), ("x, y", "目测"), ("y2", "目测"),
                       ("series", "measure_ref.py `box` + 目测"),
                       ("fill", "放大看是否渐变 + `box` 取顶部/底部色"),
                       ("yerr", "目测"), ("legend", "目测"),
                       ("refs_lines", "目测 + origin_layout_info 坐标"),
                       ("fonts", "`box` 取文字色 + 目测字形"),
                       ("pub_target", "用户说；没说 → unknown，按 170 mm 画并注明"),
                       ("pub_limits", "期刊 Guide for Authors；未见 → 用默认档并注明"),
                       ("stats", "用户给；没说 → unknown，**不许自造**")):
        rows.append((field, "unknown", how))
    rows.append(("refs", "sha256:%s | %d×%d px | %d bytes" % (sha, w, h, size_bytes),
                 "绑参考图哈希（换图必须重写卡）"))
    out = ["| 字段 | 取值 | 怎么读 |", "|---|---|---|"]
    out += ["| %s | %s | %s |" % (k, v, how) for k, v, how in rows]
    return "\n".join(out)


def main(argv):
    is_box = re.compile(r"^\w+:\d+,\d+,\d+,\d+$")
    dark = pc.DARK
    if "--dark" in argv:
        dark = int(argv[argv.index("--dark") + 1])
    emit = "--emit-card" in argv
    args = [x for x in argv if not x.startswith("--") and not is_box.match(x) and not x.isdigit()]
    boxes = [x for x in argv if is_box.match(x)]
    if not args:
        print(__doc__)
        return 2
    if emit:
        print(emit_card(args[0], dark))
        return 0
    report(args[0], boxes, dark)
    return 0


def selftest():
    """契约自检：全图坐标无偏移 / 整行扫描不被旁路色块带偏 / 取色口径一致 / 无框显式 none / 规格卡草稿。"""
    # 1) 100x100：外框贴边内缩 5px，真值 (5,94,5,94)
    a = np.full((100, 100, 3), 255, dtype=np.uint8)
    a[5, 5:95] = a[94, 5:95] = 0
    a[5:95, 5] = a[94 - 0, 5:95] = 0
    a[5:95, 94] = 0
    arr = a.astype(int)
    bb = frame_bbox(arr)
    assert bb == (5, 94, 5, 94), bb

    # 2) 10 行粉带 = 10%，外加一块同色图例方块落在 25% 列上（旧版单列探头会报成 25%）
    a2 = np.full((100, 100, 3), 255, dtype=np.uint8)
    a2[40:50, :] = (252, 228, 234)
    a2[10:35, 20:30] = (252, 228, 234)
    bp = band_proportions(a2.astype(int), "#FCE4EA")
    assert bp and bp["height_px"] == 10, bp
    assert abs(bp["pct_of_canvas"] - 10.0) < 0.01, bp

    # 3) 取色：桶内平均色 + 占比，与 extract_palette 同口径（桶宽 16、剔黑白）
    top = dominant(a2.astype(int), n=1)
    assert top[0]["hex"] == "#FCE4EA" and 0.12 < top[0]["frac"] < 0.13, top

    # 4) 无框：显式 None（不是 0 也不是残缺读数）
    assert frame_bbox(np.full((50, 50, 3), 255, dtype=int)) is None

    # 5) --emit-card：能量到的填数值、量不到的是 unknown、refs 绑 sha256/尺寸/字节数
    import contextlib
    import hashlib
    import io
    import tempfile

    from PIL import Image, ImageDraw

    d = os.path.join(tempfile.gettempdir(), "_measure_ref_card")
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, "card.png")
    im = Image.new("RGB", (200, 100), "white")
    dr = ImageDraw.Draw(im)
    dr.rectangle([40, 20, 160, 80], outline=(0, 0, 0), width=2)
    dr.rectangle([42, 60, 158, 69], fill=(252, 228, 234))      # 10px 带 / 绘图高 61px
    im.save(p)
    card = emit_card(p)
    with open(p, "rb") as fh:
        sha = hashlib.sha256(fh.read()).hexdigest()
    assert "横版 200×100 px" in card, card
    assert "图层四周留白 左 20.0% 上 20.0% 右 19.5% 下 19.0%" in card, card
    assert "装饰带高/绘图高 16.39%" in card, card
    assert ("sha256:" + sha) in card and "%d bytes" % os.path.getsize(p) in card, card
    for field in ("family", "series", "fonts", "stats", "pub_target"):
        assert "| %s | unknown |" % field in card, (field, card)

    def run(*argv):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = main(list(argv))
        return rc, buf.getvalue()

    rc, out = run(p, "--emit-card")
    assert rc == 0 and out.startswith("| 字段 |"), out[:120]
    rc, out = run(p)                                # 不带 --emit-card：仍是原 report
    assert rc == 0 and out.startswith("size:"), out[:120]

    print("selftest ok: frame", bb, "| band", bp, "| palette", top)
    print("selftest card: sha256 %s... | 留白 左 20.0%% 下 19.0%% | deco 16.39%%" % sha[:12])


if __name__ == "__main__":
    setup_stdout()
    if len(sys.argv) > 1 and sys.argv[1] == "--selftest":
        selftest()
        sys.exit(0)
    sys.exit(main(sys.argv[1:]))
