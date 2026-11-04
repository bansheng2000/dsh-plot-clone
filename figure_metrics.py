"""figure_metrics.py — 参考图/成品图的量化对照（复刻收敛用）。

只读像素，输出可比的归一化几何量与色值：
  frame(外框) canvas%、装饰带高度%（纯色/渐变）、白缝%、刻度长度、文字行与字高、
点径、关键色、面板数。

用法：
  python figure_metrics.py <img.png> [--json]
  python figure_metrics.py <img.png> [--band-hex "#RRGGBB"] [--dot-hex "#RRGGBB"] [--dark 130]
  python figure_metrics.py ref.png --expect-sha <64-hex>   # 绑定参考图哈希，换图立刻报错（rc 2）
  python figure_metrics.py <img.png> --pub-check [--series-color "#RRGGBB,#RRGGBB,..."] [--json]
  python figure_metrics.py ref.png ours.png        # 并排对照
  python figure_metrics.py --selftest              # 契约自检（缺测/状态/JSON/投稿可辨）
  python test_synth.py                             # 合成真值自检（几何精度）
  python -c "print(1)"                             # 先确认解释器能用：WindowsApps 的 python 存根会静默退出码 49

约定（状态与退出码）：
  测不到的项一律写成 null + 同名字段加 _reason 后缀，字段永不省略
  （值 = null 表示没测到，reason 说明为什么；省略字段会让调用方分不清「没有」和「没测」）。
  status: ok      = 外框 + 装饰带 + 点径 都测到
          partial = 外框测到，但装饰带或点径没测到（图里可能本来就没有该图元），或是多面板
          none    = 外框没测到，其余读数不可比
  rc:     0 = ok, 3 = partial, 4 = none, 2 = 用法错误。
          --pub-check 沿用同一组码：0 = 三项全过，3 = 有项测不到（null + reason），
          4 = 有项不达标，2 = 用法错误。

量测精度（合成真值图上实测，见 test_synth.py）：frame/band/tick ±1px，点径 ±1px(d<=10) / ±2px(d=20)，
渐变带高度 ±2px；真实截图有抗锯齿与缩放，误差会更大。
"""
import contextlib
import io
import json
import os
import re
import sys

import numpy as np

import pixel_core as pc
from pixel_core import setup_stdout

RC_OK, RC_PARTIAL, RC_NONE, RC_USAGE = 0, 3, 4, 2
HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")

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
        gradient = bd["kind"] == "gradient"
        d["band_kind"] = "gradient_unsupported" if gradient else "solid"
        d["band_usable"] = not gradient
        d["gap"] = pc.white_gap(a, t, b, l, r, bd["top"])
    else:
        d["band"], d["gap"] = None, None
        d["band_kind"], d["band_usable"] = None, None
        bad["band"] = NO_BAND % (band_hex or "<no palette candidate>")
        bad["gap"] = "no_band: the white gap sits above the band, nothing to measure"
        bad["band_kind"] = "no_band: band not measured, see band_reason"
        bad["band_usable"] = "no_band: band not measured, see band_reason"

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
    deps = ("plot_px", "band", "band_kind", "band_usable", "gap",
            "tick_px", "text_below", "dot_px")

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



# ------------------------------------------------------- 投稿级可辨性（--pub-check）

PUB_DELTA_L = 10.0        # 灰度可辨：相邻系列 CIE L* 差下限（SKILL 第 2 步）
PUB_DELTA_E00 = 10.0      # 色盲可辨：Brettel 模拟后 CIEDE2000 下限
PUB_CONTRAST = 1.5        # 白底 WCAG 对比度下限
PUB_BG = "#FFFFFF"
PUB_CVD_KINDS = ("protanopia", "deuteranopia")
OKABE_ITO = ("#000000", "#E69F00", "#56B4E9", "#009E73",
             "#F0E442", "#0072B2", "#D55E00", "#CC79A7")

# Brettel, Viénot & Mollon (1997), "Computerized simulation of color appearance for
# dichromats", JOSA A 14(10):2647-2655。常量与步骤对齐 DaltonLens-Python 的实现
# （daltonlens/convert.py + daltonlens/simulate.py）：Smith-Pokorny 1975 LMS、
# Judd-Vos 475/575 nm 锚点、以 sRGB 白为中性轴；分离面两侧各用一个投影阵（H1/H2），
# 比 Viénot 1999 的单平面更贴原始文献。
_XYZ_FROM_RGB = np.array([
    [40.9568, 35.5041, 17.9167],
    [21.3389, 70.6743, 7.98680],
    [1.86297, 11.4620, 91.2367]]) * 1e-2
