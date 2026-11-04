#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""bootstrap.py — 复刻插件的首次安装器（venv + server 源码 + 注册 MCP 连接）

设计前提（2026-11 实测）：
  · 不打包任何依赖：新建 venv 实测 134 MB，离线 wheel 包 28 MB，都不该进插件包。
  · 不打包 server 源码：按**钉死的 commit** 下 codeload tarball，sha256 校验，
    下过一次就缓存，之后每次启动只校验不重下。
  · 不碰用户的 Origin、不改授权、不去水印。
  · 不覆盖已有连接：先查 status，`serverName == dsh-origin` 命中且 enabled 就只记录。

三个阶段，任一失败都写 `bootstrap.json`（ok=false + error + hint）与 `bootstrap.log`，
hint 里是**能直接复制执行**的手动命令，不静默失败。

用法：
    python bootstrap.py --api http://127.0.0.1:55444
    python bootstrap.py --stage venv          # 只装依赖
    python bootstrap.py --stage server        # 只备 server 源码
    python bootstrap.py --stage register      # 只注册
    python bootstrap.py --offline             # 禁网；无缓存则明确报错
    python bootstrap.py --status              # 打印当前状态
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import time
import urllib.request

# ── 钉死的 server 版本（改这里必须同步改 sha256） ──────────────────────────
SERVER_COMMIT = "03acc24181aae6c6ac3a8502aa6ae24a8d1708da"
SERVER_URL = ("https://codeload.github.com/bansheng2000/dsh-origin-plugin/tar.gz/" + SERVER_COMMIT)
SERVER_SHA256 = "c2637ec914c2208c95d7aa48ebd011f87ecf3c7868bcb21466b5ecefb8cf72e2"
SERVER_ENTRY = "origin_mcp_stdio.py"
SERVER_MARKER = ".plot-clone-server.json"

REQUIREMENTS = ["mcp>=1.0", "originpro", "pywin32", "numpy", "openpyxl"]

SERVER_NAME = "dsh-origin"          # 决定工具名前缀 mcp__dsh-origin__*
API_PATH = "/mcp-connector/api"
STATE_DIR_NAME = "dsh-plot-clone"


def dsh_home():
    return os.environ.get("DSH_HOME") or os.path.join(
        os.environ.get("USERPROFILE") or os.path.expanduser("~"), ".dsh")


def state_dir():
    return os.path.join(dsh_home(), STATE_DIR_NAME)


