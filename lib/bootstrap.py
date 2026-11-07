#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""bootstrap.py — 内置 Origin MCP 的首次安装器（只建 venv，server 源码随插件包）

设计（2026-11 改版，2.9.x）：
  · server 源码**随插件包**分发（`server/`，MIT，见 server/NOTICE.md），
    首启不再下载：装上插件就等于装好 MCP 的一半，剩下一半是 Python 依赖。
  · 依赖不进包：venv 实测 134 MB，属运行时产物，放进
    `<DSH_HOME>/dsh-plot-clone/venv`。
  · 不自动注册 connector：MCP 由 bundle patch 里的 loader 条目直接拉起，
    与 connector 里的同名连接**互斥**（同名会有一整条加载失败）。检测到冲突
    只写红条，等用户点「停用旧连接」，绝不静默改宿主配置。
  · 状态全程写 `bootstrap.json`，面板读它显示进度 / 失败原因 / 可复制命令。

用法：
    python bootstrap.py                 # server + venv
    python bootstrap.py --stage venv    # 只建 venv
    python bootstrap.py --stage server  # 只铺 server 源码
    python bootstrap.py --status        # 打印状态
    python bootstrap.py --check         # 只判断是否就绪（rc=0/1）
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import time

SERVER_ENTRY = "origin_mcp_stdio.py"
SERVER_MARKER = ".plot-clone-server.json"
REQUIREMENTS = ["mcp>=1.0", "originpro", "pywin32", "numpy", "openpyxl"]
STATE_DIR_NAME = "dsh-plot-clone"
SERVER_NAME = "dsh-origin"          # 决定工具名前缀 mcp__dsh-origin__*
API_PATH = "/mcp-connector/api"

MIRROR_HINT = ("pip 慢/被墙时加镜像："
               "-i https://pypi.tuna.tsinghua.edu.cn/simple"
               "（或 https://mirrors.aliyun.com/pypi/simple）")


def _native(path):
    """Git-Bash/MSYS 传进来的 /c/Users/... 要还原成 C:/Users/...，
    否则 os.path.join 会拼出 C:\\c\\Users\\... 这种不存在的目录。"""
    if os.name != "nt" or not path:
        return path
    m = re.match(r"^/([A-Za-z])/(.*)$", path)
    if m:
        return m.group(1).upper() + ":/" + m.group(2)
    return path


def dsh_home():
    raw = os.environ.get("DSH_HOME") or os.path.join(
        os.environ.get("USERPROFILE") or os.path.expanduser("~"), ".dsh")
    return _native(os.path.expanduser(raw))


def state_dir():
    return os.path.join(dsh_home(), STATE_DIR_NAME)


def bundled_server_dir():
    """插件包里的 server/（本文件在 <pkg>/lib/ 下）。"""
    return os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "server"))


def paths():
    d = state_dir()
    return {
        "dir": d,
        "venv": os.path.join(d, "venv"),
        "venv_python": os.path.join(d, "venv", "Scripts", "python.exe"),
        "server": os.path.join(d, "server"),
        "server_entry": os.path.join(d, "server", SERVER_ENTRY),
        "marker": os.path.join(d, "server", SERVER_MARKER),
        "state": os.path.join(d, "bootstrap.json"),
        "log": os.path.join(d, "bootstrap.log"),
        "web_port": os.path.join(d, "web-port.txt"),
    }


# ── 状态与日志 ────────────────────────────────────────────────────────────

def read_state():
    try:
        return json.loads(io.open(paths()["state"], encoding="utf-8").read())
    except Exception:
        return {}


def write_state(patch):
    p = paths()
    os.makedirs(p["dir"], exist_ok=True)
    st = read_state()
    st.update(patch)
    st["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    io.open(p["state"], "w", encoding="utf-8").write(
        json.dumps(st, ensure_ascii=False, indent=1))
    return st


