// dsh-plot-clone 插件壳自检：不连真 DSH、不连真 Origin，用本地假 connector API。
// 跑法: node test/selftest.mjs
//
// 钉住的三条硬要求（Chief 验收口径）：
//   1. 幂等键就是 custom-<serverName>（与既有记录 custom-dsh-origin 同键）
//   2. 已存在且 enabled → **只读不 configure**（请求序列只能是 ['status']）
//   3. configure 失败不落半条记录（state 里不许有 registered / connectionKey）

import assert from "node:assert/strict";
import { createServer } from "node:http";
import * as httpMod from "node:http";
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

/* ───────────── 10) 模板列表：49 条，缩略图只认 evidence PNG ───────────── */
const tm = await import("../lib/templates.js");
const rootDir = (await import("node:path")).dirname((await import("node:path")).dirname((await import("node:url")).fileURLToPath(import.meta.url)));
const tplDir = (await import("node:path")).join(rootDir, "templates");
let LIST = [];
{
  const index = tm.readIndex(tplDir);
  assert.ok(index, "templates/index.json 必须能读");
  LIST = tm.buildTemplateList(index, tplDir);
  assert.equal(LIST.length, 49, `模板数应为 49，实际 ${LIST.length}`);
  const impl = LIST.filter((t) => t.status === "implemented");
  const spec = LIST.filter((t) => t.status === "spec-only");
  assert.equal(impl.length, 9, `implemented 应为 9，实际 ${impl.length}`);
  assert.equal(spec.length, 40, `spec-only 应为 40，实际 ${spec.length}`);
  for (const t of impl) assert.ok(t.thumb, `implemented ${t.id} 必须有缩略图`);
  // 硬要求：spec-only 一律不许有 thumb（不许拿 implemented 的图冒充）
  const fake = spec.filter((t) => t.thumb !== null);
  assert.equal(fake.length, 0, `以下 spec-only 有缩略图（冒充）：${fake.map((t) => t.id).join(",")}`);
  for (const t of LIST) {
    assert.equal(typeof t.id, "string");
    assert.equal(typeof t.name, "string");
    assert.equal(typeof t.category, "string");
    assert.ok(Array.isArray(t.channels));
    assert.ok(t.status === "implemented" || t.status === "spec-only");
  }
  ok("列表 49 条（impl 9 / spec-only 40），spec-only 缩略图全 null", `impl=${impl.length} spec=${spec.length}`);
}

