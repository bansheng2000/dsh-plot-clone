"""pixel_core.py — 三个量测脚本共用的像素层（阈值 / 取色 / 框检测 / 装饰带 / 刻度 / 点径 / 文字行）。

为什么单独一层：历史上 measure_ref.py 用暗色阈值 <120 + 桶宽 16 + 剔黑白，
figure_metrics.py 用 <130，extract_palette.py 用桶宽 17 + 不剔黑且降采样——
同一张图三个脚本给出不可比的结果。这里只留一份实现，阈值/桶宽/过滤策略全部走参数，
脚本只负责 CLI 与打印。

约定：
- 坐标一律全图坐标（不做裁剪再回加偏移，那类“忘了 +2”的偏移错从结构上消失）。
- 量不到就返回 None，由调用方落成 null + reason，绝不返回 0 或近似值冒充结果。
"""
import sys

import numpy as np
from PIL import Image

DARK = 130        # 暗色阈值：框线/长直线（旧 measure_ref 120 / figure_metrics 130 统一到此）
TEXT_DARK = 160   # 文字与刻度判定（比 DARK 宽，抗抗锯齿）
WHITE = 245       # 近白
BUCKET = 16       # 取色分桶宽度（旧 16 / 17 统一到此）
NEAR_WHITE = 235
NEAR_BLACK = 60


def setup_stdout():
    """cp936 控制台下中文会乱码；能改就改成 utf-8，改不了就算了。"""
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def load(path):
    return np.asarray(Image.open(path).convert("RGB")).astype(int)


def rgb(hexv):
    return np.array([int(hexv[i:i + 2], 16) for i in (1, 3, 5)])


def to_hex(c):
    return "#%02X%02X%02X" % tuple(int(round(v)) for v in c[:3])


def _runs(mask):
    """一维布尔 → [(start, end_inclusive)]。"""
    idx = np.where(mask)[0]
    if len(idx) == 0:
        return []
    out = []
    s = p = int(idx[0])
    for i in idx[1:]:
        i = int(i)
        if i != p + 1:
            out.append((s, p))
            s = i
        p = i
    out.append((s, p))
    return out


# ---------------------------------------------------------------- 取色（R11）

