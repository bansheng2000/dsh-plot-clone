# -*- coding: utf-8 -*-
"""origin_idle —— MCP 长期存活时的「空闲自动释放」

背景（2026-11 实测）：MCP server 随 DSH 启动、活到 DSH 退出；engine 首次连接
成功后会把 COM 引用缓存到进程结束。结果是一次 `origin_*` 调用之后，Origin64.exe
被自动化占用一整天，用户手动打开 Origin 会提示「另一个应用正在控制」。

这个模块只做一件事：记录「有没有调用在进行」和「最后一次活动时间」；空闲超过
阈值就调用注入的 release 函数（引擎里 `engine.release` 是 @_synchronized 包装，
**绝不在 watchdog 线程里直接碰 COM 对象**）。

设计约束：
  · 默认 120 秒；`DSH_ORIGIN_IDLE_RELEASE=<秒>` 覆盖，`0` = 关闭。
  · 调用进行中（begin_call 之后、end_call 之前）永远不释放。
  · 释放后不重复释放；下一次调用由引擎自己的延迟重连逻辑接上。
  · 日志只走 stderr（stdout 是 JSON-RPC 通道，一个字都不能脏）。
"""

from __future__ import annotations

import os
import sys
import threading
import time

DEFAULT_IDLE_SECONDS = 120.0
ENV_NAME = "DSH_ORIGIN_IDLE_RELEASE"


def idle_seconds_from_env(env=None):
    """读环境变量；缺省 120，非法值按缺省，负数归零。"""
    source = os.environ if env is None else env
    raw = source.get(ENV_NAME)
    if raw is None or str(raw).strip() == "":
        return DEFAULT_IDLE_SECONDS
    try:
        value = float(str(raw).strip())
    except (TypeError, ValueError):
        return DEFAULT_IDLE_SECONDS
    return max(0.0, value)


def _stderr_log(message):
    try:
        print(message, file=sys.stderr, flush=True)
    except Exception:
        pass


class IdleReleaser:
    """记录活动、按空闲阈值释放。线程安全；release 在锁外执行。"""

    def __init__(self, idle_seconds, release_fn, clock=None, log=None,
                 thread_factory=None, is_connected=None):
        self.idle_seconds = float(idle_seconds)
        self.release_fn = release_fn
        # 只有真的连着才释放：否则启动 120s 后会凭空打一条「已释放」日志。
        self._is_connected = is_connected
        self.clock = clock or time.monotonic
        self.log = log or _stderr_log
        self._thread_factory = thread_factory
        self._lock = threading.Lock()
        self._active = 0
        self._last_activity = self.clock()
        self._released = False
        self._releases = 0
        self._stop = threading.Event()
        self._thread = None

    # ── 状态 ──────────────────────────────────────────────
    @property
    def enabled(self):
        return self.idle_seconds > 0

    @property
    def active_calls(self):
        with self._lock:
            return self._active

    @property
    def releases(self):
        with self._lock:
            return self._releases

    @property
    def last_activity(self):
        with self._lock:
            return self._last_activity

    # ── 活动标记 ──────────────────────────────────────────
    def begin_call(self):
        with self._lock:
            self._active += 1
            self._last_activity = self.clock()
            self._released = False

    def end_call(self):
        with self._lock:
            if self._active > 0:
                self._active -= 1
            self._last_activity = self.clock()

    def touch(self):
        with self._lock:
            self._last_activity = self.clock()
            self._released = False

    # ── 判定 ──────────────────────────────────────────────
    def idle_for(self):
        with self._lock:
            return self.clock() - self._last_activity

    def should_release(self):
        if not self.enabled:
            return False
        if self._is_connected is not None:
            try:
                if not self._is_connected():
                    return False
            except Exception:
                return False
        with self._lock:
            if self._active > 0 or self._released:
                return False
            return (self.clock() - self._last_activity) >= self.idle_seconds

    def tick(self):
        """到点则释放一次；返回是否真的调用了 release。"""
        if not self.should_release():
            return False
        with self._lock:
            self._released = True
            self._releases += 1
            waited = self.clock() - self._last_activity
        self.log("[origin-mcp] 空闲 %.0fs（阈值 %.0fs），释放 Origin 自动化引用；"
                 "窗口保留，下一次调用自动重连" % (waited, self.idle_seconds))
        try:
            self.release_fn()
        except Exception as exc:  # 释放失败不能杀进程
            self.log("[origin-mcp] 空闲释放失败（忽略，下次再试）：%s" % exc)
            with self._lock:
                self._released = False
                self._releases -= 1
            return False
        return True

    # ── 线程 ──────────────────────────────────────────────
    def _loop(self):
        interval = min(1.0, max(0.1, self.idle_seconds / 4.0))
        while not self._stop.wait(interval):
            self.tick()

    def start(self):
        if not self.enabled or self._thread is not None:
            return self
        factory = self._thread_factory or (
            lambda target: threading.Thread(target=target, name="origin-idle-release",
                                            daemon=True))
        self._thread = factory(self._loop)
        self._thread.start()
        self.log("[origin-mcp] 空闲自动释放已启用：%ds（%s=0 可关闭）"
                 % (int(self.idle_seconds), ENV_NAME))
        return self

    def stop(self, timeout=2.0):
        self._stop.set()
        thread = self._thread
        if thread is not None and thread.is_alive() and thread is not threading.current_thread():
            thread.join(timeout=timeout)
        self._thread = None