/* ───────────── 11) thumb 只认 evidence/<id>.png，目录穿越一律拒绝 ───────────── */
{
  assert.ok(tm.thumbFile(tplDir, "bar"), "bar 有实拍图");
  assert.equal(tm.thumbFile(tplDir, "violin"), null, "violin 只有规格，不许有图");
  assert.equal(tm.thumbFile(null, "bar"), null);

  // 穿越要能真抓住：造一个 evidence/ 之外的同名目标，去掉 id 白名单就会读到它
  const { dir } = freshHome();
  try {
    const pathMod = await import("node:path");
    mkdirSync(pathMod.join(dir, "evidence"), { recursive: true });
    writeFileSync(pathMod.join(dir, "evidence", "bar.png"), "png", "utf8");
    writeFileSync(pathMod.join(dir, "secret.png"), "leak", "utf8");
    assert.ok(tm.thumbFile(dir, "bar"), "fixture 里的合法图要能取到");
    assert.equal(tm.thumbFile(dir, "../secret"), null, "不许读到 evidence 之外的同名图");
    assert.equal(tm.thumbFile(dir, "../../etc/passwd"), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  ok("thumbFile 拒绝穿越与无图模板", "bar=ok violin=null ../secret=null");
}

/* ───────────── 12) 选中/收藏校验：非法 id 必须报错，不许静默丢弃 ───────────── */
{
  const ids = tm.idsOf(LIST);
  assert.equal(tm.validateSelection({ selected: "bar" }, ids).ok, true);
  assert.equal(tm.validateSelection({ selected: null }, ids).ok, true);
  const bad = tm.validateSelection({ selected: "nope" }, ids);
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /nope/);
  assert.equal(tm.validateSelection({ selected: 123 }, ids).ok, false);
  assert.equal(tm.validateSelection({ favorites: "bar" }, ids).ok, false);
  const badFav = tm.validateSelection({ favorites: ["bar", "ghost"] }, ids);
  assert.equal(badFav.ok, false);
  assert.match(badFav.errors[0], /ghost/);
  assert.equal(tm.validateSelection({}, ids).ok, false);
  assert.equal(tm.validateSelection(null, ids).ok, false);
  const dedupe = tm.validateSelection({ favorites: ["bar", "bar", "xrd"] }, ids);
  assert.equal(dedupe.ok, true);
  assert.deepEqual(dedupe.patch.favorites, ["bar", "xrd"]);
  ok("校验：非法 id 报错、重复收藏去重", `bad=${JSON.stringify(bad.errors)} dedupe=${JSON.stringify(dedupe.patch.favorites)}`);
}

/* ───────────── 13) 选中落盘：与 mcp-state.json 同目录，读回一致 ───────────── */
{
  const { dir, env } = freshHome();
  try {
    const selPath = tm.selectionPath(env);
    const pathMod = await import("node:path");
    const mcpDir = pathMod.dirname(mod.rendererPaths(env).mcpState);
    assert.equal(pathMod.dirname(selPath), mcpDir, "selection.json 必须与 mcp-state.json 同目录");
    assert.ok(selPath.endsWith("selection.json"));
    tm.writeSelection(selPath, { selected: "xrd", favorites: ["bar"], updatedAt: "2026-11-05T00:00:00.000Z" });
    const back = tm.readSelection(selPath);
    assert.equal(back.selected, "xrd");
    assert.deepEqual(back.favorites, ["bar"]);
    assert.equal(tm.readSelection(pathMod.join(dir, "missing.json")).selected, null);
    // 收藏增删
    const toggled = tm.toggleFavorite(back, "bar", tm.idsOf(LIST));
    assert.deepEqual(toggled.favorites, []);
    ok("落盘同目录 + 读回一致 + 收藏可删", `dir=${selPath.replace(/\\/g, "/")}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ───────────── 14) 三条路由：列表 / 缩略图字节 / 选中读写 ───────────── */
async function withRoutes(fn) {
  const { dir, env } = freshHome();
  const handler = tm.createRoutes({ env, templatesDir: tplDir });
  const server = createServer((req, res) => { handler(req, res); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await fn({ base: `http://127.0.0.1:${port}`, env, dir });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
}

function httpGet(url, method = "GET", body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = httpMod.request(
      { host: u.hostname, port: u.port, path: u.pathname + u.search, method, headers: body ? { "content-type": "application/json" } : {} },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      },
    );
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

{
  await withRoutes(async ({ base, env }) => {
    const list = await httpGet(`${base}/templates`);
    assert.equal(list.status, 200);
    const payload = JSON.parse(list.body.toString("utf8"));
    assert.equal(payload.count, 49);
    assert.equal(payload.templates.length, 49);
    assert.equal(payload.selected, null);

    const png = await httpGet(`${base}/thumb/bar`);
    assert.equal(png.status, 200);
    assert.equal(png.headers["content-type"], "image/png");
    assert.ok(png.body.length > 1000, `PNG 字节数应 >1000，实际 ${png.body.length}`);
    assert.equal(png.body.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "PNG magic");

    const noThumb = await httpGet(`${base}/thumb/violin`);
    assert.equal(noThumb.status, 404, "spec-only 没有实拍图必须 404，不许回占位图");
    assert.equal(JSON.parse(noThumb.body.toString("utf8")).code, "no-thumbnail");

    const post = await httpGet(`${base}/selection`, "POST", { selected: "xrd" });
    assert.equal(post.status, 200);
    const back = await httpGet(`${base}/selection`);
    assert.equal(JSON.parse(back.body.toString("utf8")).selected, "xrd", "POST 后 GET 必须读回同一个 id");
    const onDisk = JSON.parse((await import("node:fs")).readFileSync(tm.selectionPath(env), "utf8"));
    assert.equal(onDisk.selected, "xrd");

    const fav = await httpGet(`${base}/selection`, "POST", { favorites: ["bar", "xrd"] });
    assert.equal(fav.status, 200);
    const favBack = JSON.parse((await httpGet(`${base}/selection`)).body.toString("utf8"));
    assert.deepEqual(favBack.favorites, ["bar", "xrd"]);
    const unfav = await httpGet(`${base}/selection`, "POST", { favorites: ["xrd"] });
    assert.equal(unfav.status, 200);
    const afterUnfav = JSON.parse((await httpGet(`${base}/selection`)).body.toString("utf8"));
    assert.deepEqual(afterUnfav.favorites, ["xrd"], "收藏必须能删");

    const clear = await httpGet(`${base}/selection`, "POST", { selected: null });
    assert.equal(clear.status, 200);
    assert.equal(JSON.parse((await httpGet(`${base}/selection`)).body.toString("utf8")).selected, null);

    const bad = await httpGet(`${base}/selection`, "POST", { selected: "ghost" });
    assert.equal(bad.status, 400);
    assert.match(JSON.parse(bad.body.toString("utf8")).errors[0], /ghost/);

    const page = await httpGet(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers["content-type"], /text\/html/);
    const html = page.body.toString("utf8");
    assert.match(html, /无实拍/, "页面必须有 spec-only 占位文案");
    assert.match(html, /用这个/);
    assert.equal(/<script[^>]+src=|<link[^>]+rel="stylesheet"/i.test(html), false, "不许依赖外部 CDN/样式表");

    const miss = await httpGet(`${base}/nope`);
    assert.equal(miss.status, 404);

    ok(
      "路由：列表 49 / thumb image-png / POST→GET 读回 / 收藏可删 / 非法 id 400",
      `png=${png.body.length}B list=${payload.count} page=${html.length}B`,
    );
  });
}

/* ───────────── 15. 侧栏标签客户端：文件与 package.json 契约 ───────────── */
{
  const fsMod = await import("node:fs");
  const clientPath = join(rootDir, "lib", "client.js");
  assert.equal(fsMod.existsSync(clientPath), true, "lib/client.js 必须存在");
  const src = fsMod.readFileSync(clientPath, "utf8");
  assert.ok(src.length > 2000, `client.js 太小：${src.length}B`);
  // classic script：出现 import/export 声明，ModuleLoader 载入即语法错误
  assert.equal(/^\s*(import|export)\s/m.test(src), false, "client.js 必须是 classic script，不许 import/export 语句");
  assert.match(src, /window\.__ModuleLoader__\.load\(/);
  assert.match(src, /"sidebar\.right\.pane\.tab"/, "必须注册到 sidebar.right.pane.tab");
  assert.match(src, /sidebarRightTabs/, "必须通过 sidebarRightTabs 注册 tab type");
  assert.match(src, /"dsh-plot-clone\/templates"/, "TAB_ID 必须钉死");
  assert.match(src, /typeof tabs\.register !== "function"/, "拿不到 slot 时必须安全跳过而不是抛异常");
  assert.match(src, /无实拍/, "spec-only 卡片必须有「无实拍」占位文案");

  const pkg = JSON.parse(fsMod.readFileSync(join(rootDir, "package.json"), "utf8"));
  assert.equal(pkg.exports["./client"], "./lib/client.js", "exports 必须暴露 ./client");
  assert.equal(pkg.dsh.client.platform, "web");
  assert.equal(pkg.dsh.client.immediately, true);
  assert.ok(Array.isArray(pkg.dsh.client.inject) && pkg.dsh.client.inject.length > 0, "dsh.client.inject 不许空");
  assert.ok(pkg.files.includes("lib/client.js"), "files 漏了 lib/client.js：pnpm 装完会缺文件，侧栏标签静默消失");
  assert.ok(pkg.files.includes("lib/templates.js") && pkg.files.includes("lib/page.js"), "files 漏了 templates/page");

  ok(
    "侧栏标签客户端：文件 + dsh.client + files",
    `client=${src.length}B exports[./client]=${pkg.exports["./client"]} inject=${pkg.dsh.client.inject.join(",")}`,
  );
}

/* ───────────── 16. 侧栏标签：在假宿主里真跑 apply ───────────── */
{
  const fsMod = await import("node:fs");
  const vmMod = await import("node:vm");
  const src = fsMod.readFileSync(join(rootDir, "lib", "client.js"), "utf8");
  const sandbox = {
    window: {},
    document: { getElementById: () => null, head: { appendChild: () => {} }, createElement: () => ({}) },
    console: { warn: () => {}, log: () => {}, error: () => {} },
    fetch: async () => ({ ok: false, status: 0, json: async () => null }),
  };
  sandbox.window.__ModuleLoader__ = { load: (cfg) => { sandbox.__cfg = cfg; } };
  sandbox.globalThis = sandbox;
  vmMod.createContext(sandbox);
  vmMod.runInContext(src, sandbox, { filename: "client.js" });

  const cfg = sandbox.__cfg;
  assert.ok(cfg !== undefined, "client.js 必须调用 window.__ModuleLoader__.load");
  assert.equal(cfg.id, "dsh-plot-clone");
  const plugin = cfg.factory((name) =>
    name === "react" ? { useEffect() {}, useMemo() {}, useRef() {}, useState() {} } : { jsx: () => null }
  );
  assert.equal(typeof plugin.apply, "function", "插件对象必须有 apply");

  // 现代宿主：tab type 1 条 + 内容/标题 2 条
  const types = [];
  const slotRegs = [];
  const slotsApi = {
    inject: (name, cb) => cb(slotsApi),
    register: (spec) => {
      slotRegs.push({ name: spec.name, key: spec.key });
      return () => {};
    },
  };
  plugin.apply({
    slots: slotsApi,
    inject: (names, cb) =>
      cb({ get: (n) => (n === "sidebarRightTabs" ? { register: (spec) => { types.push(spec); return () => {}; } } : undefined) }),
  });
  assert.equal(types.length, 1, "tab type 只能注册 1 条");
  assert.equal(types[0].id, "dsh-plot-clone/templates");
  assert.equal(types[0].kind, "plot-clone-templates");
  assert.equal(types[0].title(), "模板");
  assert.deepEqual(slotRegs.map((r) => r.name), ["sidebar.right.pane.tab", "sidebar.right.pane.tab.title"]);
  assert.ok(slotRegs.every((r) => r.key === "dsh-plot-clone/templates" && r.key === types[0].id), "slot key 必须等于 tab id");

  // 老宿主：service / slots 各种缺失都不许抛
  let threw = null;
  try {
    plugin.apply({ inject: (names, cb) => cb({ get: () => undefined }) });
    plugin.apply({ slots: undefined, inject: (names, cb) => cb({ get: () => undefined }) });
    plugin.apply({});
    plugin.apply(null);
  } catch (error) {
    threw = error;
  }
  assert.equal(threw, null, `老宿主不许抛异常炸侧栏，实际：${threw && threw.message}`);

  ok(
    "侧栏标签：假宿主里 apply 注册 tab type + 2 slots，老宿主不抛",
    `types=${types.length} slots=${slotRegs.length} key=${types[0].id}`,
  );
}

console.log(`\nselftest ok: ${passed}/${passed} 通过（幂等键 / 只读复用 / configure 失败不落半条 / patch 形态 / 模板列表 / 缩略图 / 选中落盘 / 三条路由 / 侧栏标签契约 / 侧栏 apply）`);