def log(msg):
    p = paths()
    os.makedirs(p["dir"], exist_ok=True)
    line = "[%s] %s" % (time.strftime("%Y-%m-%d %H:%M:%S"), msg)
    print(line)
    with io.open(p["log"], "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def manual_commands():
    p = paths()
    req = os.path.normpath(os.path.join(p["server"], "requirements.txt"))
    venv = os.path.normpath(p["venv"])
    vpy = os.path.normpath(p["venv_python"])
    py = find_bundled_python() or "python"
    return [
        '"%s" -m venv "%s"' % (py, venv),
        '"%s" -m pip install -U pip' % vpy,
        '"%s" -m pip install -i https://pypi.tuna.tsinghua.edu.cn/simple -r "%s"'
        % (vpy, req),
    ]


def fail(stage, error, hint=None):
    log("FAILED %s: %s" % (stage, error))
    cmds = manual_commands()
    hint = hint or ("手动执行：\n" + "\n".join(cmds))
    write_state({"ok": False, "stage": stage, "error": str(error)[-1200:],
                 "hint": hint, "manual_command": cmds,
                 "mirror_hint": MIRROR_HINT,
                 "finished_at": time.strftime("%Y-%m-%dT%H:%M:%S%z")})
    return False


# ── 环境探测 ──────────────────────────────────────────────────────────────

def find_bundled_python():
    root = os.path.join(dsh_home(), "dsh-runtimes")
    try:
        for d in sorted(os.listdir(root)):
            p = os.path.join(root, d, "dependencies", "python", "python.exe")
            if os.path.isfile(p):
                return p
    except Exception:
        pass
    return None


def origin_install():
    """ProgID → CLSID → LocalServer32，拿真实安装路径（本机 Origin 可能在 F:）。"""
    try:
        import winreg
    except Exception:
        return None
    try:
        key = winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, r"Origin.Application\CLSID")
        guid, _ = winreg.QueryValueEx(key, "")
    except OSError:
        return None
    for hive in (winreg.HKEY_CLASSES_ROOT,
                 getattr(winreg, "HKEY_LOCAL_MACHINE", None)):
        for sub in (r"CLSID\%s\LocalServer32" % guid,
                    r"WOW6432Node\CLSID\%s\LocalServer32" % guid):
            try:
                k = winreg.OpenKey(hive, sub)
                path, _ = winreg.QueryValueEx(k, "")
                if os.path.isfile(path):
                    return path
            except OSError:
                continue
    return None


def deps_ok(venv_python):
    """venv 里四个依赖都能 import 才算就位（只认结果，不看目录是否存在）。"""
    if not os.path.isfile(venv_python):
        return False
    code = "import mcp, originpro, win32com, numpy"
    try:
        r = subprocess.run([venv_python, "-c", code], capture_output=True,
                           text=True, timeout=120)
        return r.returncode == 0
    except Exception:
        return False


# ── 阶段 1：server 源码（随包拷贝） ──────────────────────────────────────

def dir_fingerprint(root):
    h = hashlib.sha256()
    for base, dirs, files in os.walk(root):
        dirs.sort()
        for name in sorted(files):
            if name in (SERVER_MARKER,):
                continue
            p = os.path.join(base, name)
            rel = os.path.relpath(p, root).replace("\\", "/")
            h.update(rel.encode("utf-8"))
            h.update(b"\0")
            with io.open(p, "rb") as fh:
                for chunk in iter(lambda: fh.read(1 << 20), b""):
                    h.update(chunk)
    return h.hexdigest()


def server_ready():
    p = paths()
    if not (os.path.isfile(p["server_entry"]) and os.path.isfile(p["marker"])):
        return False
    src = bundled_server_dir()
    if not os.path.isdir(src):
        return False
    try:
        meta = json.loads(io.open(p["marker"], encoding="utf-8").read())
    except Exception:
        return False
    return meta.get("fingerprint") == dir_fingerprint(src)


