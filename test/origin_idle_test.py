#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""origin_idle_test.py — 空闲自动释放的红绿自检（不连 Origin、不碰 COM）

跑法：python test/origin_idle_test.py
说明：用假时钟 + 假引擎钉住契约；真实 Origin 的「释放后 status 未连接 / 下一次
调用自动重连」由 test/origin_idle_live_test.py（真连）覆盖。
"""

from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "server"))

from origin_idle import (  # noqa: E402
    DEFAULT_IDLE_SECONDS,
    ENV_NAME,
    IdleReleaser,
    idle_seconds_from_env,
)

checks = 0


def ok(label, detail=""):
    global checks
    checks += 1
    print("ok %d - %s%s" % (checks, label, (" | " + detail) if detail else ""))


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


class FakeEngine:
    """模拟引擎的延迟重连：release 只清引用，下一次 tool_call 才 connect。"""

    def __init__(self):
        self.connected = False
        self.connect_calls = 0
        self.release_calls = 0

    def connect(self):
        self.connect_calls += 1
        self.connected = True

    def release(self):
        self.release_calls += 1
        self.connected = False

    def status(self):
        return {"connected": self.connected}

    def is_connected(self):
        return self.connected

    def tool_call(self):
        if not self.connected:
            self.connect()
        return {"ok": True}


def make(idle, clock, engine, logs=None):
    sink = logs if logs is not None else []
    return IdleReleaser(idle, engine.release, clock=clock,
                        log=sink.append), sink


def main():
    # 1) 到点调用 release（阈值前不释放，到点释放一次）
    clock, engine = FakeClock(), FakeEngine()
    releaser, logs = make(10, clock, engine)
    releaser.begin_call()
    releaser.end_call()
    clock.advance(9)
    first = releaser.tick()
    calls_after_first = engine.release_calls
    clock.advance(2)
    second = releaser.tick()
    assert first is False and calls_after_first == 0, "阈值内不许释放"
    assert second is True and engine.release_calls == 1, "到点必须释放且只释放一次"
    ok("到点调用 release", "9s=no, 11s=yes, release_calls=%d" % engine.release_calls)

    # 2) 正在调用时不触发（哪怕超过阈值很久）
    clock, engine = FakeClock(), FakeEngine()
    releaser, _ = make(10, clock, engine)
    releaser.begin_call()
    clock.advance(1000)
    during = releaser.tick()
    assert during is False and engine.release_calls == 0, "调用进行中绝不能释放"
    releaser.end_call()
    clock.advance(10)
    after = releaser.tick()
    assert after is True and engine.release_calls == 1, "调用结束后重新计时"
    ok("正在调用时不触发", "during=%s after=%s release_calls=%d"
       % (during, after, engine.release_calls))

    # 3) DSH_ORIGIN_IDLE_RELEASE=0 关闭
    clock, engine = FakeClock(), FakeEngine()
    releaser, _ = make(0, clock, engine)
    clock.advance(10 ** 6)
    assert releaser.enabled is False, "0 必须关闭（enabled 应为 False）"
    assert releaser.tick() is False and engine.release_calls == 0, "0 关闭后 tick 绝不许释放"
    ok("0 关闭", "enabled=%s releases=%d" % (releaser.enabled, engine.release_calls))

    # 4) release 后 status 报未连接
    clock, engine = FakeClock(), FakeEngine()
    engine.connect()
    assert engine.status()["connected"] is True
    releaser, _ = make(5, clock, engine)
    releaser.begin_call(); releaser.end_call()
    clock.advance(6)
    assert releaser.tick() is True, "到点必须释放（status 用例）"
    assert engine.status()["connected"] is False, "释放后必须显示未连接"
    ok("release 后 status 未连接", "connected=%s" % engine.status()["connected"])

    # 5) release 后下一次调用能重连
    before = engine.connect_calls
    engine.tool_call()
    assert engine.status()["connected"] is True
    assert engine.connect_calls == before + 1, "下一次调用应触发一次重连"
    ok("release 后下一次调用能重连", "connect_calls=%d" % engine.connect_calls)

    # 6) 不重复释放
    clock.advance(100)
    assert releaser.tick() is False and engine.release_calls == 1, "已释放后不许重复释放"
    ok("已释放后不重复释放", "release_calls=%d" % engine.release_calls)

    # 7) 环境变量解析
    cases = [
        ({}, DEFAULT_IDLE_SECONDS),
        ({ENV_NAME: "30"}, 30.0),
        ({ENV_NAME: "0"}, 0.0),
        ({ENV_NAME: "abc"}, DEFAULT_IDLE_SECONDS),
        ({ENV_NAME: "-5"}, 0.0),
        ({ENV_NAME: "  "}, DEFAULT_IDLE_SECONDS),
    ]
    for env, expected in cases:
        got = idle_seconds_from_env(env)
        assert got == expected, "env %r -> %r != %r" % (env, got, expected)
    ok("环境变量解析", "default=%ds" % DEFAULT_IDLE_SECONDS)

    # 8) 日志只写注入的 sink（真实实现里是 stderr），且含阈值
    clock, engine = FakeClock(), FakeEngine()
    releaser, logs = make(7, clock, engine)
    releaser.begin_call(); releaser.end_call()
    clock.advance(8)
    releaser.tick()
    assert logs and "空闲" in logs[-1] and "7" in logs[-1], "日志必须含「空闲」与阈值 7"
    ok("释放日志可读", logs[-1][:60])

    # 9) 没连着 Origin 时不许释放（否则启动 120s 后会凭空一条「已释放」日志）
    clock, engine = FakeClock(), FakeEngine()
    releaser = IdleReleaser(5, engine.release, clock=clock,
                            log=lambda _m: None, is_connected=engine.is_connected)
    clock.advance(1000)
    assert releaser.tick() is False and engine.release_calls == 0, "未连接时不许释放"
    engine.connect()
    releaser.begin_call(); releaser.end_call()
    clock.advance(6)
    assert releaser.tick() is True and engine.release_calls == 1, "连上后照常释放"
    ok("未连接时不释放、连上后照常释放",
       "未连接 releases=0, 连上后 releases=%d" % engine.release_calls)

    print("\norigin_idle selftest ok: %d/%d" % (checks, checks))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except AssertionError as exc:
        print("FAIL: %s" % exc)
        sys.exit(1)