_LMS_FROM_XYZ = np.array([
    [0.15514, 0.54312, -0.03286],
    [-0.15514, 0.45684, 0.03286],
    [0.0, 0.0, 0.01608]])
_LMS_FROM_RGB = _LMS_FROM_XYZ @ _XYZ_FROM_RGB
_RGB_FROM_LMS = np.linalg.inv(_LMS_FROM_RGB)
_XYZ_475 = np.array([0.13287, 0.11284, 0.9422])
_XYZ_575 = np.array([0.84394, 0.91558, 0.00197])
_CVD_CACHE = {}


def _srgb_to_linear(c):
    c = np.asarray(c, float) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _linear_to_srgb(c):
    c = np.clip(np.asarray(c, float), 0.0, 1.0)
    return np.where(c <= 0.0031308, 12.92 * c,
                    1.055 * c ** (1 / 2.4) - 0.055) * 255.0


def relative_luminance(rgb255):
    lin = _srgb_to_linear(rgb255)
    return float(0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2])


def contrast_ratio(hex_a, hex_b=PUB_BG):
    ya, yb = relative_luminance(pc.rgb(hex_a)), relative_luminance(pc.rgb(hex_b))
    hi, lo = max(ya, yb), min(ya, yb)
    return round((hi + 0.05) / (lo + 0.05), 2)


def srgb_to_lab(rgb255):
    xyz = _XYZ_FROM_RGB @ _srgb_to_linear(rgb255) * 100.0

    def f(t):
        return np.where(t > (6 / 29) ** 3, np.cbrt(t),
                        t / (3 * (6 / 29) ** 2) + 4 / 29)

    fx, fy, fz = f(xyz[0] / 95.047), f(xyz[1] / 100.0), f(xyz[2] / 108.883)
    return np.array([116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)])


def lstar(hexv):
    return round(float(srgb_to_lab(pc.rgb(hexv))[0]), 2)


def delta_e00(lab1, lab2):
    """CIEDE2000（kL=kC=kH=1）；Sharma et al. 2005 的测试对在 selftest 里钉住。"""
    L1, a1, b1 = float(lab1[0]), float(lab1[1]), float(lab1[2])
    L2, a2, b2 = float(lab2[0]), float(lab2[1]), float(lab2[2])
    c1, c2 = np.hypot(a1, b1), np.hypot(a2, b2)
    cbar = (c1 + c2) / 2.0
    g = 0.5 * (1 - np.sqrt(cbar ** 7 / (cbar ** 7 + 25.0 ** 7)))
    a1p, a2p = (1 + g) * a1, (1 + g) * a2
    c1p, c2p = np.hypot(a1p, b1), np.hypot(a2p, b2)
    h1p = np.degrees(np.arctan2(b1, a1p)) % 360
    h2p = np.degrees(np.arctan2(b2, a2p)) % 360
    dL, dC = L2 - L1, c2p - c1p
    dh = h2p - h1p
    if c1p * c2p == 0:
        dh = 0.0
    elif dh > 180:
        dh -= 360
    elif dh < -180:
        dh += 360
    dH = 2 * np.sqrt(c1p * c2p) * np.sin(np.radians(dh / 2))
    lb, cb = (L1 + L2) / 2, (c1p + c2p) / 2
    if c1p * c2p == 0:
        hb = h1p + h2p
    elif abs(h1p - h2p) <= 180:
        hb = (h1p + h2p) / 2
    elif h1p + h2p < 360:
        hb = (h1p + h2p + 360) / 2
    else:
        hb = (h1p + h2p - 360) / 2
    T = (1 - 0.17 * np.cos(np.radians(hb - 30)) + 0.24 * np.cos(np.radians(2 * hb))
         + 0.32 * np.cos(np.radians(3 * hb + 6)) - 0.20 * np.cos(np.radians(4 * hb - 63)))
    dtheta = 30 * np.exp(-((hb - 275) / 25) ** 2)
    rc = 2 * np.sqrt(cb ** 7 / (cb ** 7 + 25.0 ** 7))
    sl = 1 + 0.015 * (lb - 50) ** 2 / np.sqrt(20 + (lb - 50) ** 2)
    sc = 1 + 0.045 * cb
    sh = 1 + 0.015 * cb * T
    rt = -np.sin(np.radians(2 * dtheta)) * rc
    return float(np.sqrt((dL / sl) ** 2 + (dC / sc) ** 2 + (dH / sh) ** 2
                         + rt * (dC / sc) * (dH / sh)))


def _projection(n, kind):
    if kind == "protanopia":
        return np.array([[0.0, -n[1] / n[0], -n[2] / n[0]],
                         [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]])
    return np.array([[1.0, 0.0, 0.0],
                     [-n[0] / n[1], 0.0, -n[2] / n[1]],
                     [0.0, 0.0, 1.0]])


