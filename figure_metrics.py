"""figure_metrics.py — 参考图/成品图的量化对照（复刻收敛用）。

只读像素，输出可比的归一化几何量与色值：
  frame(外框) canvas%、装饰带高度%（纯色/渐变）、白缝%、刻度长度、文字行与字高、
点径、关键色、面板数。

用法：
  python figure_metrics.py <img.png> [--json]
  python figure_metrics.py <img.png> [--band-hex "#RRGGBB"] [--dot-hex "#RRGGBB"] [--dark 130]
  python figure_metrics.py ref.png ours.png        # 并排对照
  python figure_metrics.py --selftest              # 契约自检（缺测/状态/JSON）
  python test_synth.py                             # 合成真值自检（几何精度）
  python -c "print(1)"                             # 先确认解释器能用：WindowsApps 的 python 存根会静默退出码 49

约定（状态与退出码）：
  测不到的项一律写成 null + 同名字段加 _reason 后缀，字段永不省略
  （值 = null 表示没测到，reason 说明为什么；省略字段会让调用方分不清「没有」和「没测」）。
  status: ok      = 外框 + 装饰带 + 点径 都测到
          partial = 外框测到，但装饰带或点径没测到（图里可能本来就没有该图元），或是多面板
          none    = 外框没测到，其余读数不可比
  rc:     0 = ok, 3 = partial, 4 = none, 2 = 用法错误。

量测精度（合成真值图上实测，见 test_synth.py）：frame/band/tick ±1px，点径 ±1px(d<=10) / ±2px(d=20)，
渐变带高度 ±2px；真实截图有抗锯齿与缩放，误差会更大。
"""
import contextlib
import io
import json
import os
import re
import sys

import pixel_core as pc
from pixel_core import setup_stdout

RC_OK, RC_PARTIAL, RC_NONE, RC_USAGE = 0, 3, 4, 2
HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")

NO_FRAME = ("no_frame: no rectangle closed by long dark(<%d) horizontal+vertical runs; "
            "a figure without any axis line, or a screenshot whose frame is lighter than the threshold, lands here")
NO_BAND = ("hex_not_found: no row in the x 15-30%% window matches %s (tol 12) and no uniform block was found; "
           "wrong --band-hex, or no band at all")
NO_DOT = ("no_dots: no run of %s (tol 26) inside the plot area; "
          "wrong --dot-hex, or no markers in this figure")
EMPTY_PAL = ("empty_palette: every pixel is near-white(>235) or near-black(<60); "
             "blank image, tiny image, or flat single tone")
DEP = "depends_on_frame: frame not measured, see frame_pct_reason"
MULTI = ("multi_panel: %d panels detected - flat fields would mix them up; "
         "read panels[] (or crop one panel and measure it separately)")
PRECISION = "PRECISION: synthetic-truth +/-1px (frame/band/tick), +/-1..2px (dot); real screenshots worse"

# 兼容旧调用名
load = pc.load
band = pc.band
tick_length = pc.tick_length
dot_diameter = pc.dot_diameter
text_groups_below = pc.text_groups_below


def miss(m, key, reason):
    """缺测落账：值 = None + <key>_reason，并记进 unmeasured 清单。字段永不省略。"""
    m[key] = None
    m[key + "_reason"] = reason
    if "unmeasured" in m and key not in m["unmeasured"]:
        m["unmeasured"].append(key)


