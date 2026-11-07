/**
 * dsh-plot-clone — 插件壳（随包 Origin MCP + 首启建 venv）
 * =====================================================
 *
 * 为什么有这个壳：复刻 skill 本体是纯文件（SKILL.md + 4 个 py），装到
 * `~/.agents/skills/` 只是拷贝，**没有任何安装/启动钩子**。这个 bundle 负责：
 *
 *   1. `cordis.patch.yml` 里再插一条 `@deepseek-ai/dsh-mcp-client`，
 *      路径用 `!!js` 只拼 `$DSH_HOME`，server 源码随插件包（`server/`）——
 *      装插件就等于「MCP 一起装好」，不下载、不注册 connector。
 *   2. 首启缺 venv 时 spawn 一个 detached bootstrap，**立刻返回不阻塞启动**。
 *   3. 检测 connector 里的同名连接（`serverName = dsh-origin`）：两者同名时
 *      **后加载的一整条会加载失败**，所以只写红条 + 留痕，由用户点一下再让
 *      agent 停用旧连接。**绝不自动改宿主配置**（mcp_connector.json 是宿主
 *      正在读写的东西，静默改会撞上回写）。
 *
 * 为什么不走 connector 注册：loader 条目已经直接拉起同一个 server，再注册
 * connector 就是两个实例抢同一个 serverName。`--stage register` 只作为手动
 * 逃生舱保留。
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

/** venv 与 server 副本都放用户目录，**不放插件目录**（pnpm 重装会清空 node_modules）。 */
export function rendererPaths(env = process.env) {
  const dir = stateDir(env);
  return {
    dir,
    serverDir: join(dir, 'server'),
    venvPython: join(dir, 'venv', 'Scripts', 'python.exe'),
    serverEntry: join(dir, 'server', 'origin_mcp_stdio.py'),
    mcpState: join(dir, 'mcp-state.json'),
    bootstrapState: join(dir, 'bootstrap.json'),
    requestFile: join(dir, 'mcp-migration-request.json'),
    log: join(dir, 'bootstrap.log'),
  };
}

/** 插件包内的 server 源码目录（随包分发，首启只拷贝）。 */
export function bundledServerDir() {
  return fileURLToPath(new URL('../server', import.meta.url));
}

/** 依赖副本与 server 副本都在才允许拉起（venv 可能还在建：面板显示进度）。 */
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

/* ───────────────────────── 决策（纯函数，selftest 直接钉） ───────────────────────── */

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
 * `enabled` 的 connector 连接与我们的 loader 条目**同名互斥**：
 * mcp-client 在同一个注册作用域里对 serverName 做独占，后加载者失败。
 * 所以这里只要发现 enabled 的同名连接就报 conflict，既不 configure、也不启用。
 */
export function findEnabledConflict(status, serverName = SERVER_NAME) {
  const found = findConnection(status, serverName);
  if (!found) return null;
  return found.enabled === false ? null : found;
}

/**
 * 新决策：conflict | bootstrap-needed | ok
 *  - conflict：connector 里有一条 enabled 的同名连接（任何 command 都算，
 *    因为 loader 条目固定会抢同一个 serverName）；
 *  - bootstrap-needed：没有冲突，但 venv/server 副本还没就位；
 *  - ok：就绪，loader 条目自己会拉起 server，**不需要任何 HTTP 写操作**。
 */
export function decideAction(status, { env = process.env, ready = isReady(env) } = {}) {
  const conflict = findEnabledConflict(status);
  if (conflict) {
    return {
      action: 'conflict',
      key: conflict.key ?? connectionKeyFor(SERVER_NAME),
      connection: conflict,
      reason: 'connector has an enabled connection with the same serverName',
    };
  }
  if (!ready) {
    return { action: 'bootstrap-needed', key: connectionKeyFor(SERVER_NAME), reason: 'renderer not installed' };
  }
  return { action: 'ok', key: connectionKeyFor(SERVER_NAME), reason: 'loader entry owns the MCP server' };
}

/**
 * 旧的 configure 结果合并仍然保留（手动 `--stage register` 逃生舱与测试用）。
 * **只有 ok === true 才记 registered**；失败只记错误，不落「半条记录」。
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

/** 手动注册用的记录（只在 `--stage register` 这个逃生舱里用到）。 */
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

/** 面板读的 bootstrap 状态（bootstrap.json 原样；补一个 running 判定）。 */
export function readBootstrapState(env = process.env) {
  const state = readJson(rendererPaths(env).bootstrapState);
  const running = Boolean(state.started_at) && !state.finished_at;
  return { ...state, running };
}

/**
 * 留痕 + 生成给用户消息用的提示词。**不写 connector 配置**，只落一个
 * `mcp-migration-request.json`（谁在什么时候点了哪个按钮、冲突的是哪条连接）。
 */
