#!/usr/bin/env node
/**
 * patch_check.mjs — 随包 MCP 的静态契约 + 真机握手
 * ================================================
 *
 * 为什么需要它：`cordis.patch.yml` 是**纯声明**，写错了 DSH 启动时只会静静少一条
 * 工具（或直接 duplicate loader entry id）。单元测试不经过宿主 loader，所以这里
 * 独立做两件事：
 *
 *   1. 静态：解析自己的 patch（2 条 insert、id 唯一、name/serverName/超时/
 *      fail-soft 正确、`!!js` 只拼 process.env 不碰 require/fs/child_process），
 *      再把本机所有 profile bundle 的 insert 条目扫一遍，断言我们的 id 不撞；
 *   2. 握手：真起 server 走 MCP initialize + tools/list，断言 serverInfo 与工具数。
 *
 * 用法：
 *   node test/patch_check.mjs            # 静态 + 握手
 *   node test/patch_check.mjs --static   # 只做静态（CI/无 Origin 环境）
 *   node test/patch_check.mjs --mutate   # 跑三条变异，证明断言真的会红
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(HERE);
const PATCH = join(REPO, 'cordis.patch.yml');
const SERVER_ENTRY = join(REPO, 'server', 'origin_mcp_stdio.py');
const PACKAGE = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));

const MCP_ID = 'plot-clone-origin-mcp';
const SERVER_NAME = 'dsh-origin';
const EXPECTED_TOOLS = 76;
// serverInfo.version 的单一真源是插件 package.json；这里不写死任何版本号。
const EXPECTED_SERVER_INFO = { name: 'origin', version: PACKAGE.version };

let pass = 0;
const failures = [];
function ok(condition, message) {
  if (condition) {
    pass += 1;
    console.log(`ok ${pass} - ${message}`);
  } else {
    failures.push(message);
    console.log(`FAIL - ${message}`);
  }
}

/* ───────────── 极简 YAML 解析：只认本文件用到的形状（insert 列表 + config 标量） ───────────── */

const unquote = (value) => {
  const v = String(value ?? '').trim();
  if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) return v.slice(1, -1);
  return v;
};

export function parsePatch(text) {
  const lines = String(text).split(/\r?\n/);
  const entries = [];
  const jsExprs = [];
  let inInsert = false;
  let cur = null;
  for (const line of lines) {
    if (/^-\s+insert:\s*$/.test(line) || /^-\s*insert:\s*$/.test(line)) {
      inInsert = true;
      cur = null;
      continue;
    }
    // 顶层下一个 key（`- foo:` 顶格）结束 insert 段
    if (inInsert && /^-[a-z]/i.test(line)) {
      inInsert = false;
      cur = null;
      continue;
    }
    if (inInsert) {
      const idMatch = /^\s+-\s+id:\s*(.+?)\s*$/.exec(line);
      if (idMatch) {
        cur = { id: unquote(idMatch[1]), name: null, config: {} };
        entries.push(cur);
        continue;
      }
      if (cur !== null) {
        const nameMatch = /^\s+name:\s*(.+?)\s*$/.exec(line);
        if (nameMatch) cur.name = unquote(nameMatch[1]);
        const kv = /^\s{6,}([A-Za-z][\w]*):\s*(.*?)\s*$/.exec(line);
        if (kv && !line.includes('!!js')) {
          const key = kv[1];
          if (key !== 'id' && key !== 'name') {
            const raw = unquote(kv[2]);
            cur.config[key] = /^(true|false)$/i.test(raw) ? raw.toLowerCase() === 'true' : /^\d+$/.test(raw) ? Number(raw) : raw;
          }
        }
      }
    }
    if (line.includes('!!js') && !line.trim().startsWith('#')) jsExprs.push(line.trim());
  }
  return { entries, jsExprs };
}

/* ───────────── 静态断言 ───────────── */

