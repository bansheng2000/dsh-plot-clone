"""verify_deliverable.py — 交付三件套的**文件层**检查（不读 Origin 对象属性）。

用法：
  python verify_deliverable.py 成品.png 成品.pdf 成品.opju [--min-width 1800]
  python verify_deliverable.py --selftest

只管四件事：三个文件都存在、非空字节、三者同 basename、PNG 宽 >= --min-width。
Origin 图里的对象属性（系列数/字号/图例位置）是 origin_verify_graph 的活，
本脚本不猜、不读、不假装能读。
rc: 0 = 全过, 4 = 有 FAIL, 2 = 用法错误。
"""
import os
import sys

from PIL import Image

from pixel_core import setup_stdout

RC_OK, RC_FAIL, RC_USAGE = 0, 4, 2
DEFAULT_MIN_WIDTH = 1800


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
    else:
        try:
            with Image.open(png) as im:
                width = im.size[0]
        except Exception as exc:                     # 读不了就 FAIL，不猜
            rows.append({"check": "width", "target": png, "pass": False,
                         "detail": "unreadable png: %s" % exc})
        else:
            rows.append({"check": "width", "target": png, "pass": width >= min_width,
                         "detail": "%d px (min %d)" % (width, min_width)})
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
        print("   %s %-8s %s  %s"
              % ("PASS" if r["pass"] else "FAIL", r["check"], r["target"], r["detail"]))
    passed = sum(1 for r in rows if r["pass"])
    ok = passed == len(rows)
    print("   STATUS %s (%d/%d)" % ("PASS" if ok else "FAIL", passed, len(rows)))
    return RC_OK if ok else RC_FAIL


def selftest():
    """四种场景各断言 rc 与输出：缺文件 / basename 不一致 / 宽度不够 / 全过。"""
    import contextlib
    import io
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

    # 1) 全过：3 个文件 + basename + width = 5 项
    ok_png, ok_pdf, ok_opju = png("fig.png"), doc("fig.pdf"), doc("fig.opju")
    rc, out, _ = run(ok_png, ok_pdf, ok_opju, "--min-width", "1800")
    assert rc == RC_OK and "STATUS PASS (5/5)" in out, (rc, out)
    width_line = [ln for ln in out.splitlines()
                  if ln.strip().startswith(("PASS width", "FAIL width"))][0]
    assert "1800 px (min 1800)" in width_line, width_line

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

    print("selftest ok: pass rc=0 (5/5, width 1800 px) | missing rc=4 | "
          "basename differ rc=4 | width 1200 rc=4 | usage rc=2")
    return 0


if __name__ == "__main__":
    setup_stdout()
    if "--selftest" in sys.argv[1:]:
        sys.exit(selftest())
    sys.exit(main(sys.argv[1:]))