def _brettel(kind):
    """返回 (H1, H2, 分离面法向) 的 linear-RGB 矩阵；首次调用时按锚点算好缓存。"""
    if kind not in _CVD_CACHE:
        neutral = _LMS_FROM_RGB @ np.array([1.0, 1.0, 1.0])
        w1, w2 = _LMS_FROM_RGB @ _XYZ_475, _LMS_FROM_RGB @ _XYZ_575
        n1, n2 = np.cross(neutral, w1), np.cross(neutral, w2)
        axis = np.array([1.0, 0.0, 0.0]) if kind == "protanopia" else np.array([0.0, 1.0, 0.0])
        n_sep = np.cross(neutral, axis)
        if np.dot(n_sep, w1) < 0:
            n1, n2 = n2, n1
        _CVD_CACHE[kind] = (_RGB_FROM_LMS @ _projection(n1, kind) @ _LMS_FROM_RGB,
                            _RGB_FROM_LMS @ _projection(n2, kind) @ _LMS_FROM_RGB,
                            n_sep)
    return _CVD_CACHE[kind]


def simulate_cvd(hexv, kind):
    """Brettel 1997 二色觉模拟：sRGB → 线性 → LMS 投影 → 线性 → sRGB（clamp）。"""
    h1, h2, n_sep = _brettel(kind)
    lms = _LMS_FROM_RGB @ _srgb_to_linear(pc.rgb(hexv))
    out = (h1 if float(np.dot(lms, n_sep)) >= 0 else h2) @ lms
    return pc.to_hex(_linear_to_srgb(_RGB_FROM_LMS @ out))


def _pair_sims(hex_a, hex_b):
    sims = {}
    for kind in PUB_CVD_KINDS:
        ha, hb = simulate_cvd(hex_a, kind), simulate_cvd(hex_b, kind)
        sims[kind] = {"hex_a": ha, "hex_b": hb,
                      "deltaE00": round(delta_e00(srgb_to_lab(pc.rgb(ha)),
                                                  srgb_to_lab(pc.rgb(hb))), 2)}
    return sims


def _gray_item(series):
    pairs = []
    for i in range(len(series) - 1):
        a, b = series[i], series[i + 1]
        dl = round(abs(lstar(a["hex"]) - lstar(b["hex"])), 2)
        pairs.append({"a": a["index"], "b": b["index"], "hex_a": a["hex"],
                      "hex_b": b["hex"], "deltaL": dl,
                      "threshold": PUB_DELTA_L, "pass": dl >= PUB_DELTA_L})
    item = {"threshold_deltaL": PUB_DELTA_L, "pairs_mode": "adjacent", "pairs": pairs,
            "measured_min_deltaL": None, "pass": None, "reason": None}
    if pairs:
        item["measured_min_deltaL"] = min(p["deltaL"] for p in pairs)
        item["pass"] = item["measured_min_deltaL"] >= PUB_DELTA_L
    else:
        item["reason"] = ("need_2_series: got %d series color(s); adjacent L* needs >=2"
                          % len(series))
    return item


def _cvd_item(series):
    pairs = []
    for i in range(len(series)):
        for j in range(i + 1, len(series)):
            a, b = series[i], series[j]
            sims = _pair_sims(a["hex"], b["hex"])
            worst = min(sims, key=lambda k: sims[k]["deltaE00"])
            mn = sims[worst]["deltaE00"]
            pairs.append({"a": a["index"], "b": b["index"],
                          "hex_a": a["hex"], "hex_b": b["hex"], "simulations": sims,
                          "min_deltaE00": mn, "worst_simulator": worst,
                          "threshold": PUB_DELTA_E00, "pass": mn >= PUB_DELTA_E00})
    item = {"threshold_deltaE00": PUB_DELTA_E00, "pairs_mode": "all_pairs",
            "pairs": pairs, "measured_min_deltaE00": None, "pass": None, "reason": None}
    if pairs:
        item["measured_min_deltaE00"] = min(p["min_deltaE00"] for p in pairs)
        item["pass"] = item["measured_min_deltaE00"] >= PUB_DELTA_E00
    else:
        item["reason"] = ("need_2_series: got %d series color(s); colour-vision simulation "
                          "needs a pair" % len(series))
    return item


def _contrast_item(series):
    rows = []
    for s in series:
        ct = contrast_ratio(s["hex"])
        rows.append({"index": s["index"], "hex": s["hex"], "background": PUB_BG,
                     "contrast": ct, "threshold": PUB_CONTRAST,
                     "pass": ct >= PUB_CONTRAST})
    item = {"threshold": PUB_CONTRAST, "background": PUB_BG, "series": rows,
            "measured_min_contrast": None, "pass": None, "reason": None}
    if rows:
        item["measured_min_contrast"] = min(r["contrast"] for r in rows)
        item["pass"] = item["measured_min_contrast"] >= PUB_CONTRAST
    else:
        item["reason"] = "no_series: no series colour found; pass --series-color explicitly"
    return item