def paths():
    d = state_dir()
    return {
        "dir": d,
        "venv": os.path.join(d, "venv"),
        "venv_python": os.path.join(d, "venv", "Scripts", "python.exe"),
        "server": os.path.join(d, "server"),
        "server_entry": os.path.join(d, "server", SERVER_ENTRY),
        "state": os.path.join(d, "bootstrap.json"),
        "log": os.path.join(d, "bootstrap.log"),
        "tarball": os.path.join(d, "cache", "server-%s.tgz" % SERVER_COMMIT[:12]),
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
    io.open(p["state"], "w", encoding="utf-8").write(json.dumps(st, ensure_ascii=False, indent=1))
    return st


def log(msg):
    p = paths()
    os.makedirs(p["dir"], exist_ok=True)
    line = "[%s] %s" % (time.strftime("%Y-%m-%d %H:%M:%S"), msg)
    print(line)
    with io.open(p["log"], "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def fail(stage, error, hint):
    log("FAILED %s: %s" % (stage, error))
    log("HINT: %s" % hint)
    write_state({"ok": False, "stage": stage, "error": str(error), "hint": hint,
                 "finished_at": time.strftime("%Y-%m-%dT%H:%M:%S%z")})
    return 1


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
    """解析 COM ProgID → CLSID → LocalServer32，拿真实安装路径。
    实测本机 Origin 在 F: 盘，C:\\Program Files 下是个空目录，不能靠固定路径。"""
    import winreg  # noqa: F401  (仅 Windows)
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


# ── 阶段 1：venv ─────────────────────────────────────────────────────────

def ensure_venv(offline=False):
    p = paths()
    if os.path.isfile(p["venv_python"]):
        log("venv 已存在：%s（只校验，不重建）" % p["venv_python"])
        return True
    py = find_bundled_python()
    if not py:
        return fail("venv", "找不到 DSH 自带 Python",
                    '手动装：python -m venv "%s" 然后 "%s\\Scripts\\python.exe" -m pip install %s'
                    % (p["venv"], p["venv"], " ".join(REQUIREMENTS)))
    log("用自带 Python 建 venv：%s" % py)
    os.makedirs(p["dir"], exist_ok=True)
    r = subprocess.run([py, "-m", "venv", p["venv"]], capture_output=True, text=True)
    if r.returncode != 0:
        return fail("venv", "python -m venv 失败: %s" % (r.stderr or r.stdout)[-400:],
                    '手动：%s -m venv "%s"' % (py, p["venv"]))
    req = os.path.join(p["server"], "requirements.txt")
    args = [p["venv_python"], "-m", "pip", "install", "--no-input", "--disable-pip-version-check"]
    if offline:
        cache = os.path.join(p["dir"], "wheels")
        if not os.path.isdir(cache):
            return fail("venv", "offline 模式但没有 wheel 缓存",
                        '联网跑一次：%s -m pip install %s；或把 wheel 放进 "%s"'
                        % (p["venv_python"], " ".join(REQUIREMENTS), cache))
        args += ["--no-index", "--find-links", cache]
    if os.path.isfile(req):
        args += ["-r", req]
    else:
        args += REQUIREMENTS
    log("pip install（可能需要几分钟）…")
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        tail = ((r.stderr or "") + (r.stdout or ""))[-600:]
        return fail("venv", "pip install 失败: %s" % tail,
                    '"%s" -m pip install %s'
                    % (p["venv_python"], "-r " + req if os.path.isfile(req) else " ".join(REQUIREMENTS)))
    log("venv 完成")
    return True


# ── 阶段 2：server 源码 ──────────────────────────────────────────────────

def sha256_file(path):
    h = hashlib.sha256()
    with io.open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def server_ready():
    p = paths()
    marker = os.path.join(p["server"], SERVER_MARKER)
    if not (os.path.isfile(p["server_entry"]) and os.path.isfile(marker)):
        return False
    try:
        meta = json.loads(io.open(marker, encoding="utf-8").read())
    except Exception:
        return False
    return meta.get("sha256") == SERVER_SHA256 and meta.get("commit") == SERVER_COMMIT


def ensure_server(offline=False):
    p = paths()
    if server_ready():
        log("server 已就位且 sha256 与钉死值一致（只校验，不重下）")
        return True
    if os.path.isdir(p["server"]) and os.path.isfile(p["server_entry"]):
        log("server 目录存在但标记不匹配 → 重新准备（不会覆盖用户自己的 %s）" % os.path.dirname(p["server"]))

    tarball = p["tarball"]
    ok_cache = os.path.isfile(tarball) and sha256_file(tarball) == SERVER_SHA256
    if not ok_cache:
        if offline:
            return fail("server", "offline 模式且没有可用缓存",
                        "联网跑一次 bootstrap，或手动下载 %s 放到 %s" % (SERVER_URL, tarball))
        os.makedirs(os.path.dirname(tarball), exist_ok=True)
        log("下载 server 源码：%s" % SERVER_URL)
        try:
            proxy = os.environ.get("DSH_PLOT_CLONE_PROXY")
            opener = (urllib.request.build_opener(
                urllib.request.ProxyHandler({"http": proxy, "https": proxy}))
                if proxy else urllib.request.build_opener())
            with opener.open(SERVER_URL, timeout=120) as resp, io.open(tarball, "wb") as out:
                shutil.copyfileobj(resp, out)
        except Exception as exc:
            return fail("server", "下载失败: %s" % exc,
                        "手动下载 %s 放到 %s（离线时设 DSH_PLOT_CLONE_PROXY 走代理）"
                        % (SERVER_URL, tarball))
        actual = sha256_file(tarball)
        if actual != SERVER_SHA256:
            os.remove(tarball)
            return fail("server", "sha256 不匹配：期望 %s 实际 %s" % (SERVER_SHA256, actual),
                        "下载被中间人/代理改写或版本已变；确认后更新 bootstrap.py 里的 SERVER_SHA256")
    else:
        log("命中缓存 tarball 且 sha256 一致")

    tmp = p["server"] + ".tmp"
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp, exist_ok=True)
    with tarfile.open(tarball, "r:gz") as tf:
        members = tf.getmembers()
        # 去掉顶层目录（codeload 的 <repo>-<sha>/）
        for m in members:
            parts = m.name.split("/", 1)
            if len(parts) < 2 or not parts[1]:
                continue
            m.name = parts[1]
            try:
                tf.extract(m, tmp, filter="data")   # 3.12+：拒绝绝对路径/设备文件/危险链接
            except TypeError:                        # 3.11 及更早没有 filter 参数
                tf.extract(m, tmp)
    if not os.path.isfile(os.path.join(tmp, SERVER_ENTRY)):
        shutil.rmtree(tmp, ignore_errors=True)
        return fail("server", "解包后找不到 %s" % SERVER_ENTRY,
                    "检查 tarball 结构；或手动解压 %s 到 %s" % (tarball, p["server"]))
    shutil.rmtree(p["server"], ignore_errors=True)
    os.rename(tmp, p["server"])
    io.open(os.path.join(p["server"], SERVER_MARKER), "w", encoding="utf-8").write(
        json.dumps({"commit": SERVER_COMMIT, "sha256": SERVER_SHA256,
                    "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S%z")}, ensure_ascii=False, indent=1))
    log("server 就位：%s" % p["server_entry"])
    return True