export function writeMigrationRequest(env, conflict, { now = new Date().toISOString() } = {}) {
  const p = rendererPaths(env);
  const key = conflict?.key ?? connectionKeyFor(SERVER_NAME);
  const prompt = [
    '复刻面板提示：dsh-plot-clone 自带的 Origin MCP 与已有的 MCP 连接同名（serverName=dsh-origin），',
    '两者只能活一条。请帮我停用旧连接，步骤：',
    `1. 先备份 mcp_connector 配置（记录 ${key} 的完整内容，尤其是 command/args/env）；`,
    `2. 调 mcp_connector_set_enabled，key=${key}，enabled=false；`,
    '3. 回读确认它已停用，并确认插件自带的 dsh-origin 那一条成为唯一实例；',
    '4. 告诉我重启 DSH 后怎么验证（工具前缀 mcp__dsh-origin__*）。',
    '如果第 1 步拿不到配置，先停下问我，不要直接停用。',
  ].join('\n');
  const record = {
    requestedAt: now,
    connectionKey: key,
    serverName: SERVER_NAME,
    connection: conflict ?? null,
    prompt,
  };
  writeJson(p.requestFile, record);
  return { file: p.requestFile, prompt, record };
}

/* ───────────────────────── 启动检查 ───────────────────────── */

/**
 * 只读检查：status → 冲突/未就位/就绪。**任何分支都不写 connector。**
 */
export async function runStartupCheck({
  apiBase,
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = Date.now(),
  log = () => {},
} = {}) {
  const prev = readJson(rendererPaths(env).mcpState);
  const bootstrap = readBootstrapState(env);

  let status;
  try {
    status = await callApi(apiBase, 'status', {}, { fetchImpl });
  } catch (error) {
    log(`connector api 不可达（${apiBase}）：${error.message}`);
    return {
      action: 'unreachable',
      conflict: null,
      bootstrap,
      state: { ...prev, ok: false, error: `connector api unreachable: ${error.message}`, updatedAt: now },
    };
  }

  const decision = decideAction(status, { env });
  log(`决策 ${decision.action}：${decision.reason}（key=${decision.key}）`);

  if (decision.action === 'conflict') {
    return {
      action: 'conflict',
      conflict: decision.connection,
      bootstrap,
      state: {
        ...prev,
        ok: false,
        conflict: decision.connection ?? null,
        error: 'connector connection uses the same serverName',
        updatedAt: now,
      },
    };
  }
  if (decision.action === 'bootstrap-needed') {
    const p = rendererPaths(env);
    log(`依赖未就位，需要 bootstrap：venv=${p.venvPython} server=${p.serverEntry}`);
    return {
      action: 'bootstrap-needed',
      conflict: null,
      bootstrap,
      state: { ...prev, ok: false, conflict: null, error: 'renderer not installed', updatedAt: now },
    };
  }
  return {
    action: 'ok',
    conflict: null,
    bootstrap,
    state: { ...prev, ok: true, conflict: null, error: null, updatedAt: now },
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

/* ───────────────────────── bootstrap ───────────────────────── */

/**
 * 起一个 detached bootstrap，立刻返回。
 * `bootstrap.py` 在**插件目录**（lib/），状态目录只放产物。
 */
export function spawnBootstrap({ env = process.env, log = () => {}, spawnImpl = spawn } = {}) {
  const script = fileURLToPath(new URL('./bootstrap.py', import.meta.url));
  if (!existsSync(script)) {
    log(`bootstrap 脚本缺失：${script}`);
    return null;
  }
  const py = findBundledPython(env);
  if (!py) {
    log('找不到 DSH 自带 Python，无法自动安装依赖；面板里会给出可复制的手动命令');
    return null;
  }
  try {
    const child = spawnImpl(py, ['-u', script, '--stage', 'all'], {
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
 * 可选 seam：webServer 端口形状在不同 DSH 版本里不稳定，多种形状探测 + env 兜底。
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
    const apiBase = apiBaseFrom(sctx?.webServer);
    let last = null;

    // 面板需要的 MCP 状态与两个动作，全走插件自有路由（不碰 connector 配置）。
    const mcp = {
      state: async () => {
        const env = process.env;
        const bootstrap = readBootstrapState(env);
        let conflict = last?.conflict ?? null;
        let action = last?.action ?? null;
        let error = last?.state?.error ?? null;
        if (apiBase) {
          const result = await runStartupCheck({ apiBase, log });
          last = result;
          conflict = result.conflict;
          action = result.action;
          error = result.state?.error ?? null;
        }
        return {
          ok: Boolean(action === 'ok' || (action === 'bootstrap-needed' && bootstrap.ok)),
          action,
          conflict,
          error,
          bootstrap,
          ready: isReady(env),
          paths: rendererPaths(env),
          serverName: SERVER_NAME,
        };
      },
      retry: () => {
        const child = spawnBootstrap({ log });
        return { started: Boolean(child) };
      },
      requestDisable: () => {
        if (!last?.conflict) {
          // 还没跑过检查时补一次只读检测，避免凭空留痕
          return { ok: false, error: 'no conflict detected' };
        }
        const result = writeMigrationRequest(process.env, last.conflict);
        log(`已留痕停用请求：${result.file}`);
        return { ok: true, ...result };
      },
    };

    sctx.effect(() => {
      const dispose = sctx.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: createRoutes({ env: process.env, log, mcp }),
      });
      log(`模板选择页已挂到 ${ROUTE_PREFIX}/`);
      return () => dispose?.();
    }, 'plot-clone: template routes');

    if (!apiBase) {
      log('拿不到 webServer 端口，跳过 MCP 自检（headless 部署属正常）');
      return;
    }

    runStartupCheck({ apiBase, log })
      .then((result) => {
        last = result;
        persistMcpState(result.state);
        if (result.action === 'bootstrap-needed' && !result.bootstrap.running) {
          spawnBootstrap({ log });
        }
      })
      .catch((error) => log(`启动检查异常：${error?.message ?? error}`));
  });
}