def _okabe_fix(replace_hex, other_hex, need):
    """在 Okabe-Ito 八色里找能让这一对恢复可辨的候选（就近换色：正常视觉 ΔE00 最小）。"""
    best = None
    for cand in OKABE_ITO:
        if cand in (replace_hex, other_hex):
            continue
        dl = round(abs(lstar(cand) - lstar(other_hex)), 2)
        sims = _pair_sims(cand, other_hex)
        dmin = min(v["deltaE00"] for v in sims.values())
        ct = contrast_ratio(cand)
        ok = (ct >= PUB_CONTRAST) if need == "contrast" else (dl >= PUB_DELTA_L
                                                              and dmin >= PUB_DELTA_E00)
        if not ok:
            continue
        dist = delta_e00(srgb_to_lab(pc.rgb(cand)), srgb_to_lab(pc.rgb(replace_hex)))
        if best is None or dist < best["dist"]:
            best = {"hex": cand, "deltaL": dl, "min_deltaE00": dmin,
                    "simulations": sims, "contrast": ct, "dist": dist}
    return best


def _advice_pair(check, pair, series, simulator=None):
    cands = []
    for idx, other_idx in ((pair["a"], pair["b"]), (pair["b"], pair["a"])):
        fix = _okabe_fix(series[idx]["hex"], series[other_idx]["hex"], "pair")
        if fix:
            cands.append((fix["dist"], idx, fix))
    entry = {"check": check, "pair": [pair["a"], pair["b"]],
             "hex": [pair["hex_a"], pair["hex_b"]], "simulator": simulator,
             "replace": None, "after": None, "reason": None}
    if not cands:
        entry["reason"] = ("no_okabe_ito_fix: none of the 8 Okabe-Ito colours makes this pair "
                           "pass dL*>=%.0f and dE00>=%.0f under both simulations"
                           % (PUB_DELTA_L, PUB_DELTA_E00))
        return entry
    _, idx, fix = min(cands, key=lambda z: z[0])
    entry["replace"] = {"index": idx, "from": series[idx]["hex"], "to": fix["hex"]}
    entry["after"] = {"deltaL": fix["deltaL"], "min_deltaE00": fix["min_deltaE00"],
                      "simulations": fix["simulations"], "contrast": fix["contrast"]}
    return entry


def _advice_contrast(row):
    entry = {"check": "white_contrast", "pair": None, "hex": [row["hex"]],
             "simulator": None, "replace": None, "after": None, "reason": None}
    best = None
    for cand in OKABE_ITO:
        if cand == row["hex"]:
            continue
        ct = contrast_ratio(cand)
        if ct < PUB_CONTRAST:
            continue
        dist = delta_e00(srgb_to_lab(pc.rgb(cand)), srgb_to_lab(pc.rgb(row["hex"])))
        if best is None or dist < best[0]:
            best = (dist, cand, ct)
    if best is None:
        entry["reason"] = "no_okabe_ito_fix: none of the 8 Okabe-Ito colours reaches %.1f:1" % PUB_CONTRAST
        return entry
    entry["replace"] = {"index": row["index"], "from": row["hex"], "to": best[1]}
    entry["after"] = {"contrast": best[2], "deltaL": round(abs(lstar(best[1]) - lstar(row["hex"])), 2)}
    return entry


def _series_from_palette(a):
    pal, _ = pc.palette(a, 8, min_frac=0.002)
    return [{"index": i, "hex": c["hex"], "source": "palette", "frac": c["frac"]}
            for i, c in enumerate(pal)]


