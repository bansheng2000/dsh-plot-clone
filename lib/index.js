/**
 * dsh-plot-clone — 插件壳（检测 + 决策，不装依赖、不下载）
 * =============================================================
 *
 * 为什么有这个壳：复刻 skill 本体是纯文件（SKILL.md + 4 个 py），装到
 * `~/.agents/skills/` 只是拷贝，**没有任何安装/启动钩子**，因此「装上插件
 * 就把 Origin MCP 一起装好」无处挂载。这个 bundle 只负责三件毫秒级的事：
 *
 *   1. 读 connector 现状（`POST /mcp-connector/api {"method":"status"}`）
 *   2. 决定：复用 / 问用户启用 / 需要注册 / 需要先装依赖
 *   3. 需要装依赖时 `spawn detached` 一个 bootstrap，**立刻返回不阻塞启动**
 *
 * 依赖注册走 dsh-mcp-connector 的**本地 HTTP API**，不走写 JSON：
 *   - 写 `storages/mcp_connector.json` 无效：connector 在 apply 时把 domain
 *     open 进内存（dsh-mcp-connector/lib/index.js:207），且全库无 fs.watch
 *     → 外部写入必须重启 DSH 才生效，还绕过快照/回滚与 scope 校验。
 *   - connector 没有对外 provide 服务（lib/index.js:101 只有 inject），
 *     `./client` 是浏览器 bundle，深层 import 被 exports map 挡掉。
 *   - HTTP API 是它自己的 UI 也在用的接口（lib/client.js:685），有方法白名单
 *     （lib/web.js:28-73）与回环信任 fence（lib/web.js:74-89），且 configure
 *     会**先真启动 server 并 tools/list 验证**再落库，失败自动回滚。
 *
 * 幂等键：manual 通道固定 `key = custom-<serverName>`
 * （dsh-mcp-connector/lib/connectors/manual-connector.js:70 / :112），
 * 与本机已有记录 `custom-dsh-origin` 是同一个键 → 重复注册是 upsert 不是新增。
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROUTE_PREFIX, createRoutes } from './templates.js';

export const name = 'plot-clone';

/**
 * 无必需 seam。`webServer` 是可选 seam，按仓库约定在 apply() 里用
 * `ctx.inject([...], ...)` 懒加载 —— 放进模块级 inject 会让缺该 seam 的
 * 部署（headless）fiber 永久 inactive，插件等于没装。
 */
const inject = [];
export { inject };

/** 与既有连接记录一致：serverName 决定工具名前缀 `mcp__dsh-origin__*`，生命周期内不变。 */
export const SERVER_NAME = 'dsh-origin';
export const API_PATH = '/mcp-connector/api';
export const STATE_DIR_NAME = 'dsh-plot-clone';

/* ───────────────────────── 路径 ───────────────────────── */

export function dshHome(env = process.env) {
  return env.DSH_HOME || join(env.USERPROFILE || homedir(), '.dsh');
}

export function stateDir(env = process.env) {
  return join(dshHome(env), STATE_DIR_NAME);
}

/** venv 与 server 都放用户目录，**不放插件目录**（pnpm 重装会清空 node_modules）。 */
export function rendererPaths(env = process.env) {
  const dir = stateDir(env);
  return {
    dir,
    venvPython: join(dir, 'venv', 'Scripts', 'python.exe'),
    serverEntry: join(dir, 'server', 'origin_mcp_stdio.py'),
    mcpState: join(dir, 'mcp-state.json'),
  };
}

/** 依赖与 server 就位才允许 configure（否则注册了也起不来）。 */
export function isReady(env = process.env) {
  const p = rendererPaths(env);
  return existsSync(p.venvPython) && existsSync(p.serverEntry);
}

/** DSH 自带 Python（不要求用户另装）：<DSH_HOME>/dsh-runtimes/<id>/dependencies/python/python.exe */
export function findBundledPython(env = process.env) {
  const root = join(dshHome(env), 'dsh-runtimes');
  try {
    for (const d of readdirSync(root)) {
      const p = join(root, d, 'dependencies', 'python', 'python.exe');
      if (existsSync(p)) return p;
    }
  } catch {
    /* 没有 dsh-runtimes 目录：headless/精简部署 */
  }
  return null;
}