def ensure_server():
    p = paths()
    src = bundled_server_dir()
    if not os.path.isdir(src) or not os.path.isfile(os.path.join(src, SERVER_ENTRY)):
        return fail("server", "插件包内缺少 server/ 目录",
                    "重装 dsh-plot-clone（server/ 必须随包）；或把 origin MCP 源码放到 %s" % src)
    write_state({"ok": False, "stage": "server", "progress": "copy",
                 "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z")})
    if server_ready():
        log("server 源码已就位且指纹一致（只校验，不重拷）")
        return True
    tmp = p["server"] + ".tmp"
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp, exist_ok=True)
    try:
        for base, dirs, files in os.walk(src):
            rel = os.path.relpath(base, src)
            dst = tmp if rel == "." else os.path.join(tmp, rel)
            os.makedirs(dst, exist_ok=True)
            for name in files:
                if name.endswith((".pyc",)) or name == SERVER_MARKER:
                    continue
                shutil.copy2(os.path.join(base, name), os.path.join(dst, name))
        if not os.path.isfile(os.path.join(tmp, SERVER_ENTRY)):
            raise RuntimeError("拷贝后缺少 %s" % SERVER_ENTRY)
        io.open(os.path.join(tmp, SERVER_MARKER), "w", encoding="utf-8").write(
            json.dumps({"fingerprint": dir_fingerprint(src),
                        "entry": SERVER_ENTRY,
                        "copied_at": time.strftime("%Y-%m-%dT%H:%M:%S%z")},
                       ensure_ascii=False, indent=1))
        shutil.rmtree(p["server"], ignore_errors=True)
        os.rename(tmp, p["server"])
    except Exception as exc:
        shutil.rmtree(tmp, ignore_errors=True)
        return fail("server", "拷贝 server 源码失败: %s" % exc)
    log("server 源码就位：%s" % p["server_entry"])
    write_state({"stage": "server", "progress": "done"})
    return True


# ── 阶段 2：venv ─────────────────────────────────────────────────────────

def ensure_venv():
    p = paths()
    if deps_ok(p["venv_python"]):
        log("venv 依赖已齐（只校验，不重装）：%s" % p["venv_python"])
        write_state({"stage": "venv", "progress": "done"})
        return True
    py = find_bundled_python()
    if not py:
        return fail("venv", "找不到 DSH 自带 Python",
                    "手动建 venv（把 <python> 换成你机器上的 python.exe）：\n"
                    + "\n".join(manual_commands()))
    if not os.path.isfile(p["venv_python"]):
        write_state({"ok": False, "stage": "venv", "progress": "create",
                     "manual_command": manual_commands(),
                     "mirror_hint": MIRROR_HINT})
        log("建 venv：%s" % p["venv"])
        try:
            r = subprocess.run([py, "-m", "venv", p["venv"]], capture_output=True,
                               text=True, timeout=600)
        except Exception as exc:
            return fail("venv", "python -m venv 异常: %s" % exc)
        if r.returncode != 0 or not os.path.isfile(p["venv_python"]):
            return fail("venv", "python -m venv 失败: %s"
                        % ((r.stderr or r.stdout or "")[-600:]))
    req = os.path.join(p["server"], "requirements.txt")
    args = [p["venv_python"], "-m", "pip", "install", "--no-input",
            "--disable-pip-version-check"]
    if os.path.isfile(req):
        args += ["-r", req]
    else:
        args += REQUIREMENTS
    write_state({"ok": False, "stage": "venv", "progress": "pip",
                 "manual_command": manual_commands(),
                 "mirror_hint": MIRROR_HINT})
    log("pip install（可能需要几分钟）…")
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=3600)
    except Exception as exc:
        return fail("venv", "pip install 异常: %s" % exc)
    if r.returncode != 0:
        tail = ((r.stderr or "") + (r.stdout or ""))[-900:]
        return fail("venv", "pip install 失败: %s" % tail)
    if not deps_ok(p["venv_python"]):
        return fail("venv", "pip 报成功但依赖仍 import 不了（可能是半装）")
    log("venv 完成")
    write_state({"stage": "venv", "progress": "done"})
    return True


