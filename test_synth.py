"""test_synth.py — 合成真值自检：几何已知的图，钉住 measure_ref / figure_metrics / extract_palette 的读数。

真值全部由绘制器写死（下面 TRUTH 段），断言带公差；跑法：
  <bundled python> test_synth.py
全绿 rc=0，否则打印逐项 got/want 并 rc=1。先写测试后改实现：本文件的断言是修复的靶子。
"""
import os
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import extract_palette
import figure_metrics
import measure_ref

OUT = os.path.join(tempfile.gettempdir(), "_replica_synth")
os.makedirs(OUT, exist_ok=True)

# ---- 真值（1x 画幅 600x450）----
FRAME = (50, 349, 80, 519)          # rows 50..349, cols 80..519
PLOT_H = FRAME[1] - FRAME[0] + 1    # 300
BAND = (300, 319)                   # 20 行
BAND_H = BAND[1] - BAND[0] + 1      # 20
TICKS = (120, 200, 280, 360, 440)
TICK_LEN = 10
DOT_D = 10
DOT2_D = 20
HALF = (30, 240, 40, 180)           # 半宽面板 rows 30..240, cols 40..180
HALF_BAND = (200, 215)
PANELS = ((50, 349, 60, 280), (50, 349, 320, 540))   # (t,b,l,r)

def arr(p):
    return np.asarray(Image.open(p).convert("RGB")).astype(int)


results = []


def font(size):
    for p in ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/segoeui.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def label_bbox(dr, text, xy, size):
    f = font(size)
    x0, y0, x1, y1 = dr.textbbox(xy, text, font=f)
    return f, (x0, y0, x1, y1)


def axes(name, gradient=False, dot_d=DOT_D, dot_hex=(222, 144, 186), frame_color=(0, 0, 0),
         ticks=True, text=True):
    """单面板：已知 frame / 20px 带 / 10px 外刻度 / 已知字高 / 已知点径。"""
    im = Image.new("RGB", (600, 450), "white")
    dr = ImageDraw.Draw(im)
    dr.rectangle([FRAME[2], FRAME[0], FRAME[3], FRAME[1]], outline=frame_color, width=2)
    if gradient:
        for i in range(BAND_H):
            k = i / (BAND_H - 1.0)
            c = (int(0x20 + (0xA0 - 0x20) * k), int(0x20 + (0xC0 - 0x20) * k), int(0x60 + (0xFF - 0x60) * k))
            dr.line([(FRAME[2] + 2, BAND[0] + i), (FRAME[3] - 2, BAND[0] + i)], fill=c)
    else:
        dr.rectangle([FRAME[2] + 2, BAND[0], FRAME[3] - 2, BAND[1]], fill=(252, 228, 234))
    for x in TICKS:
        if ticks:
            dr.rectangle([x - 1, FRAME[1] + 1, x + 1, FRAME[1] + TICK_LEN], fill=(0, 0, 0))
    label_h = title_h = None
    if text:
        f, bb = label_bbox(dr, "100", (108, FRAME[1] + TICK_LEN + 8), 10)
        dr.text((108, FRAME[1] + TICK_LEN + 8), "100", fill=(0, 0, 0), font=f)
        label_h = bb[3] - bb[1]
        f2, bb2 = label_bbox(dr, "Wavelength (nm)", (200, FRAME[1] + 44), 14)
        dr.text((200, FRAME[1] + 44), "Wavelength (nm)", fill=(0, 0, 0), font=f2)
        title_h = bb2[3] - bb2[1]
    for cx in (150, 260, 370):
        dr.ellipse([cx, 145, cx + dot_d - 1, 145 + dot_d - 1], fill=dot_hex)
    p = os.path.join(OUT, name)
    im.save(p)
    return p, label_h, title_h


def half_panel(name):
    im = Image.new("RGB", (400, 300), "white")
    dr = ImageDraw.Draw(im)
    dr.rectangle([HALF[2], HALF[0], HALF[3], HALF[1]], outline=(128, 128, 128), width=2)
    dr.rectangle([HALF[2] + 2, HALF_BAND[0], HALF[3] - 2, HALF_BAND[1]], fill=(252, 228, 234))
    p = os.path.join(OUT, name)
    im.save(p)
    return p


def two_panels(name):
    im = Image.new("RGB", (600, 450), "white")
    dr = ImageDraw.Draw(im)
    for (t, b, l, r) in PANELS:
        dr.rectangle([l, t, r, b], outline=(0, 0, 0), width=2)
        dr.rectangle([l + 2, 300, r - 2, 319], fill=(252, 228, 234))
    p = os.path.join(OUT, name)
    im.save(p)
    return p


def thin_line(name):
    a = np.full((400, 2000, 3), 255, np.uint8)
    a[:, 1000:1002] = (255, 0, 0)
    p = os.path.join(OUT, name)
    Image.fromarray(a).save(p)
    return p


def chk(name, got, want, tol, unit="px"):
    if got is None:
        results.append((False, name, "None", want, tol))
        return
    ok = abs(got - want) <= tol
    results.append((ok, name, got, want, tol))


print("== R1 合成真值自检（先红后绿）==")
base, lbl_h, ttl_h = axes("base.png")
grad, _, _ = axes("grad.png", gradient=True)
dot20, _, _ = axes("dot20.png", dot_d=DOT2_D, dot_hex=(46, 125, 50))
half = half_panel("half.png")
panels2 = two_panels("panels2.png")
thin = thin_line("thin.png")