/* ───────────────────────── 幂等与决策（纯函数，selftest 直接钉） ───────────────────────── */

/** connector manual 通道的幂等键。 */
export function connectionKeyFor(serverName) {
  return `custom-${serverName}`;
}

export function findConnection(status, serverName = SERVER_NAME) {
  const items = status?.detail?.items;
  if (!Array.isArray(items)) return null;
  return items.find((item) => item?.serverName === serverName) ?? null;
}

/**
 * 三态决策。**已存在且 enabled 一律 reuse —— 只读，绝不 configure**，
 * 避免覆盖用户自己调过的 command/args/env（本机就有这条记录）。
 */
export function decideAction(status, serverName = SERVER_NAME) {
  const found = findConnection(status, serverName);
  if (!found) {
    return { action: 'register', key: connectionKeyFor(serverName), reason: 'no connection with this serverName' };
  }
  if (found.enabled === false) {
    return { action: 'enable', key: found.key ?? connectionKeyFor(serverName), reason: 'connection exists but is disabled' };
  }
  return { action: 'reuse', key: found.key ?? connectionKeyFor(serverName), reason: 'connection exists and is enabled' };
}

/**
 * configure 结果合并。**只有 ok === true 才记 registered**；失败只记错误，
 * 并把 registered/connectionKey 清掉 —— 不落「半条记录」。
 */
export function mergeConfigureResult(prev, result, now = Date.now()) {
  const base = { ...(prev ?? {}) };
  if (result?.ok === true) {
    return {
      ...base,
      ok: true,
      registered: true,
      connectionKey: result?.detail?.key ?? connectionKeyFor(SERVER_NAME),
      serverName: result?.detail?.serverName ?? SERVER_NAME,
      updatedAt: now,
      error: null,
    };
  }
  const next = { ...base, ok: false, updatedAt: now, error: String(result?.message ?? 'configure failed') };
  delete next.registered;
  delete next.connectionKey;
  return next;
}

/** 提交给 connector 的记录（字段名对齐 buildManualRecord 的入参）。 */
export function buildRecord(env = process.env) {
  const p = rendererPaths(env);
  return {
    name: SERVER_NAME,
    transport: 'stdio',
    serverName: SERVER_NAME,
    command: p.venvPython,
    args: [p.serverEntry],
    env: { PYTHONUTF8: 1, PYTHONIOENCODING: 'utf-8' },
    injectionMode: 'always',
  };
}

/* ───────────────────────── HTTP ───────────────────────── */