export function checkStatic(text, label = 'cordis.patch.yml') {
  const { entries, jsExprs } = parsePatch(text);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  ok(entries.length === 2, `${label}: 恰好 2 条 insert 条目（实际 ${entries.length}）`);
  ok(byId.size === entries.length, `${label}: 条目 id 不重复`);
  ok(byId.has('plot-clone') && byId.get('plot-clone').name === 'dsh-plot-clone', `${label}: 自挂载条目 name=包名`);
  ok(byId.has(MCP_ID), `${label}: 存在 ${MCP_ID}`);

  const mcp = byId.get(MCP_ID) ?? { config: {} };
  ok(mcp.name === '@deepseek-ai/dsh-mcp-client', `${label}: MCP 条目 name 是官方 client`);
  ok(mcp.config.serverName === SERVER_NAME, `${label}: serverName 保持 ${SERVER_NAME}（工具前缀不变）`);
  ok(mcp.config.transport === 'stdio', `${label}: transport=stdio`);
  ok(mcp.config.failOnStartupError === false, `${label}: failOnStartupError=false（装坏不拖垮 DSH 启动）`);
  ok(mcp.config.toolCallTimeoutMs === 120000, `${label}: toolCallTimeoutMs=120000`);

  ok(jsExprs.length === 3, `${label}: 3 处 !!js（command / args 路径 / cwd）`);
  for (const line of jsExprs) {
    ok(line.includes('process.env'), `${label}: !!js 只拼 process.env → ${line.slice(0, 60)}…`);
    ok(
      !/\brequire\s*\(|child_process|\bfs\.|import\s*\(/.test(line),
      `${label}: !!js 不含 require/fs/child_process/import`
    );
  }
  ok(jsExprs.every((line) => line.includes('/dsh-plot-clone/')), `${label}: !!js 路径都落在 DSH_HOME/dsh-plot-clone`);
}

/* ───────────── 组合检查：本机所有 bundle 的 insert id 不撞 ───────────── */

function dshHome() {
  return process.env.DSH_HOME || join(process.env.USERPROFILE || homedir(), '.dsh');
}

function listBundlePatches() {
  const out = [];
  const profiles = join(dshHome(), 'profiles');
  let names = [];
  try {
    names = readdirSync(profiles, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return out;
  }
  for (const profile of names) {
    const modules = join(profiles, profile, 'node_modules');
    let dirs = [];
    try {
      dirs = readdirSync(modules, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      if (dir.name.startsWith('@')) {
        // scoped package：@scope/name/cordis.patch.yml
        let scoped = [];
        try {
          scoped = readdirSync(join(modules, dir.name), { withFileTypes: true }).filter((d) => d.isDirectory());
        } catch {
          continue;
        }
        for (const sub of scoped) {
          const patch = join(modules, dir.name, sub.name, 'cordis.patch.yml');
          if (existsSync(patch)) out.push(patch);
        }
        continue;
      }
      const patch = join(modules, dir.name, 'cordis.patch.yml');
      if (existsSync(patch)) out.push(patch);
    }
  }
  return out;
}

export function checkComposition(ourText, bundlePatches = listBundlePatches()) {
  const ours = parsePatch(ourText).entries.map((entry) => entry.id);
  for (const id of ours) {
    const hits = [];
    for (const file of bundlePatches) {
      if (file === PATCH) continue;
      // 同一个 bundle 的已装副本（pnpm 从 file: 依赖拷过去的快照）本来就有同 id，
      // 那是「这一份插件自己」，不算别的 bundle 撞车。
      if (/[\\/]node_modules[\\/]dsh-plot-clone[\\/]/.test(file)) continue;
      let text = '';
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      if (parsePatch(text).entries.some((entry) => entry.id === id)) hits.push(file);
    }
    ok(hits.length === 0, `组合检查: id ${id} 未被别的 bundle 占用${hits.length ? `（撞：${hits.join('; ')}）` : ''}`);
  }
}

/* ───────────── 握手 ───────────── */

function findPython() {
  const candidates = [
    process.env.DSH_PLOT_CLONE_PYTHON,
    join(dshHome(), 'dsh-plot-clone', 'venv', 'Scripts', 'python.exe'),
    join(dshHome(), 'origin-plugin-venv', 'Scripts', 'python.exe'),
  ];
  return candidates.find((p) => p && existsSync(p)) ?? null;
}

export async function handshake({ timeoutMs = 60000, expectVersion = EXPECTED_SERVER_INFO.version, extraEnv = {}, label = '握手' } = {}) {
  const python = findPython();
  if (!python) {
    ok(false, `${label}: 找不到 python（先让插件建好 venv，或设 DSH_PLOT_CLONE_PYTHON）`);
    return;
  }
  if (!existsSync(SERVER_ENTRY)) {
    ok(false, `${label}: server 入口缺失 ${SERVER_ENTRY}`);
    return;
  }

  const child = spawn(python, ['-u', '-X', 'utf8', SERVER_ENTRY], {
    cwd: dirname(SERVER_ENTRY),
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1', ...extraEnv },
  });

  let buffer = '';
  const pending = new Map();
  const stderr = [];

  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      const waiter = pending.get(message.id);
      if (waiter) {
        pending.delete(message.id);
        waiter(message);
      }
    }
  });
  child.stderr.on('data', (chunk) => stderr.push(chunk.toString('utf8')));

  const request = (payload) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(payload.id);
        reject(new Error(`timeout waiting for id=${payload.id}`));
      }, timeoutMs);
      pending.set(payload.id, (message) => {
        clearTimeout(timer);
        resolve(message);
      });
      child.stdin.write(`${JSON.stringify(payload)}\n`);
    });

  try {
    const init = await request({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'plot-clone-patch-check', version: '2.9.0' },
      },
    });
    const info = init?.result?.serverInfo ?? {};
    ok(info.name === EXPECTED_SERVER_INFO.name, `${label}: serverInfo.name=${JSON.stringify(info.name)}`);
    ok(
      info.version === expectVersion,
      `${label}: serverInfo.version=${JSON.stringify(info.version)}（期望 ${JSON.stringify(expectVersion)}）`,
    );

    // initialized 通知：无 id、不需要回包
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);

    const list = await request({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const tools = Array.isArray(list?.result?.tools) ? list.result.tools : [];
    ok(tools.length === EXPECTED_TOOLS, `${label}: tools/list 返回 ${tools.length} 个工具（期望 ${EXPECTED_TOOLS}）`);
    const head = tools.slice(0, 5).map((tool) => tool.name).join(', ');
    ok(tools.slice(0, 5).every((tool) => typeof tool.name === 'string'), `${label}: 前 5 个工具 ${head}`);
    console.log(`${label}原始回包: ${JSON.stringify({ serverInfo: info, tools: tools.length, first5: tools.slice(0, 5).map((t) => t.name) })}`);
    if (stderr.length > 0) console.log(`server stderr: ${stderr.join('').slice(0, 400)}`);
  } catch (error) {
    ok(false, `握手失败: ${error.message}`);
  } finally {
    try {
      child.stdin.end();
    } catch {
      /* ignore */
    }
    child.kill();
  }
}