# 1) frame：真实行/列，不许有 -2 偏移（R2）
bb = measure_ref.frame_bbox(arr(base))
chk("measure_ref frame top", bb and bb[0], FRAME[0], 0)
chk("measure_ref frame bottom", bb and bb[1], FRAME[1], 0)
chk("measure_ref frame left", bb and bb[2], FRAME[2], 0)
chk("measure_ref frame right", bb and bb[3], FRAME[3], 0)

# 2) 装饰带：20px / 20px 渐变（R4/R5）
bp = measure_ref.band_proportions(arr(base), "#FCE4EA")
chk("measure_ref band height", bp and bp["height_px"], BAND_H, 1)
m = figure_metrics.metrics(base)
chk("figure_metrics band height", (m.get("band") or {}).get("height_px"), BAND_H, 1)

mg = figure_metrics.metrics(grad)
gb = mg.get("band") or {}
chk("figure_metrics gradient band height", gb.get("height_px"), BAND_H, 2)

# 2b) 带外同色图例块压在 25% 列上：整行扫描不许被带偏（R4）
im = Image.open(base).copy()
ImageDraw.Draw(im).rectangle([145, 120, 165, 190], fill=(252, 228, 234))
legend = os.path.join(OUT, "legend.png")
im.save(legend)
lb = measure_ref.band_proportions(arr(legend), "#FCE4EA")
chk("band height with legend block on 25% col", lb and lb["height_px"], BAND_H, 1)

# 3) TICK 1x / 2x / 4x（R6）
for s in (1, 2, 4):
    if s == 1:
        got = m.get("tick_px")
    else:
        im = Image.open(base).resize((600 * s, 450 * s), Image.NEAREST)
        p = os.path.join(OUT, "scale%d.png" % s)
        im.save(p)
        got = figure_metrics.metrics(p).get("tick_px")
    chk("tick_%dx" % s, got, TICK_LEN * s, 1 if s == 1 else 2)

# 4) 点径 10px / 20px（R7）
chk("dot d=10", m.get("dot_px"), DOT_D, 1)
chk("dot d=20", figure_metrics.metrics(dot20).get("dot_px"), DOT2_D, 2)

# 5) 字高 + kind（R8）
tb = m.get("text_below") or []
def g_h(g):                      # 兼容旧形状 (top,bot,h) 与目标形状 {kind,top,bot,height_px}
    return g["height_px"] if isinstance(g, dict) else (g[2] if len(g) > 2 else None)
def g_kind(g):
    return g.get("kind") if isinstance(g, dict) else None
kinds = [g_kind(g) for g in tb]
chk("text group count", len(tb), 2, 0)
chk("label height", g_h(tb[0]) if tb else None, lbl_h, 2)
chk("title height", g_h(tb[-1]) if tb else None, ttl_h, 2)
results.append(("tick" not in kinds, "no tick row mislabeled as text", kinds, ["label", "title"], 0))

# 6) 细线色（R9）
pal = extract_palette.palette(thin, top=8)
def p_hex(c):
    return c["hex"] if isinstance(c, dict) else c[0]
def p_frac(c):
    return c["frac"] if isinstance(c, dict) else (c[1] if len(c) > 1 else 0.0)
hexes = [p_hex(c) for c in pal["colors"]]
results.append(("#FF0000" in hexes, "thin 2px line kept in palette", hexes, "#FF0000 in list", 0))
red = next((c for c in pal["colors"] if p_hex(c) == "#FF0000"), None)
chk("thin line frac %", red and round(p_frac(red) * 100, 3), 0.1, 0.02, "%")

# 7) 半宽面板 + 灰框（R3/R10）
hb = measure_ref.frame_bbox(arr(half))
results.append((hb == HALF, "measure_ref half-width frame", hb, HALF, 0))
hm = figure_metrics.metrics(half)
hf = hm.get("frame_pct")
results.append((hf is not None, "figure_metrics half-width frame measured", hm.get("frame_pct_reason"), "frame_pct", 0))
if hf:
    chk("half frame left %", hf["left"], round(100 * HALF[2] / 400, 1), 0.3, "%")
    chk("half frame width %", hf["width"], round(100 * (HALF[3] - HALF[2] + 1) / 400, 1), 0.3, "%")

# 8) 多面板：切出 2 个候选并逐面板输出，扁平字段不许静默给错值（R10）
pm = figure_metrics.metrics(panels2)
chk("panel_count", pm.get("panel_count"), 2, 0)
results.append((len(pm.get("panels") or []) == 2, "panels list length", len(pm.get("panels") or []), 2, 0))
results.append((pm.get("frame_pct") is None, "flat frame_pct not polluted by multi-panel", pm.get("frame_pct"), None, 0))
if pm.get("panels"):
    l0 = pm["panels"][0]["frame_pct"]["left"]
    chk("panel1 left %", l0, round(100 * PANELS[0][2] / 600, 1), 0.3, "%")

# 9) 取色口径一致（R11）：同一张图两个取色器必须给一样的 hex 与占比
mr_pal = [(c["hex"], c["frac"]) for c in measure_ref.dominant(arr(base), n=3)]
ep_pal = [(c["hex"], c["frac"]) for c in extract_palette.palette(base, top=3)["colors"]]
results.append((mr_pal == ep_pal, "palette parity measure_ref vs extract_palette", mr_pal, ep_pal, 0))

# 10) 文件名只出 basename（R14：反斜杠路径不许打出整条路径）
results.append((m.get("file") == "base.png", "file is basename only", m.get("file"), "base.png", 0))

# ---- 汇总 ----
bad = [r for r in results if not r[0]]
for ok, name, got, want, tol in results:
    print("%s %-42s got=%s want=%s tol=%s" % ("ok  " if ok else "FAIL", name, got, want, tol))
print("== %d/%d 通过 ==" % (len(results) - len(bad), len(results)))
sys.exit(1 if bad else 0)