def _measure_panel(a, rect, W, H, band_hex, dot_hex, pal, dark):
    """测单个面板。返回 (字段 dict, {缺测项: 原因})。"""
    t, b, l, r = rect["t"], rect["b"], rect["l"], rect["r"]
    pw, ph = r - l + 1, b - t + 1
    d = {"frame_pct": {"left": round(100 * l / W, 1), "top": round(100 * t / H, 1),
                       "width": round(100 * pw / W, 1), "height": round(100 * ph / H, 1)},
         "plot_px": [pw, ph],
         "band_hex_used": band_hex, "band_hex_source": "cli" if band_hex else None,
         "dot_hex_used": dot_hex, "dot_hex_source": "cli" if dot_hex else None}
    bad = {}

    hb, src = band_hex, ("cli" if band_hex else None)
    bd = pc.band(a, t, b, l, r, hb) if hb else None
    if bd is None and not hb:
        for h in [c["hex"] for c in pal[:6]]:
            bd = pc.band(a, t, b, l, r, h)
            if bd:
                hb, src = h, "palette_guess"
                break
    if bd is None and not hb:
        bd = pc.band(a, t, b, l, r, None)          # 兜底：任意均匀色块/渐变带
        if bd:
            hb, src = bd["top_hex"], "block_fallback"
    d["band_hex_used"], d["band_hex_source"] = hb, src
    if bd:
        d["band"] = {"height_px": bd["height_px"], "pct_plot_h": bd["pct_plot_h"],
                     "from_bottom_pct": round(100 * (b - bd["bot"]) / ph, 1), "kind": bd["kind"]}
        d["gap"] = pc.white_gap(a, t, b, l, r, bd["top"])
    else:
        d["band"], d["gap"] = None, None
        bad["band"] = NO_BAND % (band_hex or "<no palette candidate>")
        bad["gap"] = "no_band: the white gap sits above the band, nothing to measure"

    tk = pc.tick_scan(a, b, l, r)
    d["tick_px"] = tk["length"] if tk else None
    if tk is None:
        bad["tick_px"] = "no_ticks: no dark run starts at the frame edge (outward or inward)"
    d["text_below"] = pc.text_groups_below(a, b, l, r, tick_len=tk["length"] if tk else 0,
                                           tick_cols=tk["cols"] if tk else None)

    hd, dsrc = dot_hex, ("cli" if dot_hex else None)
    dd = pc.dot_diameter(a, t, b, l, r, hd) if hd else None
    if dd is None and not hd:
        cands = sorted([c["hex"] for c in pal[:6] if c["hex"] != hb],
                       key=lambda h: int(pc.rgb(h).max() - pc.rgb(h).min()), reverse=True)
        for h in cands:
            dd = pc.dot_diameter(a, t, b, l, r, h)
            if dd:
                hd, dsrc = h, "palette_guess"
                break
    d["dot_hex_used"], d["dot_hex_source"] = hd, dsrc
    d["dot_px"] = dd
    if dd is None:
        bad["dot_px"] = NO_DOT % (dot_hex or hd or "<no palette candidate>")
    return d, bad


def metrics(path, band_hex=None, dot_hex=None, dark=pc.DARK):
    a = pc.load(path)
    H, W, _ = a.shape
    m = {"file": os.path.basename(path), "size": [W, H], "aspect": round(W / H, 3),
         "dark_threshold": dark, "panel_count": 0, "unmeasured": [],
         "band_hex_used": band_hex, "band_hex_source": "cli" if band_hex else None,
         "dot_hex_used": dot_hex, "dot_hex_source": "cli" if dot_hex else None}
    pal, _ = pc.palette(a, 6)
    m["palette"] = pal
    if not pal:
        m["palette_reason"] = EMPTY_PAL

    cands = pc.frame_candidates(a, thr=dark)
    m["panel_count"] = len(cands)
    deps = ("plot_px", "band", "gap", "tick_px", "text_below", "dot_px")

    if not cands:
        miss(m, "frame_pct", NO_FRAME % dark)
        for k in deps:
            miss(m, k, DEP)
        m["status"] = "none"
        return m

    if len(cands) > 1:
        m["panels"] = []
        for rc in cands:
            d, bad = _measure_panel(a, rc, W, H, band_hex, dot_hex, pal, dark)
            for k, why in bad.items():
                d[k + "_reason"] = why
            m["panels"].append(d)
        miss(m, "frame_pct", MULTI % len(cands))
        for k in deps:
            miss(m, k, MULTI % len(cands))
        m["status"] = "partial"
        return m

    d, bad = _measure_panel(a, cands[0], W, H, band_hex, dot_hex, pal, dark)
    for k in ("frame_pct",) + deps:
        m[k] = d[k]
    m["band_hex_used"], m["band_hex_source"] = d["band_hex_used"], d["band_hex_source"]
    m["dot_hex_used"], m["dot_hex_source"] = d["dot_hex_used"], d["dot_hex_source"]
    for k, why in bad.items():
        miss(m, k, why)
    m["status"] = "ok" if (d["band"] is not None and d["dot_px"] is not None) else "partial"
    return m


def worst(ms):
    order = ["ok", "partial", "none"]
    return max((x["status"] for x in ms), key=order.index) if ms else "none"


def _fmt(v):
    return "-" if v is None else "%s" % v