/* ───────────── 三条变异：证明断言会红 ───────────── */

function runMutations() {
  const original = readFileSync(PATCH, 'utf8');
  const cases = [
    {
      name: 'id 改成 mcp-origin（与 origin 插件撞 id）',
      text: original.replace(`- id: ${MCP_ID}`, '- id: mcp-origin'),
      expect: /id 未被别的 bundle 占用|存在 plot-clone-origin-mcp/,
    },
    {
      name: 'serverName 改成 origin（工具前缀漂移）',
      text: original.replace(`serverName: ${SERVER_NAME}`, 'serverName: origin'),
      expect: /serverName 保持/,
    },
    {
      name: '!!js 里用 require（loader 没有 require）',
      text: original.replace(
        "!!js (process.env.DSH_HOME || (String(process.env.USERPROFILE) + '/.dsh')) + '/dsh-plot-clone/server/origin_mcp_stdio.py'",
        "!!js require('path').join(process.env.DSH_HOME, 'server/origin_mcp_stdio.py')"
      ),
      expect: /不含 require|只拼 process.env/,
    },
  ];
  for (const item of cases) {
    const before = failures.length;
    const passBefore = pass;
    const lines = [];
    const originalLog = console.log;
    console.log = (line) => lines.push(String(line));
    try {
      // 直接跑静态检查；变异必须产生 FAIL 行
      ok(item.text !== original, `${item.name}: 变异已生效`);
      checkStatic(item.text, `[变异] ${item.name}`);
    } finally {
      console.log = originalLog;
    }
    const caught = lines.some((line) => line.startsWith('FAIL') && item.expect.test(line));
    // 回滚变异产生的计数（这些是刻意制造的红，不算本轮的通过数）
    pass = passBefore;
    failures.length = before;
    ok(caught, `变异真红: ${item.name}`);
  }
}

/* ───────────── 随包快照：VENDOR.md / LICENSE / 升级通道 ───────────── */