# ── 阶段 3（可选）：注册 connector ──────────────────────────────────────

def api_base(explicit=None):
    if explicit:
        return explicit.rstrip("/")
    return None


def call_api(base, method, params=None, timeout=60):
    import urllib.request
    url = base + API_PATH
    body = json.dumps({"method": method, "params": params or {}}).encode("utf-8")
    req = urllib.request.Request(url, data=body,
                                 headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def register(base):
    """可选路径：仅当用户要用 connector 而不是内置 loader 时手动跑。"""
    p = paths()
    if not base:
        return fail("register", "没有给 --api",
                    "内置 loader 不需要注册；如确实要注册，带 --api http://127.0.0.1:<端口>")
    try:
        status = call_api(base, "status")
    except Exception as exc:
        return fail("register", "connector API 不可达: %s" % exc)
    items = (status.get("detail") or {}).get("items") or []
    found = next((i for i in items if i.get("serverName") == SERVER_NAME), None)
    if found and found.get("enabled") is not False:
        log("已有同名连接 %s 且启用 → 会与内置条目冲突，不重复注册"
            % found.get("key"))
        write_state({"ok": True, "stage": "register", "reused": True,
                     "connection_key": found.get("key"),
                     "server_name": SERVER_NAME})
        return True
    params = {
        "name": SERVER_NAME, "transport": "stdio", "serverName": SERVER_NAME,
        "command": p["venv_python"], "args": [p["server_entry"]],
        "env": {"PYTHONUTF8": 1, "PYTHONIOENCODING": "utf-8"},
        "injectionMode": "always",
    }
    try:
        res = call_api(base, "configure", params, timeout=180)
    except Exception as exc:
        return fail("register", "configure 请求失败: %s" % exc)
    if res.get("ok") is not True:
        return fail("register", "configure 返回失败: %s" % res.get("message"))
    write_state({"ok": True, "stage": "register", "reused": False,
                 "connection_key": (res.get("detail") or {}).get("key"),
                 "server_name": SERVER_NAME, "error": None, "hint": None})
    return True


# ── 主流程 ────────────────────────────────────────────────────────────────

def main(argv=None):
    ap = argparse.ArgumentParser(description="复刻插件 bootstrap：随包 server + venv")
    ap.add_argument("--api", default=None)
    ap.add_argument("--stage", default="all",
                    choices=["all", "venv", "server", "register"])
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--check", action="store_true", help="只判断就绪，rc=0 就绪")
    args = ap.parse_args(argv)

    if args.status:
        print(json.dumps(read_state(), ensure_ascii=False, indent=1))
        return 0

    p = paths()
    if args.check:
        ready = os.path.isfile(p["server_entry"]) and deps_ok(p["venv_python"])
        print(json.dumps({"ready": ready, "venv_python": p["venv_python"],
                          "server_entry": p["server_entry"],
                          "state": read_state()}, ensure_ascii=False, indent=1))
        return 0 if ready else 1

    log("=== bootstrap start (stage=%s) ===" % args.stage)
    write_state({"ok": False, "stage": "preflight", "progress": "start",
                 "error": None, "hint": None,
                 "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                 "finished_at": None,
                 "manual_command": manual_commands(),
                 "mirror_hint": MIRROR_HINT})
    origin = origin_install()
    log("Origin: %s" % (origin or "未检测到（COM ProgID 解析失败）"))
    write_state({"origin_exe": origin})

    ok = True
    if args.stage in ("all", "server") and ok:
        ok = ensure_server()
    if args.stage in ("all", "venv") and ok:
        ok = ensure_venv()
    if args.stage == "register" and ok:
        ok = register(api_base(args.api))
    if not ok:
        return 1
    write_state({"ok": True, "stage": "done", "progress": "done", "error": None,
                 "hint": None,
                 "finished_at": time.strftime("%Y-%m-%dT%H:%M:%S%z")})
    log("=== bootstrap done ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
