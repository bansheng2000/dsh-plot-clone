"""measure_ref.py — 参考图量测：几何比例 + 取色（复刻第一步，别靠眼睛估）。

用法：
  python measure_ref.py <ref.png>                       # 画布/外框/主色板
  python measure_ref.py <ref.png> --dark 130             # 改暗色阈值（框线更浅时用）
  python measure_ref.py <ref.png> --box name:x0,y0,x1,y1 [...]
  python measure_ref.py --selftest                      # 自检
  python -c "print(1)"                                  # 先确认解释器可用（WindowsApps 的 python 存根静默退出码 49）

设计约束：
- 只读参考图像素，不反推数据（值域红线在 SKILL.md）。
- 颜色报「桶内真实平均色」+ 计数 + 占比，与 extract_palette.py 同一份实现（pixel_core.palette）。
- 坐标一律全图坐标：不做「裁剪再回加偏移」，旧版忘了 +2 导致整体偏 2px 的坑从结构上消失。
- 量不到就说 none，不返回残缺读数。
"""
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


def selftest():
    """契约自检：全图坐标无偏移 / 整行扫描不被旁路色块带偏 / 取色口径一致 / 无框显式 none。"""
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
    print("selftest ok: frame", bb, "| band", bp, "| palette", top)


if __name__ == "__main__":
    setup_stdout()
    if len(sys.argv) > 1 and sys.argv[1] == "--selftest":
        selftest()
        sys.exit(0)
    is_box = re.compile(r"^\w+:\d+,\d+,\d+,\d+$")
    argv = sys.argv[1:]
    dark = pc.DARK
    if "--dark" in argv:
        dark = int(argv[argv.index("--dark") + 1])
    args = [x for x in argv if not x.startswith("--") and not is_box.match(x) and not x.isdigit()]
    boxes = [x for x in argv if is_box.match(x)]
    if not args:
        print(__doc__)
        sys.exit(2)
    report(args[0], boxes, dark)
