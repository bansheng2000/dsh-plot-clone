// dsh-plot-clone 插件壳自检：不连真 DSH、不连真 Origin，用本地假 connector API。
// 跑法: node test/selftest.mjs
//
// 钉住的三条硬要求（Chief 验收口径）：
//   1. 幂等键就是 custom-<serverName>（与既有记录 custom-dsh-origin 同键）
//   2. 已存在且 enabled → **只读不 configure**（请求序列只能是 ['status']）
//   3. configure 失败不落半条记录（state 里不许有 registered / connectionKey）

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const mod = await import("../lib/index.js");

let passed = 0;
function ok(label, detail = "") {
  passed += 1;
  console.log(`ok ${passed} - ${label}${detail ? ` | ${detail}` : ""}`);
}

/* ───────────── 假 connector：记录每个 method，按表回包 ───────────── */
async function withFakeConnector(handlers, fn) {
  const calls = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let parsed = {};
      try {
        parsed = JSON.parse(body || "{}");
      } catch {
        /* 保持空对象，下面按 unknown method 回 */
      }
      calls.push({ method: parsed.method, params: parsed.params });
      const handler = handlers[parsed.method];
      const payload = typeof handler === "function" ? handler(parsed.params) : { ok: false, message: "unknown method" };
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(payload));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await fn({ apiBase: `http://127.0.0.1:${port}`, calls });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function freshHome() {
  const dir = mkdtempSync(join(tmpdir(), "plot-clone-selftest-"));
  return { dir, env: { DSH_HOME: "", USERPROFILE: dir } };
}

function installFakeRenderer(env) {
  const p = mod.rendererPaths(env);
  mkdirSync(join(p.dir, "venv", "Scripts"), { recursive: true });
  mkdirSync(join(p.dir, "server"), { recursive: true });
  writeFileSync(p.venvPython, "", "utf8");
  writeFileSync(p.serverEntry, "# fake\n", "utf8");
  return p;
}

const STATUS_WITH = (enabled) => () => ({
  ok: true,
  detail: { items: [{ key: "custom-dsh-origin", serverName: "dsh-origin", enabled, transport: "stdio" }] },
});
const STATUS_EMPTY = () => ({ ok: true, detail: { items: [] } });

/* ───────────── 1) 幂等键 ───────────── */
{
  const key = mod.connectionKeyFor(mod.SERVER_NAME);
  assert.equal(key, "custom-dsh-origin");
  assert.equal(mod.connectionKeyFor("origin"), "custom-origin");
  ok("幂等键 = custom-<serverName>", `serverName=${mod.SERVER_NAME} -> ${key}`);
}