# ── 阶段 3：注册 ─────────────────────────────────────────────────────────

def api_base(explicit=None):
    if explicit:
        return explicit.rstrip("/")
    p = paths()
    try:
        port = io.open(p["web_port"], encoding="utf-8").read().strip()
        if port:
            return "http://127.0.0.1:%s" % port
    except Exception:
        pass
    return None


def call_api(base, method, params=None, timeout=60):
    url = base + API_PATH
    body = json.dumps({"method": method, "params": params or {}}).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def register(base):
    p = paths()
    if not base:
        return fail("register", "拿不到 connector API 地址（web-port.txt 为空）",
                    "带 --api http://127.0.0.1:<端口> 重跑；端口见 DSH 网页地址")
    try:
        status = call_api(base, "status")
    except Exception as exc:
        return fail("register", "connector API 不可达: %s" % exc,
                    "确认 DSH 正在运行；手动检查：curl -X POST -H \"content-type: application/json\" "
                    "-d '{\"method\":\"status\",\"params\":{}}' %s%s" % (base, API_PATH))
    items = (status.get("detail") or {}).get("items") or []
    found = next((i for i in items if i.get("serverName") == SERVER_NAME), None)
    if found and found.get("enabled") is not False:
        log("已有连接 %s（serverName=%s）且启用 → 复用，不 configure" % (found.get("key"), SERVER_NAME))
        write_state({"ok": True, "stage": "register", "reused": True,
                     "connection_key": found.get("key"), "server_name": SERVER_NAME,
                     "finished_at": time.strftime("%Y-%m-%dT%H:%M:%S%z")})
        return True
    if found:
        log("已有连接 %s 但被禁用 → 不擅自启用，交给用户" % found.get("key"))
        write_state({"ok": False, "stage": "register", "reused": False,
                     "connection_key": found.get("key"),
                     "error": "连接已存在但被禁用",
                     "hint": "在 DSH 设置 → MCP 连接器里启用 %s，或让用户确认后再启用" % found.get("key")})
        return False

    if not (os.path.isfile(p["venv_python"]) and os.path.isfile(p["server_entry"])):
        return fail("register", "依赖或 server 未就位", "先跑 --stage venv 和 --stage server")

    params = {
        "name": SERVER_NAME,
        "transport": "stdio",
        "serverName": SERVER_NAME,
        "command": p["venv_python"],
        "args": [p["server_entry"]],
        "env": {"PYTHONUTF8": 1, "PYTHONIOENCODING": "utf-8"},
        "injectionMode": "always",
    }
    try:
        res = call_api(base, "configure", params, timeout=180)
    except Exception as exc:
        return fail("register", "configure 请求失败: %s" % exc,
                    "手动：curl -X POST -H \"content-type: application/json\" -d "
                    "'{\"method\":\"configure\",\"params\":%s}' %s%s"
                    % (json.dumps(params, ensure_ascii=False), base, API_PATH))
    if res.get("ok") is not True:
        return fail("register", "configure 返回失败: %s" % res.get("message"),
                    "看 %s 里的 server 启动错误；修好后重跑 --stage register" % p["log"])
    key = (res.get("detail") or {}).get("key")
    log("注册成功：key=%s" % key)
    write_state({"ok": True, "stage": "register", "reused": False, "connection_key": key,
                 "server_name": SERVER_NAME, "error": None, "hint": None,
                 "finished_at": time.strftime("%Y-%m-%dT%H:%M:%S%z")})
    return True


# ── 主流程 ────────────────────────────────────────────────────────────────

def main(argv=None):
    ap = argparse.ArgumentParser(description="复刻插件 bootstrap：venv + server + 注册")
    ap.add_argument("--api", default=None, help="connector API 基址，如 http://127.0.0.1:55444")
    ap.add_argument("--stage", default="all", choices=["all", "venv", "server", "register"])
    ap.add_argument("--offline", action="store_true", help="禁网，只用缓存")
    ap.add_argument("--status", action="store_true", help="打印当前状态")
    args = ap.parse_args(argv)

    if args.status:
        print(json.dumps(read_state(), ensure_ascii=False, indent=1))
        return 0

    log("=== bootstrap start (stage=%s offline=%s) ===" % (args.stage, args.offline))
    write_state({"ok": False, "stage": "preflight", "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z")})

    origin = origin_install()
    log("Origin: %s" % (origin or "未检测到（COM ProgID 解析失败）"))
    write_state({"origin_exe": origin})

    if args.stage in ("all", "server") and not ensure_server(args.offline):
        return 1
    if args.stage in ("all", "venv") and not ensure_venv(args.offline):
        return 1
    if args.stage in ("all", "register"):
        if not register(api_base(args.api)):
            return 1
    log("=== bootstrap done ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
