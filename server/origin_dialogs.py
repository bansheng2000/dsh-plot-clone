# -*- coding: utf-8 -*-
"""Origin 模态弹窗的识别与「安全点击」。

背景
----
Origin 的 COM 调用在模态对话框出现时会整段阻塞（`LT_execute` 不返回），
以前只有 `origin_engine._watchdog_dismiss_modals` 在做「见到按钮就点第一个」，
这有两个真问题（2026-11-08 实测）：

1. **文本精确匹配对不上中文助记符**：中文 Windows 上按钮文本是
   `是(Y)` / `否(N)` / `取消`，旧代码用 `txt in ("是", "否", ...)` 精确比较，
   一个都命中不了，于是弹窗根本点不掉，只能等 90s 软超时；
2. **就算命中，点的也是第一个白名单按钮**——保存确认框的按钮顺序是
   `是 / 否 / 取消`，第一个是 `是`，等于**替用户保存并覆盖工程文件**。

所以这里把「读弹窗 → 判定该点哪个 → 只点安全的那一个」拆成三步，
判定表是白名单：认不出来的弹窗**一律不点**，只如实报告，交给调用方或用户。

用法
----
    import origin_dialogs as dlg
    dlg.list_dialogs()        # 只读：标题 / 正文 / 按钮
    dlg.dismiss_safe()        # 按策略点安全按钮，返回明细

机制（沿用引擎里已实证的通道）：EnumWindows 找 Origin PID 的 `#32770`
可见对话框 → EnumChildWindows 收按钮与静态文本 → PostMessage(BM_CLICK)。
"""
from __future__ import annotations

import re

# 按钮文本 → 规范名。中文 Windows 带助记符（是(Y) / 否(N) / 取消），
# 英文可能带 &（&Yes）或句点。先去掉括号后缀与 &，再小写比对。
_NORM = {
    "是": "yes", "yes": "yes", "y": "yes",
    "否": "no", "no": "no", "n": "no",
    "取消": "cancel", "cancel": "cancel",
    "确定": "ok", "ok": "ok", "关闭": "close", "close": "close",
    "重试": "retry", "retry": "retry", "忽略": "ignore", "ignore": "ignore",
    "全部": "all", "all": "all", "否，全部": "no_all",
}

# 正文关键词 → 弹窗类别。顺序敏感：先认「保存」，再认「覆盖」。
_RULES = (
    ("project-save", ("保存到项目", "保存对项目", "更改保存", "save changes",
                      "save the project", "保存更改")),
    ("overwrite", ("覆盖", "已存在", "overwrite", "already exists",
                   "replace existing")),
    ("error", ("错误", "error", "失败", "failed", "cannot", "无法")),
    ("warning", ("警告", "warning", "注意", "caution")),
)

# 类别 → 该点哪个按钮（按优先级）。None = 不点。
_POLICY = {
    # 保存确认：绝不替用户保存，点「否」
    "project-save": ("no", "cancel"),
    # 覆盖确认：同样不覆盖
    "overwrite": ("no", "cancel"),
    # 纯提示：点确定关掉
    "error": ("ok", "close"),
    "warning": ("ok", "close"),
}


def normalize_button(text):
    """`是(Y)` → `yes`，`&No` → `no`，认不出返回 None。"""
    if not text:
        return None
    t = text.strip()
    t = re.sub(r"[（(][^）)]*[）)]\s*$", "", t).strip()   # 去掉 (Y) / (&N)
    t = t.replace("&", "").strip().rstrip(".").strip()
    return _NORM.get(t.lower()) or _NORM.get(t)