/* ───────────── 2) 已存在且 enabled → 只读不 configure ───────────── */
{
  const { dir, env } = freshHome();
  try {
    await withFakeConnector({ status: STATUS_WITH(true) }, async ({ apiBase, calls }) => {
      const result = await mod.runStartupCheck({ apiBase, env });
      assert.equal(result.action, "reuse");
      const methods = calls.map((c) => c.method);
      assert.deepEqual(methods, ["status"], `只能发 status，实际发了 ${JSON.stringify(methods)}`);
      ok("已存在且 enabled → reuse 且只发 status", `requests=${JSON.stringify(methods)}`);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ───────────── 3) 已存在但 disabled → 不擅自启用，仍只读 ───────────── */
{
  const { dir, env } = freshHome();
  try {
    await withFakeConnector({ status: STATUS_WITH(false) }, async ({ apiBase, calls }) => {
      const result = await mod.runStartupCheck({ apiBase, env });
      assert.equal(result.action, "enable");
      const methods = calls.map((c) => c.method);
      assert.deepEqual(methods, ["status"], "disabled 时也不许发 configure/setEnabled");
      ok("已存在但 disabled → enable 决策且只读", `requests=${JSON.stringify(methods)}`);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ───────────── 4) 不存在且依赖未就位 → bootstrap-needed，不发 configure ───────────── */
{
  const { dir, env } = freshHome();
  try {
    await withFakeConnector({ status: STATUS_EMPTY }, async ({ apiBase, calls }) => {
      const result = await mod.runStartupCheck({ apiBase, env });
      assert.equal(result.action, "bootstrap-needed");
      assert.deepEqual(calls.map((c) => c.method), ["status"]);
      ok("依赖未就位 → bootstrap-needed 且不发 configure", `requests=${JSON.stringify(calls.map((c) => c.method))}`);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ───────────── 5) configure 失败不落半条记录 ───────────── */
{
  const { dir, env } = freshHome();
  try {
    installFakeRenderer(env);
    await withFakeConnector(
      {
        status: STATUS_EMPTY,
        configure: () => ({ ok: false, message: 'MCP Server "dsh-origin" 未完成启动' }),
      },
      async ({ apiBase, calls }) => {
        const result = await mod.runStartupCheck({ apiBase, env });
        assert.equal(result.action, "register");
        const methods = calls.map((c) => c.method);
        assert.deepEqual(methods, ["status", "configure"]);
        assert.equal(result.state.ok, false);
        assert.equal("registered" in result.state, false, "失败时不许留 registered");
        assert.equal("connectionKey" in result.state, false, "失败时不许留 connectionKey");
        assert.match(result.state.error, /未完成启动/);
        ok(
          "configure 失败 → 无 registered/connectionKey",
          `state=${JSON.stringify(result.state)}`,
        );
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ───────────── 6) configure 成功 → registered + 记录 key ───────────── */
{
  const { dir, env } = freshHome();
  try {
    const paths = installFakeRenderer(env);
    await withFakeConnector(
      {
        status: STATUS_EMPTY,
        configure: () => ({ ok: true, detail: { key: "custom-dsh-origin", serverName: "dsh-origin" } }),
      },
      async ({ apiBase, calls }) => {
        const result = await mod.runStartupCheck({ apiBase, env });
        assert.equal(result.action, "register");
        assert.equal(result.state.registered, true);
        assert.equal(result.state.connectionKey, "custom-dsh-origin");
        // 提交的记录必须指向我们自己那套 venv/server，而不是用户已装的那份
        const sent = calls.find((c) => c.method === "configure").params;
        assert.equal(sent.command, paths.venvPython);
        assert.deepEqual(sent.args, [paths.serverEntry]);
        assert.equal(sent.serverName, "dsh-origin");
        assert.equal(sent.transport, "stdio");
        ok(
          "configure 成功 → registered 且记录指向自建 venv",
          `key=${result.state.connectionKey} command=${sent.command.replace(/\\/g, "/")}`,
        );
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ───────────── 7) mergeConfigureResult：成功后再失败要清干净 ───────────── */
{
  const good = mod.mergeConfigureResult({}, { ok: true, detail: { key: "custom-dsh-origin", serverName: "dsh-origin" } }, 1000);
  const bad = mod.mergeConfigureResult(good, { ok: false, message: "boom" }, 2000);
  assert.equal(good.registered, true);
  assert.equal("registered" in bad, false);
  assert.equal(bad.ok, false);
  assert.equal(bad.error, "boom");
  ok("merge：成功后失败会清 registered/connectionKey", `good.registered=${good.registered} bad.registered=${"registered" in bad}`);
}

/* ───────────── 8) connector API 不可达 → unreachable，不抛 ───────────── */
{
  const { dir, env } = freshHome();
  try {
    const result = await mod.runStartupCheck({ apiBase: "http://127.0.0.1:9", env, fetchImpl: async () => {
      throw new Error("connect ECONNREFUSED");
    } });
    assert.equal(result.action, "unreachable");
    assert.match(result.state.error, /unreachable/);
    ok("connector 不可达 → unreachable（不抛异常）", `error=${result.state.error}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ───────────── 9) patch 形态：必须 insert，不许顶层扁平 ───────────── */
{
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join: joinPath } = await import("node:path");
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const patch = readFileSync(joinPath(root, "cordis.patch.yml"), "utf8");
  const first = patch.split("\n").find((line) => line.trim() && !line.trim().startsWith("#"));
  assert.equal(first?.trim(), "- insert:", `bundle patch 首个有效行必须是 - insert:，实际 ${first}`);
  assert.match(patch, /name: dsh-plot-clone/);
  ok("cordis.patch.yml 用 - insert: 形态", `first=${first.trim()}`);
}

console.log(`\nselftest ok: ${passed}/${passed} 通过（幂等键 / 只读复用 / configure 失败不落半条 / patch 形态）`);