def show(m):
    print("==", m["file"], m.get("size"), "aspect", m.get("aspect"),
          "| panels", m.get("panel_count"), "| dark <", m.get("dark_threshold"))
    f = m.get("frame_pct")
    if f:
        print("   FRAME left %.1f%% top %.1f%% w %.1f%% h %.1f%%  (plot %s px)"
              % (f["left"], f["top"], f["width"], f["height"], m["plot_px"]))
    else:
        print("   FRAME unmeasured(%s)" % m.get("frame_pct_reason"))
    if m.get("panels"):
        for i, p in enumerate(m["panels"]):
            pf = p["frame_pct"]
            print("   PANEL%d frame left %.1f%% top %.1f%% w %.1f%% h %.1f%% | band %s px | tick %s px"
                  % (i + 1, pf["left"], pf["top"], pf["width"], pf["height"],
                     _fmt((p.get("band") or {}).get("height_px")), _fmt(p.get("tick_px"))))
    bd = m.get("band")
    if bd:
        print("   BAND h %dpx = %.1f%% plot_h, from_bottom %.1f%%, kind %s | hex %s (%s)"
              % (bd["height_px"], bd["pct_plot_h"], bd["from_bottom_pct"], bd["kind"],
                 m["band_hex_used"], m["band_hex_source"]))
        g = m.get("gap")
        if g is None:
            print("   GAP  unmeasured(%s)" % m.get("gap_reason"))
        else:
            print("   GAP  %s px (%s%%)" % (g[0], g[1]))
    elif not m.get("panels"):
        print("   BAND unmeasured(%s)" % m.get("band_reason"))
    if m.get("dot_px") is None:
        print("   DOT  unmeasured(%s)" % m.get("dot_px_reason"))
    else:
        print("   DOT  %s px | hex %s (%s)" % (m["dot_px"], m["dot_hex_used"], m["dot_hex_source"]))
    tk = m.get("tick_px")
    print("   TICK", "%s px" % tk if tk is not None else "unmeasured(%s)" % m.get("tick_px_reason"))
    tb = m.get("text_below")
    if tb is None:
        print("   TEXT unmeasured(%s)" % m.get("text_below_reason"))
    else:
        print("   TEXT", [(g["top"], g["bot"], g["height_px"], g["kind"]) for g in tb] or "no rows")
    print("   PALETTE:", " ".join(c["hex"] + "(%.2f%%)" % (c["frac"] * 100) for c in (m.get("palette") or []))
          or "empty(%s)" % m.get("palette_reason"))
    print("   STATUS:", m["status"], "| unmeasured:", ", ".join(m["unmeasured"]) or "-")
    print("  ", PRECISION)


def parse_args(argv):
    files, opts, i = [], {}, 0
    while i < len(argv):
        a = argv[i]
        if a in ("--band-hex", "--dot-hex"):
            if i + 1 >= len(argv):
                return None, "%s needs a value like \"#FCE4EA\"" % a
            if not HEX_RE.match(argv[i + 1]):
                return None, "%s got %r, want #RRGGBB" % (a, argv[i + 1])
            opts[a] = argv[i + 1].upper()
            i += 2
        elif a == "--dark":
            if i + 1 >= len(argv) or not argv[i + 1].isdigit():
                return None, "--dark needs an integer 0-255"
            opts[a] = int(argv[i + 1])
            i += 2
        elif a == "--json":
            opts[a] = True
            i += 1
        elif a.startswith("--"):
            return None, "unknown option %s" % a
        else:
            files.append(a)
            i += 1
    return files, opts


def main(argv):
    files, opts = parse_args(argv[1:])
    if files is None:
        print("ERROR:", opts, file=sys.stderr)
        return RC_USAGE
    if not files:
        print(__doc__)
        return RC_USAGE
    ms = [metrics(p, opts.get("--band-hex"), opts.get("--dot-hex"), opts.get("--dark", pc.DARK))
          for p in files]
    st = worst(ms)
    if opts.get("--json"):
        print(json.dumps({"status": st, "files": ms}, ensure_ascii=False, indent=2))
    else:
        for m in ms:
            show(m)
        if len(ms) > 1:
            print("== overall STATUS:", st)
    return {"ok": RC_OK, "partial": RC_PARTIAL, "none": RC_NONE}[st]