export async function callApi(apiBase, method, params = {}, { fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const url = new URL(API_PATH, apiBase).toString();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  timer.unref?.();
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method, params }),
      signal: ac.signal,
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`connector api returned non-JSON (HTTP ${res.status})`);
    }
    if (!res.ok) throw new Error(body?.message ?? `connector api HTTP ${res.status}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/* ───────────────────────── 启动检查 ───────────────────────── */

/**
 * 一次启动检查的全部决策。返回 action：
 *   reuse | enable | register | bootstrap-needed | unreachable
 * 除 register 外都**不写 connector**（reuse/enable 只读 status，bootstrap-needed 连
 * configure 都不发）。
 */
export async function runStartupCheck({
  apiBase,
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = Date.now(),
  log = () => {},
} = {}) {
  const prev = readJson(rendererPaths(env).mcpState);

  let status;
  try {
    status = await callApi(apiBase, 'status', {}, { fetchImpl });
  } catch (error) {
    log(`connector api 不可达（${apiBase}）：${error.message}`);
    return { action: 'unreachable', state: { ...prev, ok: false, error: `connector api unreachable: ${error.message}`, updatedAt: now } };
  }

  const decision = decideAction(status);
  log(`决策 ${decision.action}：${decision.reason}（key=${decision.key}）`);

  if (decision.action === 'reuse') return { action: 'reuse', state: prev };
  if (decision.action === 'enable') return { action: 'enable', state: prev };

  if (!isReady(env)) {
    const p = rendererPaths(env);
    log(`依赖未就位，需要 bootstrap：venv=${p.venvPython} server=${p.serverEntry}`);
    return { action: 'bootstrap-needed', state: { ...prev, ok: false, error: 'renderer not installed', updatedAt: now } };
  }

  let result;
  try {
    result = await callApi(apiBase, 'configure', buildRecord(env), { fetchImpl });
  } catch (error) {
    result = { ok: false, message: error.message };
  }
  return { action: 'register', state: mergeConfigureResult(prev, result, now), result };
}

/* ───────────────────────── 状态文件 ───────────────────────── */

export function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

export function writeJson(path, value) {
  try {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify(value, null, 1), 'utf8');
    return true;
  } catch {
    return false;
  }
}

export function persistMcpState(state, env = process.env) {
  return writeJson(rendererPaths(env).mcpState, state);
}

/* ───────────────────────── bootstrap（首次安装器，lib/bootstrap.py） ───────────────────────── */

/**
 * 起一个 detached bootstrap，立刻返回。
 * `bootstrap.py` 在**插件目录**（lib/），不在用户状态目录 —— 状态目录只放产物
 * （venv / server / bootstrap.json），pnpm 重装插件不会清掉它们。
 */
export function spawnBootstrap(apiBase, { env = process.env, log = () => {}, spawnImpl = spawn } = {}) {
  const script = fileURLToPath(new URL('./bootstrap.py', import.meta.url));
  if (!existsSync(script)) {
    log(`bootstrap 脚本缺失：${script}`);
    return null;
  }
  const py = findBundledPython(env);
  if (!py) {
    log('找不到 DSH 自带 Python，无法自动安装依赖；请按 README 手动建 venv');
    return null;
  }
  try {
    const child = spawnImpl(py, [script, '--api', apiBase], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...env },
    });
    child.unref?.();
    return child;
  } catch (error) {
    log(`spawn bootstrap 失败：${error.message}`);
    return null;
  }
}

/**
 * 可选 seam：webServer 的端口形状在不同 DSH 版本里不稳定，按多种形状探测 +
 * 环境变量兜底。拿不到就跳过自注册（headless 部署本来也没有 HTTP API）。
 */
export function apiBaseFrom(webServer, env = process.env) {
  const addr =
    (typeof webServer?.address === 'function' ? webServer.address() : undefined) ??
    (typeof webServer?.server?.address === 'function' ? webServer.server.address() : undefined) ??
    null;
  const port =
    webServer?.port ?? addr?.port ?? webServer?.listeningPort ?? env.DSH_WEB_PORT ?? null;
  if (!port) return null;
  const rawHost = webServer?.host ?? addr?.address ?? '127.0.0.1';
  const host = rawHost === '::' || rawHost === '0.0.0.0' || rawHost === '::1' ? '127.0.0.1' : rawHost;
  return `http://${host}:${port}`;
}

/* ───────────────────────── 插件入口 ───────────────────────── */

export function apply(ctx) {
  const logger = ctx?.logger?.('plot-clone') ?? console;
  const log = (message) => {
    try {
      (logger.info ?? logger.log ?? console.log)(`plot-clone: ${message}`);
    } catch {
      /* 日志失败不影响插件 */
    }
  };

  ctx.inject(['webServer'], (sctx) => {
    // 模板选择页与服务端：和 MCP 自注册是两件独立的事，webServer 在就挂。
    // 路由自己会做回环校验（绕过宿主鉴权墙），见 lib/templates.js:isLoopbackRequest。
    sctx.effect(() => {
      const dispose = sctx.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: createRoutes({ env: process.env, log }),
      });
      log(`模板选择页已挂到 ${ROUTE_PREFIX}/`);
      return () => dispose?.();
    }, 'plot-clone: template routes');

    const apiBase = apiBaseFrom(sctx?.webServer);
    if (!apiBase) {
      log('拿不到 webServer 端口，跳过 MCP 自注册（headless 部署属正常）');
      return;
    }

    runStartupCheck({ apiBase, log })
      .then(({ action, state }) => {
        if (action === 'register') persistMcpState(state);
        if (action === 'bootstrap-needed') {
          persistMcpState(state);
          spawnBootstrap(apiBase, { log });
        }
      })
      .catch((error) => log(`启动检查异常：${error?.message ?? error}`));
  });
}
