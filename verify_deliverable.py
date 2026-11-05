"""verify_deliverable.py — 交付三件套的**文件层**检查（不读 Origin 对象属性）。

用法：
  python verify_deliverable.py 成品.png 成品.pdf 成品.opju [--min-width 1800]
  python verify_deliverable.py --selftest

只管五件事：三个文件都存在、非空字节、三者同 basename、PNG 宽 >= --min-width、
PNG 上没有 Origin demo 水印。
Origin 图里的对象属性（系列数/字号/图例位置）是 origin_verify_graph 的活，
本脚本不猜、不读、不假装能读。
rc: 0 = 全过, 4 = 有 FAIL, 2 = 用法错误。

## 水印检查为什么这样写

Origin 未授权时会往**整幅画布**平铺青色 `demo`，导出图直接不可用。这里不能用
「青色像素多不多」判定：一张本来就画了青色柱/线的图同样会命中。

2026-11-03 在真水印图上量的真值（`templates/evidence/bar.png`，1200×850）：
  · 主色 **#00FFFF**（5745 px），抗锯齿边缘为 #3AFFFF / #66FFFF / #00E9FF / #00FFF2
  · 行方向 **8 条文字带**，带间距恒定 **72 px**（scatter 同样 8 条/72 px；
    xrd 84 px、forest 72 px，抖动系数 ≤ 0.34）
  · 覆盖面积仅 **0.62%–0.88%**（字很细，按面积数会漏）

对照实验（同样 1200×850，2026-11-03/04 实测）：

| 样本 | 行带 | 间距 cv | **行剖面自相关峰值** | 覆盖面积 |
|---|---|---|---|---|
| bar（水印） | 8 | 0.00 | **0.841**（lag 72） | 0.80% |
| scatter（水印） | 8 | 0.00 | **0.838**（lag 72） | 0.63% |
| xrd（水印） | 8 | 0.16 | **0.662**（lag 84） | 0.88% |
| forest（水印） | 9 | 0.34 | **0.838**（lag 72） | 0.62% |
| heatmap（水印） | 14 | 0.72 | **0.871**（lag 72） | 0.55% |
| 纯白图 | 0 | – | 0.000 | 0.00% |
| 青色数据图（3 青柱 + 青线） | **2** | – | 0.711 | 14.96% |
| 人工叠 demo 网格 | 13 | 0.00 | **0.923**（lag 70） | 0.37% |

**为什么用自相关而不是间距抖动**：热图那类图上，水印文字叠在同色（浅青）格子上会融进去，
行带间距被打乱（cv 0.72），第一版按 cv≤0.5 判就把 heatmap.png **漏判了**——这是实测踩到的洞。
行剖面自相关对「整幅等周期重复」敏感、对缓慢包络（色块明暗）不敏感，所以改成
`行带 ≥ 5 且自相关峰值 ≥ 0.6`。青色数据图自相关也有 0.711，但它的行带只有 2 条
（整块色块，不是一行行文字），被行带数挡住。

判据：行带 ≥ 5 条 + 带间距 ≥ 4 个且中位数 ≥ 40 px + **自相关峰值 ≥ 0.6** +
覆盖面积 < 10% + 行带纵跨 ≥ 半图。
"""
import os
import sys

from PIL import Image, ImageChops

from pixel_core import setup_stdout

RC_OK, RC_FAIL, RC_USAGE = 0, 4, 2
DEFAULT_MIN_WIDTH = 1800

# 水印主色与容差（实测 #00FFFF，抗锯齿会往 #3AFFFF/#66FFFF/#00E9FF 漂）
WATERMARK_RGB = (0, 255, 255)
WATERMARK_TOL = 48
# 结构判据（阈值来自上面的对照实验，不是拍的）
WM_MIN_BANDS = 5          # 行方向文字带最少条数（真水印 8–9，青色数据 2）
WM_MIN_GAPS = 4           # 参与周期性判定所需的最少带间距个数
WM_MIN_GAP_PX = 40        # 带间距中位数下限（真水印 72–125 px）
WM_MIN_ACF = 0.6          # 行剖面自相关峰值下限（真水印 0.66–0.92，纯白 0.00）
WM_ACF_LAG = (40, 130)    # 自相关搜索的滞后区间（水印周期实测 54–84 px）
WM_MAX_AREA = 0.10        # 覆盖面积上限；超过视为「青色数据」而不是水印