def pub_check(path, series_hexes=None):
    """投稿级可辨性三项检查：灰度 ΔL*、色盲 ΔE00、白底对比度。缺测写 null + reason。"""
    a = pc.load(path)
    h, w, _ = a.shape
    m = {"mode": "pub-check", "file": os.path.basename(path), "size": [w, h],
         "series_source": "cli" if series_hexes else "palette",
         "series": [], "series_reason": None, "grayscale": None, "colorblind": None,
         "white_contrast": None, "advice": [], "failed_checks": [],
         "unmeasured_checks": [], "status": None}
    if series_hexes:
        m["series"] = [{"index": i, "hex": hx, "source": "cli", "frac": None}
                       for i, hx in enumerate(series_hexes)]
    else:
        m["series"] = _series_from_palette(a)
        if not m["series"]:
            m["series_reason"] = EMPTY_PAL + "; pass --series-color explicitly"
    m["grayscale"] = _gray_item(m["series"])
    m["colorblind"] = _cvd_item(m["series"])
    m["white_contrast"] = _contrast_item(m["series"])
    for p in m["grayscale"]["pairs"]:
        if not p["pass"]:
            m["advice"].append(_advice_pair("grayscale", p, m["series"]))
    for p in m["colorblind"]["pairs"]:
        if not p["pass"]:
            m["advice"].append(_advice_pair("colorblind", p, m["series"], p["worst_simulator"]))
    for row in m["white_contrast"]["series"]:
        if not row["pass"]:
            m["advice"].append(_advice_contrast(row))
    items = ("grayscale", "colorblind", "white_contrast")
    m["failed_checks"] = [k for k in items if m[k]["pass"] is False]
    m["unmeasured_checks"] = [k for k in items if m[k]["pass"] is None]
    m["status"] = "fail" if m["failed_checks"] else ("partial" if m["unmeasured_checks"] else "ok")
    return m


def show_pub(m):
    print("== pub-check", m["file"], m.get("size"), "| series", len(m["series"]),
          "(%s)" % (m["series_source"] or "none"), "| status", m["status"].upper())
    for s in m["series"]:
        frac = " %.2f%%" % (100 * s["frac"]) if s.get("frac") is not None else ""
        print("   SERIES %d %s%s" % (s["index"], s["hex"], frac))
    if m.get("series_reason"):
        print("   SERIES unmeasured(%s)" % m["series_reason"])
    g = m["grayscale"]
    if g["pass"] is None:
        print("   GRAY   unmeasured(%s)" % g["reason"])
    else:
        print("   GRAY   min dL* %.2f (threshold >= %.1f) %s"
              % (g["measured_min_deltaL"], g["threshold_deltaL"],
                 "PASS" if g["pass"] else "FAIL"))
        for p in g["pairs"]:
            if not p["pass"]:
                print("          [x] %d%s vs %d%s  dL*=%.2f < %.1f"
                      % (p["a"], p["hex_a"], p["b"], p["hex_b"], p["deltaL"], p["threshold"]))
    c = m["colorblind"]
    if c["pass"] is None:
        print("   CVD    unmeasured(%s)" % c["reason"])
    else:
        print("   CVD    min dE00 %.2f (threshold >= %.1f, %d pair(s)) %s"
              % (c["measured_min_deltaE00"], c["threshold_deltaE00"], len(c["pairs"]),
                 "PASS" if c["pass"] else "FAIL"))
        for p in c["pairs"]:
            if not p["pass"]:
                sims = p["simulations"]
                print("          [x] %d%s vs %d%s  prot=%.2f deut=%.2f (worst %s < %.1f)"
                      % (p["a"], p["hex_a"], p["b"], p["hex_b"],
                         sims["protanopia"]["deltaE00"], sims["deuteranopia"]["deltaE00"],
                         p["worst_simulator"], p["threshold"]))
    wc = m["white_contrast"]
    if wc["pass"] is None:
        print("   WHITE  unmeasured(%s)" % wc["reason"])
    else:
        print("   WHITE  min contrast %.2f:1 (threshold >= %.1f:1, bg %s) %s"
              % (wc["measured_min_contrast"], wc["threshold"], wc["background"],
                 "PASS" if wc["pass"] else "FAIL"))
        for r in wc["series"]:
            if not r["pass"]:
                print("          [x] %d%s  %.2f:1 < %.1f:1"
                      % (r["index"], r["hex"], r["contrast"], r["threshold"]))
    for ad in m["advice"]:
        if not ad["replace"]:
            print("   ADVICE %-9s %s  %s" % (ad["check"], "/".join(ad["hex"]), ad["reason"]))
            continue
        r, af = ad["replace"], ad["after"]
        if ad["check"] == "white_contrast":
            print("   ADVICE %-9s %s -> %d%s 换 %s | contrast=%.2f dL*=%.2f"
                  % (ad["check"], "/".join(ad["hex"]), r["index"], r["from"], r["to"],
                     af["contrast"], af["deltaL"]))
        else:
            print("   ADVICE %-9s %s -> %d%s 换 %s | dL*=%.2f dE00min=%.2f contrast=%.2f"
                  % (ad["check"], "/".join(ad["hex"]), r["index"], r["from"], r["to"],
                     af["deltaL"], af["min_deltaE00"], af["contrast"]))


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
            print("   PANEL%d frame left %.1f%% top %.1f%% w %.1f%% h %.1f%% | band %s px [%s] | tick %s px"
                  % (i + 1, pf["left"], pf["top"], pf["width"], pf["height"],
                     _fmt((p.get("band") or {}).get("height_px")), _fmt(p.get("band_kind")),
                     _fmt(p.get("tick_px"))))
    bd = m.get("band")
    if bd:
        print("   BAND h %dpx = %.1f%% plot_h, from_bottom %.1f%%, kind %s | hex %s (%s)"
              " | band_kind %s usable %s"
              % (bd["height_px"], bd["pct_plot_h"], bd["from_bottom_pct"], bd["kind"],
                 m["band_hex_used"], m["band_hex_source"],
                 m.get("band_kind"), _fmt(m.get("band_usable")).lower()))
        if m.get("band_usable") is False:
            print("   WARN gradient_unsupported: 渐变带按绘图区高度插值，量到的高偏小；"
                  "第 3 步台账记 rejected，不许记 applied")
        g = m.get("gap")
        if g is None:
            print("   GAP  unmeasured(%s)" % m.get("gap_reason"))
        else:
            print("   GAP  %s px (%s%%)" % (g[0], g[1]))
    elif not m.get("panels"):
        print("   BAND unmeasured(%s) | band_kind unmeasured(%s)"
              % (m.get("band_reason"), m.get("band_kind_reason")))
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
        elif a == "--pub-check":
            opts[a] = True
            i += 1
        elif a == "--series-color":
            if i + 1 >= len(argv):
                return None, "--series-color needs a value like \"#0072B2,#E69F00\""
            hs = [x.strip().upper() for x in argv[i + 1].split(",") if x.strip()]
            if not hs or not all(HEX_RE.match(x) for x in hs):
                return None, "--series-color got %r, want comma-separated #RRGGBB" % argv[i + 1]
            opts[a] = (opts.get(a) or []) + hs
            i += 2
        elif a == "--expect-sha":
            if i + 1 >= len(argv):
                return None, "--expect-sha needs a 64-hex sha256"
            value = argv[i + 1].strip().lower()
            if not SHA256_RE.match(value):
                return None, "--expect-sha got %r, want 64 hex chars" % argv[i + 1]
            opts[a] = value
            i += 2
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
    if opts.get("--expect-sha"):
        if not files:
            print("ERROR: --expect-sha needs a reference file to hash", file=sys.stderr)
            return RC_USAGE
        try:
            actual = pc.sha256_file(files[0])
        except OSError as exc:
            print("ERROR: cannot read %s: %s" % (files[0], exc), file=sys.stderr)
            return RC_USAGE
        if actual != opts["--expect-sha"]:
            print("ERROR: reference sha256 mismatch for %s\n  expected: %s\n  actual:   %s"
                  % (os.path.basename(files[0]), opts["--expect-sha"], actual),
                  file=sys.stderr)
            return RC_USAGE
    if opts.get("--series-color") and not opts.get("--pub-check"):
        print("ERROR: --series-color only works with --pub-check", file=sys.stderr)
        return RC_USAGE
    if opts.get("--pub-check"):
        if len(files) != 1:
            print("ERROR: --pub-check takes exactly one figure PNG", file=sys.stderr)
            return RC_USAGE
        m = pub_check(files[0], opts.get("--series-color"))
        if opts.get("--json"):
            print(json.dumps(m, ensure_ascii=False, indent=2))
        else:
            show_pub(m)
        return {"ok": RC_OK, "partial": RC_PARTIAL, "fail": RC_NONE}[m["status"]]  # fail 沿用 4
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