def classify(title, message, buttons):
    """按标题/正文/按钮判定类别与该点哪个按钮。

    Args:
        title: 窗口标题。
        message: 正文（所有静态文本拼起来的字符串）。
        buttons: 按钮原始文本列表。

    Returns:
        {"kind": 类别, "action": 规范按钮名或 None, "button": 原始按钮文本或 None,
         "reason": 判定依据}
    """
    hay = f"{title}\n{message}".lower()
    kind = "unknown"
    for name, keys in _RULES:
        if any(k.lower() in hay for k in keys):
            kind = name
            break
    norm = [(b, normalize_button(b)) for b in buttons]
    if kind == "unknown":
        return {"kind": kind, "action": None, "button": None,
                "reason": "未识别的弹窗，不自动点击"}
    for want in _POLICY.get(kind, ()):
        for raw, n in norm:
            if n == want:
                return {"kind": kind, "action": want, "button": raw,
                        "reason": f"{kind} → 点「{raw}」"}
    return {"kind": kind, "action": None, "button": None,
            "reason": f"{kind} 但没有可安全点击的按钮（有：{[b for b, _ in norm]}）"}


# ---------------------------------------------------------------- Win32 部分

def _win32():
    try:
        import win32gui, win32con, win32process
        return win32gui, win32con, win32process
    except ImportError:
        return None


def origin_pids():
    """Origin64.exe 的 PID 集合（tasklist 输出在中文 Windows 是 GBK）。"""
    import subprocess
    try:
        out = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq Origin64.exe", "/FO", "CSV"],
            capture_output=True).stdout.decode("gbk", errors="replace")
        return {int(line.split('","')[1]) for line in out.splitlines()
                if line.startswith('"Origin')}
    except Exception:
        return set()


def list_dialogs(pids=None):
    """列出 Origin 的可见模态弹窗（只读，不点击）。

    Returns:
        [{"hwnd", "pid", "title", "message", "buttons": [文本...],
          "kind", "action", "button", "reason"}]
    """
    w = _win32()
    if not w:
        return []
    win32gui, _win32con, win32process = w
    pids = pids or origin_pids()
    if not pids:
        return []
    found = []

    def _cb(h, _):
        try:
            if (win32gui.GetClassName(h) == "#32770"
                    and win32gui.IsWindowVisible(h)):
                _, pid = win32process.GetWindowThreadProcessId(h)
                if pid in pids:
                    found.append((h, pid))
        except Exception:
            pass

    try:
        win32gui.EnumWindows(_cb, None)
    except Exception:
        return []

    out = []
    for h, pid in found:
        texts = []
        buttons = []

        def _child(c, _):
            try:
                cls = win32gui.GetClassName(c)
                t = win32gui.GetWindowText(c)
                if cls == "Button":
                    if t:
                        buttons.append(t)
                elif t:
                    texts.append(t)
            except Exception:
                pass
            return True

        try:
            win32gui.EnumChildWindows(h, _child, None)
        except Exception:
            pass
        title = win32gui.GetWindowText(h)
        message = " ".join(texts)
        verdict = classify(title, message, buttons)
        out.append({"hwnd": h, "pid": pid, "title": title,
                    "message": message, "buttons": buttons, **verdict})
    return out


def click_button(hwnd_button):
    """对一个按钮 PostMessage(BM_CLICK)。"""
    w = _win32()
    if not w:
        return False
    win32gui, win32con, _ = w
    try:
        win32gui.PostMessage(hwnd_button, win32con.BM_CLICK, 0, 0)
        return True
    except Exception:
        return False


def dismiss_safe(pids=None, dry_run=False):
    """按策略点掉白名单弹窗，返回每条的处置明细。

    dry_run=True 时只判定、不点击（用于给用户看「我准备点哪个」）。
    """
    w = _win32()
    if not w:
        return []
    win32gui = w[0]
    results = []
    for d in list_dialogs(pids):
        entry = {"title": d["title"], "kind": d["kind"],
                 "action": d["action"], "button": d["button"],
                 "clicked": None, "reason": d["reason"]}
        if d["action"] and not dry_run:
            hwnd_btn = None

            def _find(c, _):
                nonlocal hwnd_btn
                try:
                    if (win32gui.GetClassName(c) == "Button"
                            and win32gui.GetWindowText(c) == d["button"]):
                        hwnd_btn = c
                except Exception:
                    pass
                return True

            try:
                win32gui.EnumChildWindows(d["hwnd"], _find, None)
            except Exception:
                pass
            if hwnd_btn and click_button(hwnd_btn):
                entry["clicked"] = d["button"]
        results.append(entry)
    return results