def _wm_mask(im):
    """青色掩膜（L 模式，命中 255）。用通道点运算走 C 层，避免逐像素 Python 循环。"""
    r, g, b = im.split()
    lo, hi = WATERMARK_TOL, 255 - WATERMARK_TOL
    mr = r.point(lambda v: 255 if v <= lo else 0)
    mg = g.point(lambda v: 255 if v >= hi else 0)
    mb = b.point(lambda v: 255 if v >= hi else 0)
    return ImageChops.multiply(ImageChops.multiply(mr, mg), mb)


def _counts_per_line(mask):
    """沿「行」统计每行命中数（对转置图调用即得每列命中数）。"""
    w, h = mask.size
    data = mask.tobytes()
    return [data[y * w:(y + 1) * w].count(255) for y in range(h)]


def _runs(values, thr):
    """连续命中区间 [(start, end), ...]；thr 以下视为断开。"""
    out, start = [], None
    for i, v in enumerate(values):
        if v >= thr and start is None:
            start = i
        elif v < thr and start is not None:
            out.append((start, i - 1))
            start = None
    if start is not None:
        out.append((start, len(values) - 1))
    return out


def _gap_stats(bands):
    gaps = [bands[i + 1][0] - bands[i][0] for i in range(len(bands) - 1)]
    if not gaps:
        return [], None, None
    mean = sum(gaps) / len(gaps)
    std = (sum((g - mean) ** 2 for g in gaps) / len(gaps)) ** 0.5
    return gaps, sorted(gaps)[len(gaps) // 2], (std / mean if mean else 9.9)


def _autocorr_peak(values, lag_range=WM_ACF_LAG):
    """行剖面的自相关峰值（归一化）。等周期重复的水印文字会在这里出峰，
    缓慢变化的色块包络不会。返回 (峰值, 对应滞后)。"""
    n = len(values)
    if n < 3:
        return 0.0, None
    mean = sum(values) / n
    centered = [v - mean for v in values]
    denom = sum(x * x for x in centered)
    if denom <= 0:
        return 0.0, None
    lo, hi = lag_range
    best, best_lag = 0.0, None
    for lag in range(lo, min(hi, n - 1) + 1):
        num = sum(centered[i] * centered[i + lag] for i in range(n - lag))
        coef = num / denom
        if coef > best:
            best, best_lag = coef, lag
    return best, best_lag


def watermark_report(png_path):
    """返回水印判定结果。读不了图也返回 dict，由调用方决定怎么报。"""
    try:
        with Image.open(png_path) as src:
            im = src.convert("RGB")
    except Exception as exc:                          # 读不了就 FAIL，不猜
        return {"readable": False, "is_watermark": False, "detail": "unreadable: %s" % exc}
    w, h = im.size
    mask = _wm_mask(im)
    row_counts = _counts_per_line(mask)
    col_counts = _counts_per_line(mask.transpose(Image.TRANSPOSE))
    total = sum(row_counts)
    area = total / float(w * h) if w and h else 0.0
    bands = _runs(row_counts, max(3, int(w * 0.004)))
    col_bands = _runs(col_counts, max(3, int(h * 0.004)))
    gaps, median_gap, cv = _gap_stats(bands)
    acf, acf_lag = _autocorr_peak(row_counts)
    span = (bands[-1][0] - bands[0][0]) if len(bands) >= 2 else 0
    periodic = (
        len(bands) >= WM_MIN_BANDS
        and len(gaps) >= WM_MIN_GAPS
        and median_gap is not None and median_gap >= WM_MIN_GAP_PX
        and acf >= WM_MIN_ACF
        and area < WM_MAX_AREA
        and span >= h * 0.5
    )
    detail = ("mask %d px (%.2f%%), row bands %d, col bands %d, median gap %s px, "
              "acf %.2f@%s, cv %s"
              % (total, area * 100.0, len(bands), len(col_bands),
                 "-" if median_gap is None else "%d" % median_gap,
                 acf, "-" if acf_lag is None else acf_lag,
                 "-" if cv is None else "%.2f" % cv))
    return {"readable": True, "is_watermark": bool(periodic), "detail": detail,
            "mask_px": total, "area": area, "bands": len(bands),
            "col_bands": len(col_bands), "median_gap": median_gap, "cv": cv,
            "acf": acf, "acf_lag": acf_lag}


def inspect(paths, min_width=DEFAULT_MIN_WIDTH):
    """返回 [{check, target, pass, detail}]，一条一项，不做短路。"""
    rows = []
    for p in paths:
        if not os.path.isfile(p):
            rows.append({"check": "file", "target": p, "pass": False, "detail": "missing"})
            continue
        size = os.path.getsize(p)
        rows.append({"check": "file", "target": p, "pass": size > 0,
                     "detail": "%d bytes" % size if size > 0 else "empty (0 bytes)"})
    stems = [os.path.splitext(os.path.basename(p))[0].lower() for p in paths]
    same = len(set(stems)) == 1
    rows.append({"check": "basename", "target": ",".join(stems), "pass": same,
                 "detail": ("%s (%d files)" % (stems[0], len(stems))) if same
                 else "differ: %s" % ", ".join(stems)})
    png = next((p for p in paths if p.lower().endswith(".png")), None)
    if png is None:
        rows.append({"check": "width", "target": "(no .png in inputs)", "pass": False,
                     "detail": "cannot measure width"})
        rows.append({"check": "watermark", "target": "(no .png in inputs)", "pass": False,
                     "detail": "cannot inspect watermark"})
        return rows
    try:
        with Image.open(png) as im:
            width = im.size[0]
    except Exception as exc:                     # 读不了就 FAIL，不猜
        rows.append({"check": "width", "target": png, "pass": False,
                     "detail": "unreadable png: %s" % exc})
    else:
        rows.append({"check": "width", "target": png, "pass": width >= min_width,
                     "detail": "%d px (min %d)" % (width, min_width)})

    wm = watermark_report(png)
    if not wm["readable"]:
        rows.append({"check": "watermark", "target": png, "pass": False,
                     "detail": wm["detail"]})
    elif wm["is_watermark"]:
        rows.append({"check": "watermark", "target": png, "pass": False,
                     "detail": "检测到 Origin demo 水印，导出图不可用（%s）" % wm["detail"]})
    else:
        rows.append({"check": "watermark", "target": png, "pass": True,
                     "detail": "no tiled watermark (%s)" % wm["detail"]})
    return rows


def main(argv):
    paths, min_width, i = [], DEFAULT_MIN_WIDTH, 0
    while i < len(argv):
        a = argv[i]
        if a == "--min-width":
            if i + 1 >= len(argv) or not argv[i + 1].isdigit() or int(argv[i + 1]) <= 0:
                print("ERROR: --min-width needs a positive integer", file=sys.stderr)
                return RC_USAGE
            min_width = int(argv[i + 1])
            i += 2
        elif a.startswith("--"):
            print("ERROR: unknown option %s" % a, file=sys.stderr)
            return RC_USAGE
        else:
            paths.append(a)
            i += 1
    if len(paths) != 3:
        print("ERROR: need exactly 3 files (PNG + PDF + OPJU), got %d" % len(paths),
              file=sys.stderr)
        return RC_USAGE
    rows = inspect(paths, min_width)
    print("== verify-deliverable %d files | min width %d" % (len(paths), min_width))
    for r in rows:
        print("   %s %-9s %s  %s"
              % ("PASS" if r["pass"] else "FAIL", r["check"], r["target"], r["detail"]))
    passed = sum(1 for r in rows if r["pass"])
    ok = passed == len(rows)
    print("   STATUS %s (%d/%d)" % ("PASS" if ok else "FAIL", passed, len(rows)))
    return RC_OK if ok else RC_FAIL


def selftest():
    """六种场景各断言 rc 与输出：缺文件 / basename 不一致 / 宽度不够 / 全过 /
    青色数据不误报 / 水印必须被抓住（合成叠加 + 真水印图）。"""
    import contextlib
    import io
    import shutil
    import tempfile

    d = tempfile.mkdtemp(prefix="_verify_deliverable_")

    def png(name, width=1800, height=1200):
        p = os.path.join(d, name)
        Image.new("RGB", (width, height), "white").save(p)
        return p

    def doc(name, n=16):
        p = os.path.join(d, name)
        with open(p, "wb") as fh:
            fh.write(b"x" * n)
        return p

    def run(*argv):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            rc = main(list(argv))
        return rc, out.getvalue(), err.getvalue()

    def cyan_data_png(name, width=1800, height=1200):
        """青色数据图：3 根大青柱 + 1 条青线 —— 图里本来就有青色，绝不能被当成水印。"""
        from PIL import ImageDraw
        im = Image.new("RGB", (width, height), "white")
        dr = ImageDraw.Draw(im)
        for x in (300, 750, 1200):
            dr.rectangle([x, 400, x + 180, 1000], fill=(0, 255, 255))
        dr.line([(150, 280), (1650, 330)], fill=(0, 255, 255), width=10)
        p = os.path.join(d, name)
        im.save(p)
        return p

    def watermarked_png(name, width=1800, height=1200):
        """在干净图上人工叠等间距 demo 网格 —— 反例必须被判成水印。"""
        from PIL import ImageDraw
        im = Image.new("RGB", (width, height), "white")
        dr = ImageDraw.Draw(im)
        for y in range(0, height, 70):
            for x in range(0, width, 160):
                dr.text((x, y), "demo", fill=(0, 255, 255))
        p = os.path.join(d, name)
        im.save(p)
        return p

    def hard_watermarked_png(name, width=1800, height=1200):
        """硬案例：水印叠在同色浅青格子上 + 行间距被打乱（heatmap 当年漏判的形态）。

        证据图 2026-11-05 已全部清成无水印，所以这里自造这个形态，不再依赖仓库里的历史图。
        """
        from PIL import ImageDraw
        im = Image.new("RGB", (width, height), "white")
        dr = ImageDraw.Draw(im)
        cell = 40
        for gy in range(0, height, cell):
            for gx in range(0, width, cell):
                if (gx // cell + gy // cell) % 2 == 0:
                    dr.rectangle([gx, gy, gx + cell - 1, gy + cell - 1], fill=(220, 250, 250))
        y, k = 4, 0
        while y < height - 10:
            for x in range(0, width, 150):
                dr.text((x + (k % 3) * 6, y), "demo", fill=(0, 255, 255))
            k += 1
            y += 72
        p = os.path.join(d, name)
        im.save(p)
        return p

    try:
        # 1) 全过：3 个文件 + basename + width + watermark = 6 项
        ok_png, ok_pdf, ok_opju = png("fig.png"), doc("fig.pdf"), doc("fig.opju")
        rc, out, _ = run(ok_png, ok_pdf, ok_opju, "--min-width", "1800")
        assert rc == RC_OK and "STATUS PASS (6/6)" in out, (rc, out)
        width_line = [ln for ln in out.splitlines()
                      if ln.strip().startswith(("PASS width", "FAIL width"))][0]
        assert "1800 px (min 1800)" in width_line, width_line
        wm_line = [ln for ln in out.splitlines() if " watermark " in ln][0]
        assert "PASS" in wm_line and "no tiled watermark" in wm_line, wm_line

        # 2) 缺文件
        rc, out, _ = run(png("miss.png"), doc("miss.pdf"), os.path.join(d, "nope.opju"))
        assert rc == RC_FAIL and "missing" in out and "STATUS FAIL" in out, (rc, out)

        # 3) basename 不一致
        rc, out, _ = run(png("one.png"), doc("one.pdf"), doc("two.opju"))
        assert rc == RC_FAIL and "basename" in out and "differ" in out, (rc, out)

        # 4) 宽度不够
        rc, out, _ = run(png("narrow.png", 1200), doc("narrow.pdf"), doc("narrow.opju"))
        assert rc == RC_FAIL and "1200 px (min 1800)" in out, (rc, out)

        # 5) 用法错误
        rc, _, _ = run(ok_png, ok_pdf)
        assert rc == RC_USAGE, rc
        rc, _, _ = run(ok_png, ok_pdf, ok_opju, "--min-width", "abc")
        assert rc == RC_USAGE, rc

        # 6) 青色数据不误报（面积大但行带少）
        cy = cyan_data_png("cyan.png")
        rep = watermark_report(cy)
        assert rep["readable"] and rep["is_watermark"] is False, rep
        assert rep["area"] > 0.05, rep                     # 确实有大片青色
        assert rep["bands"] < WM_MIN_BANDS, rep            # 但不成行带
        rc, out, _ = run(cy, doc("cyan.pdf"), doc("cyan.opju"))
        assert rc == RC_OK and "no tiled watermark" in out, (rc, out)
        print("cyan-data  -> not watermark | %s" % rep["detail"])

        # 7) 人工叠水印：必须 FAIL，且报文写清不可用
        wm_png = watermarked_png("wm.png")
        rep = watermark_report(wm_png)
        assert rep["is_watermark"] is True, rep
        rc, out, _ = run(wm_png, doc("wm.pdf"), doc("wm.opju"))
        assert rc == RC_FAIL, (rc, out)
        assert "检测到 Origin demo 水印，导出图不可用" in out, out
        print("overlay    -> watermark   | %s" % rep["detail"])

        # 8) 硬案例：水印叠在同色浅青格子上、行间距被打乱（当年 heatmap 漏判的形态）。
        hard = hard_watermarked_png("hard.png")
        rep = watermark_report(hard)
        assert rep["is_watermark"] is True, rep
        rc, out, _ = run(hard, doc("hard.pdf"), doc("hard.opju"), "--min-width", "1000")
        assert rc == RC_FAIL and "检测到 Origin demo 水印" in out, (rc, out)
        print("hard-cyan  -> watermark   | %s" % rep["detail"])

        # 9) 仓库证据图必须是干净图：谁再塞回带水印的证据图，这条就红。
        root = os.path.dirname(os.path.abspath(__file__))
        clean = 0
        for name in ("bar", "heatmap", "xrd"):
            real = os.path.join(root, "templates", "evidence", name + ".png")
            if not os.path.isfile(real):
                print("clean %-7s -> SKIPPED (templates/evidence/%s.png 不存在)" % (name, name))
                continue
            rep = watermark_report(real)
            assert rep["is_watermark"] is False, ("证据图被水印污染了", name, rep)
            clean += 1
            print("clean %-7s -> not watermark | %s" % (name, rep["detail"]))
        assert clean >= 2, "证据图干净回归用例至少要命中 2 张，实际 %d" % clean

        print("selftest ok: pass rc=0 (6/6, width 1800 px) | missing rc=4 | "
              "basename differ rc=4 | width 1200 rc=4 | usage rc=2 | "
              "cyan-data no-false-positive | overlay watermark rc=4 | hard watermark rc=4 | "
              "evidence 图无水印")
        return 0
    finally:
        shutil.rmtree(d, ignore_errors=True)


if __name__ == "__main__":
    setup_stdout()
    if "--selftest" in sys.argv[1:]:
        sys.exit(selftest())
    sys.exit(main(sys.argv[1:]))