def selftest():
    """契约自检：缺测显式化 / 状态与 rc / --json 形状 / 色值参数化 / 半宽与多面板。"""
    import tempfile
    from PIL import Image, ImageDraw

    d = os.path.join(tempfile.gettempdir(), "_figmetrics_selftest")
    os.makedirs(d, exist_ok=True)

    def fig(name, frame=True, band=True, dots=True, half=False, second=False):
        im = Image.new("RGB", (400, 300), "white")
        dr = ImageDraw.Draw(im)
        boxes = [(40, 30, 360, 240)] if not second else [(30, 30, 190, 240), (210, 30, 370, 240)]
        if half:
            boxes = [(40, 30, 180, 240)]
        for (x0, y0, x1, y1) in boxes:
            if frame:
                dr.rectangle([x0, y0, x1, y1], outline=(0, 0, 0), width=2)
            if band:
                dr.rectangle([x0 + 2, y1 - 40, x1 - 2, y1 - 26], fill=(252, 228, 234))
            if dots:
                for x in range(x0 + 20, x1 - 10, 30):
                    dr.ellipse([x, y0 + 90, x + 4, y0 + 94], fill=(222, 144, 186))
            for x in range(x0 + 10, x1 - 6, 25):          # 8px 外刻度
                dr.rectangle([x, y1 + 1, x + 1, y1 + 8], fill=(0, 0, 0))
        p = os.path.join(d, name)
        im.save(p)
        return p

    full = fig("full.png")
    half_gray = fig("half_gray.png", frame=True, half=True)
    noframe = os.path.join(d, "noframe.png")
    im = Image.new("RGB", (400, 300), "white")
    dr = ImageDraw.Draw(im)
    for x in range(60, 340, 40):
        dr.ellipse([x, 150, x + 6, 156], fill=(222, 144, 186))
    im.save(noframe)
    blank = os.path.join(d, "blank.png")
    Image.new("RGB", (400, 300), "white").save(blank)
    two = fig("two.png", second=True)

    # 1) 全部测到
    m = metrics(full)
    assert m["status"] == "ok", m["status"]
    assert m["band"]["height_px"] == 15, m["band"]
    assert m["band"]["kind"] in ("solid", "gradient"), m["band"]
    assert m["dot_px"] is not None and m["unmeasured"] == [], m
    assert m["band_hex_source"] == "palette_guess" and m["band_hex_used"], m
    assert m["panel_count"] == 1, m["panel_count"]

    # 2) 纯白图：全部字段在、各带 reason、status none
    b = metrics(blank)
    assert b["status"] == "none", b["status"]
    for k in ("frame_pct", "plot_px", "band", "gap", "tick_px", "text_below", "dot_px"):
        assert k in b and b[k] is None, (k, b.get(k))
        assert b[k + "_reason"], (k, b.get(k + "_reason"))
    assert b["palette"] == [] and b["palette_reason"], b
    assert b["frame_pct_reason"].startswith("no_frame"), b["frame_pct_reason"]

    # 3) 无框但有内容（不再误判成半宽面板）：status none
    n = metrics(noframe)
    assert n["status"] == "none" and n["frame_pct"] is None, n["status"]

    # 4) 半宽面板：以前测不到，现在能测（R10）
    h = metrics(half_gray)
    assert h["status"] in ("ok", "partial"), h["status"]
    assert h["frame_pct"] and abs(h["frame_pct"]["left"] - 10.0) < 0.3, h["frame_pct"]
    assert abs(h["frame_pct"]["width"] - 35.3) < 0.4, h["frame_pct"]

    # 5) 多面板：切出 2 个候选，扁平字段不污染
    t = metrics(two)
    assert t["panel_count"] == 2 and len(t["panels"]) == 2, t["panel_count"]
    assert t["frame_pct"] is None and "multi_panel" in t["frame_pct_reason"], t["frame_pct_reason"]
    assert t["status"] == "partial", t["status"]

    # 6) 显式给错带色 → 该项 null + reason 带色值，status partial，不连累点径
    p = metrics(full, band_hex="#123456")
    assert p["status"] == "partial", p["status"]
    assert p["band"] is None and "123456" in p["band_reason"], p["band_reason"]
    assert p["gap"] is None and p["gap_reason"], p
    assert p["dot_px"] is not None, "错带色不该连累点径"
    assert p["band_hex_source"] == "cli", p["band_hex_source"]

    # 7) --json + rc 语义
    def run(*argv):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(io.StringIO()):
            rc = main([sys.argv[0]] + list(argv))
        return rc, buf.getvalue()

    rc, out = run(full, "--json")
    assert rc == RC_OK, rc
    payload = json.loads(out)
    assert payload["status"] == "ok" and payload["files"][0]["unmeasured"] == [], payload
    rc, out = run(blank, "--json")
    assert rc == RC_NONE and json.loads(out)["files"][0]["frame_pct"] is None, rc
    rc, _ = run(two)
    assert rc == RC_PARTIAL, rc
    rc, _ = run(full, "--band-hex", "#123456", "--json")
    assert rc == RC_PARTIAL, rc
    rc, _ = run(full, blank, "--json")            # 两图取最差
    assert rc == RC_NONE, rc
    rc, _ = run(full, "--band-hex", "FCE4EA")     # 非法色值
    assert rc == RC_USAGE, rc
    rc, _ = run(full, "--dark", "abc")
    assert rc == RC_USAGE, rc
    rc, _ = run()                                 # 无文件
    assert rc == RC_USAGE, rc

    print("selftest OK: contract (unmeasured null+reason, status ok/partial/none, rc 0/3/4/2, --json, --dark)")
    return 0


if __name__ == "__main__":
    setup_stdout()
    if "--selftest" in sys.argv[1:]:
        sys.exit(selftest())
    sys.exit(main(sys.argv))
