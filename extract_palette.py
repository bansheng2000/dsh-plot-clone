"""extract_palette.py — 参考图取色：分桶统计主色，输出 hex + 计数 + 占比 + 尺寸。

用法：
    python extract_palette.py 参考图.png [--top 8] [--min-frac 0.005] [--keep-dark] [--selftest]
    python -c "print(1)"          # 先确认解释器可用（WindowsApps 的 python 存根静默退出码 49）

口径与 measure_ref.py 完全一致（同一份 pixel_core.palette：桶宽 16、剔近白 >235 与近黑 <60）。
- 全图统计，**不缩放**：旧版 NEAREST 缩到 400px 宽，2000px 图里 2px 的细线（0.1%）会被整条丢掉，
  只剩 #FFFFFF；面积平均缩放在细线处也会混色。图大就当图大，别偷偷丢像素。
- 门槛只过滤、不提前截断：`--min-frac` 挡掉的桶数会单独报出来，别把「被门槛挡住」当成「图里没有」。
"""
import sys

import pixel_core as pc
from pixel_core import setup_stdout

BUCKET = pc.BUCKET


def palette(path, top=8, min_frac=0.0, keep_dark=False):
    """返回 {'size': [w,h], 'colors': [{hex,count,frac}], 'filtered': N}。"""
    a = pc.load(path)
    h, w, _ = a.shape
    colors, filtered = pc.palette(a, n=top, min_frac=min_frac, skip_black=not keep_dark)
    return {"size": [w, h], "colors": colors, "filtered": filtered}


def selftest():
    """契约自检：细线不被缩放吃掉 / 门槛外项数可见 / 桶内平均色还原真色。"""
    import os
    import tempfile

    import numpy as np
    from PIL import Image

    d = tempfile.gettempdir()
    p1 = os.path.join(d, "_origin_palette_selftest.png")
    im = Image.new("RGB", (100, 100), "white")
    from PIL import ImageDraw
    dr = ImageDraw.Draw(im)
    dr.rectangle([0, 0, 49, 99], fill=(255, 0, 0))
    dr.rectangle([50, 0, 99, 99], fill=(0, 0, 255))
    im.save(p1)
    got = palette(p1, top=4)
    hexes = [c["hex"] for c in got["colors"]]
    assert got["size"] == [100, 100], got
    assert set(hexes[:2]) == {"#FF0000", "#0000FF"}, got
    assert abs(got["colors"][0]["frac"] - 0.5) < 0.01, got

    # 2000x400 图上 2px 红线（0.1%）：旧版缩放后直接消失
    a = np.full((400, 2000, 3), 255, np.uint8)
    a[:, 1000:1002] = (255, 0, 0)
    p2 = os.path.join(d, "_origin_thinline_selftest.png")
    Image.fromarray(a).save(p2)
    thin = palette(p2, top=8)
    red = [c for c in thin["colors"] if c["hex"] == "#FF0000"]
    assert red and abs(red[0]["frac"] - 0.001) < 1e-4, thin["colors"]
    # 门槛 0.5% 挡掉它，但必须报出被挡的桶数（不许静默消失）
    thr = palette(p2, top=8, min_frac=0.005)
    assert not [c for c in thr["colors"] if c["hex"] == "#FF0000"], thr["colors"]
    assert thr["filtered"] >= 1, thr
    print("selftest ok:", hexes, "| thin line", red[0]["frac"], "| filtered", thr["filtered"])
    return 0


def main(argv):
    if "--selftest" in argv:
        return selftest()
    files, opts, i = [], {}, 0
    while i < len(argv):
        a = argv[i]
        if a in ("--top", "--min-frac"):
            if i + 1 >= len(argv):
                print("ERROR: %s needs a value" % a, file=sys.stderr)
                return 2
            opts[a] = float(argv[i + 1]) if a == "--min-frac" else int(argv[i + 1])
            i += 2
        elif a == "--keep-dark":
            opts[a] = True
            i += 1
        elif a.startswith("--"):
            print("ERROR: unknown option %s" % a, file=sys.stderr)
            return 2
        else:
            files.append(a)
            i += 1
    if not files:
        print(__doc__)
        return 2
    r = palette(files[0], top=opts.get("--top", 8),
                min_frac=opts.get("--min-frac", 0.0), keep_dark=opts.get("--keep-dark", False))
    print("size: %dx%d" % tuple(r["size"]))
    for c in r["colors"]:
        print("%s  %6d  %.2f%%" % (c["hex"], c["count"], c["frac"] * 100))
    if r["filtered"]:
        print("filtered: %d bucket(s) below min_frac" % r["filtered"])
    return 0


if __name__ == "__main__":
    setup_stdout()
    raise SystemExit(main(sys.argv[1:]))
