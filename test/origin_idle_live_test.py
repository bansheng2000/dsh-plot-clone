#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""origin_idle_live_test.py — 真机联调：空闲自动释放对真实 Origin 的效果

会真的连接本机 Origin（首次约 5~45 秒），并真的把窗口显示出来；跑完会 release。
跑法：python test/origin_idle_live_test.py [--idle 3]
"""

from __future__ import annotations

import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "server"))

import origin_engine as engine  # noqa: E402
import origin_idle  # noqa: E402


def main(argv=None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    idle = 3.0
    if "--idle" in argv:
        idle = float(argv[argv.index("--idle") + 1])

    logs = []
    assert engine.is_connected() is False, "前置：连之前 is_connected 必须是 False"

    print("[live] 连接 Origin ...", flush=True)
    st = engine.status()          # @_synchronized：真连（进程内首次会拉起 Origin）
    assert st.get("ok"), st
    procs_before = engine._origin_proc_count()
    print("[live] connected=%s procs=%s detail=%s"
          % (engine.is_connected(), procs_before, st.get("detail")), flush=True)
    assert engine.is_connected() is True

    rel = origin_idle.IdleReleaser(idle, engine.release, log=logs.append,
                                   is_connected=engine.is_connected)
    rel.begin_call()
    rel.end_call()
    t0 = time.time()
    released = False
    while time.time() - t0 < idle + 15:
        if rel.tick():
            released = True
            break
        time.sleep(0.25)
    elapsed = time.time() - t0

    assert released, "到点未释放"
    assert engine.is_connected() is False, "释放后必须报未连接"
    procs_after = engine._origin_proc_count()
    assert procs_after >= 1, "释放不该杀掉 Origin 进程"
    print("[live] 释放于 %.1fs（阈值 %.1fs）procs %s→%s"
          % (elapsed, idle, procs_before, procs_after), flush=True)
    print("[live] 日志: %s" % (logs[-1] if logs else "(none)"), flush=True)

    st2 = engine.status()         # 下一次调用自动重连
    assert st2.get("ok") and engine.is_connected() is True, "下一次调用应自动重连"
    print("[live] 重连 OK detail=%s" % st2.get("detail"), flush=True)

    engine.release()              # 收尾：把窗口交回用户
    print("origin_idle live ok: 空闲 %.1fs → release → status 未连接 → 下一次调用重连；"
          "进程 %s→%s 未被杀" % (idle, procs_before, procs_after))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