def _pub_selftest():
    """投稿可辨自检：四项判据各钉一条能真红的断言，并回显实测值。"""
    import tempfile
    from PIL import Image, ImageDraw

    d = os.path.join(tempfile.gettempdir(), "_pubcheck_selftest")
    os.makedirs(d, exist_ok=True)
    img = os.path.join(d, "series3.png")
    im = Image.new("RGB", (400, 300), "white")
    dr = ImageDraw.Draw(im)
    for k, hx in enumerate(("#0072B2", "#E69F00", "#009E73")):
        dr.rectangle([40, 40 + 70 * k, 360, 90 + 70 * k],
                     fill=tuple(int(hx[i:i + 2], 16) for i in (1, 3, 5)))
    im.save(img)

    # 0) CIEDE2000 公式锚点（Sharma et al. 2005 测试对 1）
    d0 = delta_e00(np.array([50.0, 2.6772, -79.7751]), np.array([50.0, 0.0, -82.7485]))
    assert abs(d0 - 2.0425) < 1e-3, d0

    # 1) 明显不同的两色：三项必须全过
    ok = pub_check(img, ["#0072B2", "#E69F00"])
    p = ok["colorblind"]["pairs"][0]
    assert ok["status"] == "ok", ok["status"]
    assert ok["grayscale"]["pass"] and ok["colorblind"]["pass"] and ok["white_contrast"]["pass"], ok

    # 2) 等亮度红绿：灰度项必须 fail
    red = pub_check(img, ["#FF0000", "#00A000"])
    assert red["grayscale"]["pass"] is False, red["grayscale"]

    # 3) 红绿在 deuteranopia 下不可辨：色盲项必须 fail
    rg = pub_check(img, ["#D55E00", "#009E73"])
    q = rg["colorblind"]["pairs"][0]
    assert rg["colorblind"]["pass"] is False, rg["colorblind"]
    assert q["worst_simulator"] == "deuteranopia", q

    # 4) 纯黄对白底：对比度项必须 fail
    y = pub_check(img, ["#FFFF00"])
    row = y["white_contrast"]["series"][0]
    assert y["white_contrast"]["pass"] is False, y["white_contrast"]

    # 5) 不给 --series-color 时从图里提主色
    pal = pub_check(img)
    assert pal["series_source"] == "palette" and len(pal["series"]) >= 2, pal["series"]

    def run(*argv):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(io.StringIO()):
            rc = main([sys.argv[0]] + list(argv))
        return rc, buf.getvalue()

    # 6) CLI：rc 语义 / JSON 形状 / 建议落位 / 缺测 null + reason
    rc, out = run(img, "--pub-check", "--series-color", "#0072B2,#E69F00", "--json")
    assert rc == RC_OK, rc
    payload = json.loads(out)
    assert payload["mode"] == "pub-check", payload
    assert payload["grayscale"]["threshold_deltaL"] == PUB_DELTA_L, payload["grayscale"]
    assert payload["white_contrast"]["threshold"] == PUB_CONTRAST, payload["white_contrast"]
    rc, out = run(img, "--pub-check", "--series-color", "#D55E00,#009E73", "--json")
    assert rc == RC_NONE, rc
    adv = json.loads(out)["advice"]
    assert adv and adv[0]["replace"] and adv[0]["after"], adv
    rc, out = run(img, "--pub-check", "--series-color", "#D55E00,#009E73")
    assert rc == RC_NONE, rc
    assert "ADVICE" in out and "GRAY" in out and "CVD" in out, out
    assert "##" not in out, out
    rc, out = run(img, "--pub-check", "--series-color", "#FFFF00")
    assert rc == RC_NONE, rc
    assert "##" not in out and "WHITE" in out, out
    rc, out = run(img, "--pub-check", "--series-color", "#0072B2", "--json")
    assert rc == RC_PARTIAL, rc
    one = json.loads(out)
    assert one["grayscale"]["pass"] is None and one["grayscale"]["reason"], one["grayscale"]
    assert one["colorblind"]["pass"] is None and one["colorblind"]["reason"], one["colorblind"]
    assert one["white_contrast"]["pass"] is True, one["white_contrast"]
    rc, _ = run(img, "--series-color", "#0072B2")
    assert rc == RC_USAGE, rc
    rc, _ = run(img, "--pub-check", "--series-color", "0072B2")
    assert rc == RC_USAGE, rc

    print("   PUB CIEDE2000 anchor (Sharma pair 1): dE00=%.4f (want 2.0425)" % d0)
    print("   PUB PASS   #0072B2 vs #E69F00: dL*=%.2f (>=%.1f) | prot=%.2f deut=%.2f (>=%.1f)"
          " | contrast %.2f/%.2f (>=%.1f)"
          % (ok["grayscale"]["measured_min_deltaL"], PUB_DELTA_L,
             p["simulations"]["protanopia"]["deltaE00"],
             p["simulations"]["deuteranopia"]["deltaE00"], PUB_DELTA_E00,
             ok["white_contrast"]["series"][0]["contrast"],
             ok["white_contrast"]["series"][1]["contrast"], PUB_CONTRAST))
    print("   PUB GRAY-FAIL #FF0000 vs #00A000: dL*=%.2f < %.1f"
          % (red["grayscale"]["measured_min_deltaL"], PUB_DELTA_L))
    print("   PUB CVD-FAIL #D55E00 vs #009E73: prot=%.2f deut=%.2f (threshold %.1f, worst %s)"
          % (q["simulations"]["protanopia"]["deltaE00"],
             q["simulations"]["deuteranopia"]["deltaE00"], PUB_DELTA_E00, q["worst_simulator"]))
    print("   PUB CONTRAST-FAIL #FFFF00 on #FFFFFF: %.2f:1 < %.1f:1"
          % (row["contrast"], PUB_CONTRAST))
    print("   PUB PALETTE %d colours: %s" % (len(pal["series"]),
          ", ".join(s["hex"] for s in pal["series"])))
    print("   PUB CLI fail rc=4 advice: %d%s -> %s (dL*=%.2f dE00min=%.2f contrast=%.2f)"
          % (adv[0]["replace"]["index"], adv[0]["replace"]["from"], adv[0]["replace"]["to"],
             adv[0]["after"]["deltaL"], adv[0]["after"]["min_deltaE00"],
             adv[0]["after"]["contrast"]))