export function checkVendor() {
  const vendorPath = join(REPO, 'server', 'VENDOR.md');
  const licensePath = join(REPO, 'server', 'LICENSE');
  const syncPath = join(REPO, 'scripts', 'vendor_sync.mjs');
  ok(existsSync(vendorPath), 'vendored: server/VENDOR.md 存在');
  ok(existsSync(licensePath), 'vendored: server/LICENSE 存在');
  ok(existsSync(syncPath), 'vendored: scripts/vendor_sync.mjs 存在');

  if (existsSync(licensePath)) {
    const license = readFileSync(licensePath, 'utf8');
    ok(/MIT License/i.test(license), 'vendored: LICENSE 是 MIT');
    ok(license.includes('Copyright (c) 2026 Fantasality'), 'vendored: LICENSE 保留版权行');
  }

  if (existsSync(vendorPath)) {
    const vendor = readFileSync(vendorPath, 'utf8');
    ok(vendor.includes('03acc24181aae6c6ac3a8502aa6ae24a8d1708da'), 'vendored: VENDOR 记录 fork commit');
    ok(vendor.includes('origin_new_project'), 'vendored: VENDOR 记录相对上游的改动');
    const rows = [...vendor.matchAll(/^\| `([^`]+)` \| (\d+) \| `([0-9a-f]{64})` \|$/gm)];
    ok(rows.length > 20, `vendored: VENDOR 哈希表 ${rows.length} 行（期望 >20）`);
    let bad = 0;
    let missing = 0;
    for (const [, name, size, sha] of rows) {
      const file = join(REPO, 'server', name);
      if (!existsSync(file)) {
        missing += 1;
        continue;
      }
      const body = readFileSync(file);
      const digest = createHash('sha256').update(body).digest('hex');
      if (digest !== sha || body.length !== Number(size)) bad += 1;
    }
    ok(missing === 0, `vendored: 哈希表里的文件都存在（缺 ${missing}）`);
    ok(bad === 0, `vendored: 逐文件 sha256/字节与 VENDOR 一致（不符 ${bad}）`);
  }

  if (existsSync(syncPath)) {
    const sync = readFileSync(syncPath, 'utf8');
    ok(!/\bfetch\s*\(/.test(sync) && !/node:https?/.test(sync), 'vendored: vendor_sync 不联网（无 fetch/http 模块）');
    ok(/--from/.test(sync) && /--json/.test(sync), 'vendored: vendor_sync 提供 --from/--json 且只打印');
  }
}

/* ───────────── 空闲释放单测（不需要 Origin） ───────────── */

async function checkIdleRelease() {
  const python = findPython();
  const script = join(HERE, 'origin_idle_test.py');
  if (!python) {
    ok(false, '空闲释放: 找不到 python（先让插件建好 venv，或设 DSH_PLOT_CLONE_PYTHON）');
    return;
  }
  if (!existsSync(script)) {
    ok(false, `空闲释放: 缺 ${script}（package.json files 要包含 test/origin_idle_test.py）`);
    return;
  }
  const child = spawn(python, ['-u', '-X', 'utf8', script], {
    cwd: REPO,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
  });
  let out = '';
  child.stdout.on('data', (chunk) => { out += chunk.toString('utf8'); });
  child.stderr.on('data', (chunk) => { out += chunk.toString('utf8'); });
  const code = await new Promise((resolve) => child.on('close', resolve));
  const lines = out.trim().split('\n').filter(Boolean);
  const last = lines.length ? lines[lines.length - 1] : '(no output)';
  const match = /origin_idle selftest ok: (\d+)\/\1/.exec(out);
  ok(code === 0 && Boolean(match),
     `空闲释放: 单测 ${match ? `${match[1]} 项全过` : '失败'} | ${last}`);
}

/* ───────────── main ───────────── */

const args = new Set(process.argv.slice(2));
const text = readFileSync(PATCH, 'utf8');

checkStatic(text);
checkComposition(text);
checkVendor();
if (!args.has('--static')) {
  await checkIdleRelease();
}

if (args.has('--mutate')) {
  runMutations();
}

if (!args.has('--static')) {
  await handshake();
  // 可证伪：把单一真源指到一个版本不同的临时 package.json，握手必须跟着变。
  // 这一条如果过，说明 server 里没有第二份硬编码版本号。
  const tmp = mkdtempSync(join(tmpdir(), 'pc-version-'));
  try {
    const fake = join(tmp, 'package.json');
    writeFileSync(fake, JSON.stringify({ name: PACKAGE.name, version: '9.9.9-vendor-test' }), 'utf8');
    await handshake({
      expectVersion: '9.9.9-vendor-test',
      extraEnv: { PLOT_CLONE_PACKAGE_JSON: fake },
      label: '握手(版本可变)',
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

console.log(`\npatch_check ok: ${pass}, failed: ${failures.length}`);
if (failures.length > 0) {
  console.log('failures:');
  for (const message of failures) console.log(` - ${message}`);
  process.exit(1);
}
console.log('ALL_OK');