def palette(a, n=12, bucket=BUCKET, min_frac=0.0, skip_white=True, skip_black=True):
    """主色板：桶内**真实平均色** + 计数 + 占比。返回 (colors, filtered_count)。

    门槛只做过滤、不提前截断（旧 extract_palette 用 break，细线色会被整段跳过）；
    filtered 报被 min_frac 挡掉的桶数，调用方据此知道“有东西没显示”，不会误以为图里没有。
    """
    px = a.reshape(-1, 3)
    total = max(1, len(px))
    if skip_white:
        px = px[~(px.min(1) > NEAR_WHITE)]
    if skip_black:
        px = px[~(px.max(1) < NEAR_BLACK)]
    if len(px) == 0:
        return [], 0
    keys = (px // bucket).astype(np.int32)
    flat = keys[:, 0] * 10000 + keys[:, 1] * 100 + keys[:, 2]
    uniq, inv, cnt = np.unique(flat, return_inverse=True, return_counts=True)
    colors, filtered = [], 0
    for i in np.argsort(-cnt):
        frac = cnt[i] / total
        if frac < min_frac:
            filtered += 1
            continue
        if len(colors) >= n:
            break
        avg = px[inv == i].mean(0)
        colors.append({"hex": to_hex(avg), "count": int(cnt[i]), "frac": round(float(frac), 5)})
    return colors, filtered


# ------------------------------------------------------------ 框检测（R3/R10）

def _cluster_hseg(hsegs, tol=3):
    """把横线线段按 x 跨度聚类，再按 y 连续性切段：返回 [{'x0','x1','y0','y1'}]。"""
    groups = []
    for (y, xs, xe) in sorted(hsegs):
        for g in groups:
            if abs(g["x0"] - xs) <= tol and abs(g["x1"] - xe) <= tol and y - g["y1"] <= 2:
                g["y1"] = y
                break
        else:
            groups.append({"x0": xs, "x1": xe, "y0": y, "y1": y})
    return groups


def frame_candidates(a, thr=DARK, pad=2, min_frac=0.25, tol=3, min_area_frac=0.04):
    """按暗线游程切出矩形候选，返回 [{'t','b','l','r'}]（大 → 小）。

    判据：长横线（行内连续暗段 ≥ min_frac×可用宽）+ 长竖线（列内连续暗段 ≥ min_frac×可用高）
    围成的矩形。整幅贴边的暗框（截图外框）被 0.98 规则排除；被别的候选完全包住的
    （图例框、嵌在绘图区里的小框）不算独立面板。半宽/偏心单面板靠“游程”而不是
    “中间列覆盖率”识别，所以不再要求面板居中。
    """
    h, w, _ = a.shape
    dark = a.max(2) < thr
    x0p, x1p = pad, max(pad + 1, w - pad)
    y0p, y1p = pad, max(pad + 1, h - pad)
    min_h = max(20, int(min_frac * (x1p - x0p)))
    min_v = max(20, int(min_frac * (y1p - y0p)))

    hsegs = []
    for y in range(y0p, y1p):
        for (s, e) in _runs(dark[y, x0p:x1p]):
            if e - s + 1 >= min_h:
                hsegs.append((y, s + x0p, e + x0p))
    vsegs = []
    for x in range(x0p, x1p):
        for (s, e) in _runs(dark[y0p:y1p, x]):
            if e - s + 1 >= min_v:
                vsegs.append((x, s + y0p, e + y0p))

    rects = []
    groups = []
    for g in _cluster_hseg(hsegs, tol):                 # 同一 x 跨度的上下边框合成一个候选
        for e in groups:
            if abs(e["x0"] - g["x0"]) <= tol and abs(e["x1"] - g["x1"]) <= tol:
                e["y0"], e["y1"] = min(e["y0"], g["y0"]), max(e["y1"], g["y1"])
                break
        else:
            groups.append(dict(g))
    for e in groups:
        t, b, l, r = e["y0"], e["y1"], e["x0"], e["x1"]
        if b - t < 10 or r - l < 10:
            continue
        left = [x for (x, s, ee) in vsegs if l - tol <= x <= l + tol and s <= t + tol and ee >= b - tol]
        right = [x for (x, s, ee) in vsegs if r - tol <= x <= r + tol and s <= t + tol and ee >= b - tol]
        if not left or not right:
            continue
        rects.append({"t": t, "b": b, "l": min(left), "r": max(right)})

    # 合并同一条边的重复候选（框线粗 2px 时上下两条横线各成一簇）
    merged = []
    for rc in sorted(rects, key=lambda z: -((z["b"] - z["t"]) * (z["r"] - z["l"]))):
        area = (rc["b"] - rc["t"] + 1) * (rc["r"] - rc["l"] + 1)
        if area < min_area_frac * w * h:
            continue
        if (rc["r"] - rc["l"] + 1) >= 0.98 * w or (rc["b"] - rc["t"] + 1) >= 0.98 * h:
            continue                                    # 贴边暗框 = 截图外框，不是绘图区
        keep = True
        for m in merged:                                # 被已有候选包住的（图例框）丢掉
            if m["l"] <= rc["l"] and m["r"] >= rc["r"] and m["t"] <= rc["t"] and m["b"] >= rc["b"]:
                keep = False
                break
        if keep:
            merged.append(rc)
    return merged


def frame_rect(a, thr=DARK, **kw):
    """单面板便捷入口：恰好一个候选才返回，多了返回 None（由调用方显式报多面板）。"""
    c = frame_candidates(a, thr=thr, **kw)
    if len(c) != 1:
        return None
    z = c[0]
    return z["t"], z["b"], z["l"], z["r"]


# -------------------------------------------------------------- 装饰带（R4/R5）

def band(a, t, b, l, r, hexv=None, tol=12, uniform=8, bg=WHITE, min_h=3):
    """装饰带：先按 hex 找纯色行，再找横向均匀的非背景色块（渐变带的兜底）。

    返回 {'top','bot','height_px','pct_plot_h','kind','top_hex','bot_hex'} 或 None。
    kind: solid（hex 命中）/ gradient（行内横向均匀、行间颜色单调变化）/ block（其余均匀色块）。
    判据宁缺勿错：纯色命中高不到色块的一半、又没有可用的均匀色块时返回 None。
    """
    ph = b - t + 1
    y0, y1 = t + 2, b - 1
    if y1 - y0 < min_h:
        return None
    x0 = l + int(0.15 * (r - l))
    x1 = l + int(0.30 * (r - l))
    if x1 - x0 < 3:
        return None
    win = a[y0:y1, x0:x1]

    hex_span = None
    if hexv:
        hit = (np.abs(win - rgb(hexv)).max(2) <= tol).mean(1) > 0.9
        runs = _runs(hit)
        if runs:
            hex_span = max(runs, key=lambda z: z[1] - z[0])

    spread = (win.max(1) - win.min(1)).max(1)          # 每行通道内极差
    not_bg = np.abs(win.mean(1) - bg).max(1) > 12
    uniform_rows = (spread <= uniform) & not_bg
    uruns = [z for z in _runs(uniform_rows) if z[1] - z[0] + 1 >= min_h]
    block = max(uruns, key=lambda z: z[1] - z[0]) if uruns else None

    def pack(span, kind):
        s, e = span
        top_c = win[s].mean(0)
        bot_c = win[e].mean(0)
        return {"top": int(y0 + s), "bot": int(y0 + e),
                "height_px": int(e - s + 1),
                "pct_plot_h": round(100.0 * (e - s + 1) / ph, 2),
                "kind": kind, "top_hex": to_hex(top_c), "bot_hex": to_hex(bot_c)}

    if hex_span and (block is None or (hex_span[1] - hex_span[0] + 1) >= 0.5 * (block[1] - block[0] + 1)):
        return pack(hex_span, "solid")
    if block and hexv:
        inside = win[block[0]:block[1] + 1]
        if np.abs(inside - rgb(hexv)).max(2).min() > tol:
            return None                     # 给的色在这个色块里根本没出现：不许拿别的色冒充
    if block:
        d = pack(block, "block")
        diff = np.abs(rgb(d["bot_hex"]) - rgb(d["top_hex"])).max()
        if diff > 6:
            d["kind"] = "gradient"
        return d
    return None


def white_gap(a, t, b, l, r, band_top):
    """装饰带上方的纯白缝高度。"""
    x0, x1 = l + int(0.15 * (r - l)), l + int(0.30 * (r - l))
    if band_top <= t + 1:
        return 0, 0.0
    white = (a[t:band_top, x0:x1] > WHITE).all(2).mean(1) > 0.9
    idx = np.where(white)[0]
    if len(idx) == 0:
        return 0, 0.0
    seg_end = idx[-1]
    seg_start = seg_end
    while seg_start - 1 in set(idx.tolist()):
        seg_start -= 1
    h = seg_end - seg_start + 1
    return int(h), round(100.0 * h / (b - t + 1), 2)


# ---------------------------------------------------------------- 刻度（R6）

def tick_scan(a, b, l, r, thr=TEXT_DARK, max_len=80):
    """从框底向下（再向上）自适应扫描刻度：遇到第一段空白就停，长度不再被固定窗口截断。

    只统计“从 b+1 起就连续暗”的列，所以下方文字的字形竖笔画进不来（它们从更低的行才开始）。
    返回 {'length','cols','dir','n_cols'} 或 None。
    """
    h = a.shape[0]
    for direction, step in (("out", 1), ("in", -1)):
        start = b + 1 if step > 0 else b - 1
        rows = [start + step * i for i in range(max_len)]
        rows = [y for y in rows if 0 <= y < h]
        if len(rows) < 3:
            continue
        strip = (a[rows][:, l:r + 1].max(2) < thr)
        lens, cols = [], []
        for c in range(strip.shape[1]):
            x = l + c
            if x <= l + 2 or x >= r - 2:
                continue            # 左右边框本身就是长暗列，不是刻度（内刻度扫描会假命中）
            col = strip[:, c]
            n = 0
            while n < len(col) and col[n]:
                n += 1
            if 2 <= n < max_len:
                lens.append(n)
                cols.append(x)
        if lens:
            return {"length": int(np.median(lens)), "cols": cols, "dir": direction,
                    "n_cols": len(lens)}
    return None


def tick_length(a, b, l, r, **kw):
    t = tick_scan(a, b, l, r, **kw)
    return t["length"] if t else 0


# ---------------------------------------------------------------- 点径（R7）

def dot_diameter(a, t, b, l, r, hexv, tol=26, max_frac=0.06):
    """散点直径：匹配色区域的**最大横向游程**（圆的弦长最大值 = 直径）。

    旧实现取了 1..12 的游程中位数，大点被丢弃（20px 报 8.0）；也不再用“每 3 行取样”
    导致漏掉最宽的那一行。过长的游程（同色实线）按 max_frac×绘图宽 排除。
    """
    pw = r - l + 1
    cap = max(24, int(max_frac * pw))
    sub = (np.abs(a[t:b + 1, l:r + 1] - rgb(hexv)).max(2) <= tol)
    lens = []
    for row in sub:
        for (s, e) in _runs(row):
            n = e - s + 1
            if 2 <= n <= cap:
                lens.append(n)
    if not lens:
        return None
    d = max(lens)
    if sum(1 for n in lens if n >= 0.9 * d) < 2:      # 孤立长游程 = 噪声/斜线，退回分位数
        d = float(np.percentile(lens, 90))
    return round(float(d), 1)


# -------------------------------------------------------------- 文字行（R8）

def text_groups_below(a, b, l, r, thr=TEXT_DARK, scan=160, tick_len=0, tick_cols=None):
    """框下方文字行分段，带 kind：先用刻度掩码剔掉刻度，再分段。

    kind: label（刻度标签）/ title（轴标题：更高，或与前一段隔开一大段空白）。
    刻度残留（掩码没覆盖到的行）标 tick，调用方据此知道“这不是字”。
    """
    h = a.shape[0]
    y0 = b + 1 + max(0, tick_len)                      # 刻度行整段跳过
    y1 = min(h, y0 + scan)
    if y1 - y0 < 2:
        return []
    mask = (a[y0:y1, l:r].max(2) < thr)
    if tick_cols:
        idx = [c - l for c in tick_cols if l <= c < r]
        if idx:
            mask[:, idx] = False
    dark = mask.mean(1) > 0.002
    groups = []
    for (s, e) in _runs(dark):
        if e - s + 1 >= 2:
            groups.append({"top": int(y0 + s), "bot": int(y0 + e), "height_px": int(e - s + 1)})
    if not groups:
        return []
    label_h = groups[0]["height_px"]
    prev_bot = None
    for i, g in enumerate(groups):
        if i == 0:
            g["kind"] = "label"
        elif g["height_px"] >= 1.3 * label_h or (prev_bot is not None and g["top"] - prev_bot > 1.8 * label_h):
            g["kind"] = "title"
        else:
            g["kind"] = "label"
        prev_bot = g["bot"]
    return groups