def selftest():
    """契约自检：缺测显式化 / 状态与 rc / --json 形状 / 色值参数化 / 半宽与多面板 / 投稿可辨。"""
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

    grad = os.path.join(d, "grad_band.png")
    im = Image.new("RGB", (400, 300), "white")
    dr = ImageDraw.Draw(im)
    dr.rectangle([40, 30, 360, 240], outline=(0, 0, 0), width=2)
    for i in range(15):
        k = i / 14.0
        c = (int(0x20 + (0xA0 - 0x20) * k), int(0x20 + (0xC0 - 0x20) * k),
             int(0x60 + (0xFF - 0x60) * k))
        dr.line([(42, 210 + i), (358, 210 + i)], fill=c)
    im.save(grad)

    # 1) 全部测到；纯色带必须 usable
    m = metrics(full)
    assert m["status"] == "ok", m["status"]
    assert m["band"]["height_px"] == 15, m["band"]
    assert m["band"]["kind"] in ("solid", "gradient"), m["band"]
    assert m["band_kind"] == "solid" and m["band_usable"] is True, \
        (m.get("band_kind"), m.get("band_usable"))

    # 1b) 渐变带：数值照给，但 band_kind 必须显式标不可用（第 3 步台账不许记 applied）
    gm = metrics(grad)
    assert gm["band"] and gm["band"]["kind"] == "gradient", gm.get("band")
    assert gm["band_kind"] == "gradient_unsupported" and gm["band_usable"] is False, \
        (gm.get("band_kind"), gm.get("band_usable"))
    assert m["dot_px"] is not None and m["unmeasured"] == [], m
    assert m["band_hex_source"] == "palette_guess" and m["band_hex_used"], m
    assert m["panel_count"] == 1, m["panel_count"]

    # 2) 纯白图：全部字段在、各带 reason、status none
    b = metrics(blank)
    assert b["status"] == "none", b["status"]
    for k in ("frame_pct", "plot_px", "band", "band_kind", "band_usable", "gap",
              "tick_px", "text_below", "dot_px"):
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
    assert t["band_kind"] is None and t["band_usable"] is None, (t.get("band_kind"), t.get("band_usable"))
    assert all(p["band_kind"] == "solid" and p["band_usable"] is True for p in t["panels"]), t["panels"]

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
    assert payload["files"][0]["band_kind"] == "solid", payload["files"][0]
    assert payload["files"][0]["band_usable"] is True, payload["files"][0]
    rc, out = run(grad, "--json")
    gp = json.loads(out)["files"][0]
    assert gp["band_kind"] == "gradient_unsupported" and gp["band_usable"] is False, gp
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

    # 8) --expect-sha：绑定参考图哈希；换图必须报错并打印两个 sha
    import hashlib

    with open(full, "rb") as fh:
        real_sha = hashlib.sha256(fh.read()).hexdigest()
    bad_sha = "0" * 64
    rc, _ = run(full, "--expect-sha", real_sha, "--json")
    assert rc == RC_OK, rc

    def run2(*argv):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            rc = main([sys.argv[0]] + list(argv))
        return rc, out.getvalue(), err.getvalue()

    rc, _, err = run2(full, "--expect-sha", bad_sha, "--json")
    assert rc == RC_USAGE and bad_sha in err and real_sha in err, err
    rc, _, _ = run2(full, "--expect-sha", "abc")
    assert rc == RC_USAGE, rc
    rc, _, _ = run2(full, "--expect-sha", "z" * 64)
    assert rc == RC_USAGE, rc
    rc, _, _ = run2("--expect-sha", real_sha)
    assert rc == RC_USAGE, rc

    _pub_selftest()

    print("   BAND  solid -> band_kind solid usable true | gradient -> gradient_unsupported usable false")
    print("   SHA   expect-sha match rc=0 | mismatch rc=2 (%s != %s)"
          % (bad_sha[:12], real_sha[:12]))
    print("selftest OK: contract (unmeasured null+reason, status ok/partial/none, rc 0/3/4/2, --json, --dark)"
          " + pub-check (gray/CVD/white, rc 0/3/4/2) + band-usable + expect-sha")
    return 0


if __name__ == "__main__":
    setup_stdout()
    if "--selftest" in sys.argv[1:]:
        sys.exit(selftest())
    sys.exit(main(sys.argv))
