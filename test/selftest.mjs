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
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

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
  // 2026-11-05：20 个 spec-only 批量实跑，18 个转 implemented（27 = 原 9 + 18），
  // horizontal_bar / bland_altman 仍 spec-only（分组失效 / 缺 LoA 参考线）。
  assert.equal(impl.length, 27, `implemented 应为 27，实际 ${impl.length}`);
  assert.equal(spec.length, 22, `spec-only 应为 22，实际 ${spec.length}`);
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
  const server = createServer((req, res) => {
    // 模拟宿主 seam：handler 返回 undefined 表示「不是我的路径」，交给下一个 handler。
    Promise.resolve(handler(req, res))
      .then((out) => {
        if (out === undefined && !res.headersSent && !res.writableEnded) {
          res.writeHead(404, { "content-type": "text/plain" });
          res.end("host-fallthrough");
        }
      })
      .catch(() => {});
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    // base 带自有前缀：下面 `${base}/templates` 这类写法都落在 ROUTE_PREFIX 下；
    // root 是不带前缀的裸 origin，用来验证「不认识的前缀必须让位」。
    return await fn({ base: `http://127.0.0.1:${port}${tm.ROUTE_PREFIX}`, root: `http://127.0.0.1:${port}`, env, dir });
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

/* ───────────── 14b) 路由前缀纪律 + 客户端诊断端点 ───────────── */
{
  assert.equal(tm.ROUTE_PREFIX, "/plot-clone", "自有路由必须挂在独立前缀上，不再占用宿主命名空间");
  assert.equal(
    tm.ROUTE_PREFIX.includes("/plugins/dsh-plot-clone"),
    false,
    "自有路由不得注册在 /plugins/dsh-plot-clone 下——宿主从那里下发 client bundle，占了就是 404 + 标签永远 unavailable",
  );

  await withRoutes(async ({ base, root }) => {
    tm.resetDiag();

    // 1) POST 落一条，GET 读回
    const post = await httpSend(
      `${base}/diag`,
      "POST",
      Buffer.from(JSON.stringify({ phase: "probe", detail: "hello" })),
      { "content-type": "application/json" },
    );
    assert.equal(post.status, 200, `POST /diag 应 200，实际 ${post.status}`);
    assert.equal(JSON.parse(post.body.toString("utf8")).ok, true);
    const got = JSON.parse((await httpGet(`${base}/diag`)).body.toString("utf8"));
    assert.equal(got.entries.length, 1, `GET /diag 应读回 1 条，实际 ${got.entries.length}`);
    assert.equal(got.entries[0].phase, "probe");
    assert.ok(typeof got.entries[0].ts === "string" && got.entries[0].ts.length > 0, "每条必须带 ts");

    // 2) 坏 JSON → 400
    const bad = await httpSend(`${base}/diag`, "POST", Buffer.from("{not json"), { "content-type": "application/json" });
    assert.equal(bad.status, 400, `坏 JSON 应 400，实际 ${bad.status}`);
    assert.equal(JSON.parse(bad.body.toString("utf8")).code, "bad-json");

    // 3) 超过 50 条裁到 50，且保留最新
    for (let i = 0; i < 60; i += 1) {
      const r = await httpSend(`${base}/diag`, "POST", Buffer.from(JSON.stringify({ phase: "fill", i })), { "content-type": "application/json" });
      assert.equal(r.status, 200);
    }
    const capped = JSON.parse((await httpGet(`${base}/diag`)).body.toString("utf8"));
    assert.equal(capped.entries.length, tm.DIAG_MAX, `诊断环必须裁到 ${tm.DIAG_MAX} 条，实际 ${capped.entries.length}`);
    assert.equal(capped.entries[capped.entries.length - 1].i, 59, "留下的必须是最新 50 条");

    // 4) 宿主命名空间必须让位：我们不许回答 /plugins/dsh-plot-clone/*
    const stolen = await httpGet(`${root}/plugins/dsh-plot-clone/client.js`);
    assert.equal(stolen.status, 404, `自有 handler 不许回答宿主命名空间，实际 ${stolen.status}`);
    assert.equal(stolen.body.toString("utf8"), "host-fallthrough", "必须返回 undefined 交给下一个 handler，而不是写自己的 404 JSON");
    const bare = await httpGet(`${root}/templates`);
    assert.equal(bare.body.toString("utf8"), "host-fallthrough", "没有前缀的路径也不许抢");

    // 5) 自有前缀仍然正常
    assert.equal((await httpGet(`${base}/templates`)).status, 200);
  });

  ok(
    "路由前缀纪律 + /diag：前缀不在宿主命名空间 / 落一条读回一条 / 坏 JSON 400 / 环裁到 50 / 别的前缀让位",
    `prefix=${tm.ROUTE_PREFIX} max=${tm.DIAG_MAX}`,
  );
}

/* ───────────── 15) 用户模板：Origin 文件引用（上传 / 列表 / 选中带路径 / 删除 / 拒绝） ───────────── */
const um = await import("../lib/user_templates.js");

/** 发原始字节（上传 Origin 文件用），返回 {status, headers, body}。 */
function httpSend(url, method, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    let settled = false;
    const req = httpMod.request(
      { host: u.hostname, port: u.port, path: u.pathname + u.search, method, headers, agent: false },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          settled = true;
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) });
        });
      },
    );
    req.on("error", (error) => {
      if (!settled) reject(error);
    });
    if (body !== undefined) req.write(body);
    req.end();
  });
}
{
  await withRoutes(async ({ base, env }) => {
    const root = um.userTemplatesDir(tm.stateDir(env));

    const before = JSON.parse((await httpGet(`${base}/templates`)).body.toString("utf8"));
    assert.equal(before.count, 49);
    assert.equal(before.system, 49);
    assert.equal(before.user, 0);

    // 假 .otp：只按扩展名判定，不解析内容（解析 Origin 格式本来就不归我们做）
    const bytes = Buffer.from("FAKE-ORIGIN-TEMPLATE-BYTES-0123456789");
    const up = await httpSend(
      `${base}/user-templates?filename=demo.otp&name=${encodeURIComponent("我的模板")}&category=user%2Fdemo`,
      "POST",
      bytes,
    );
    assert.equal(up.status, 200, `上传应 200，实际 ${up.status}：${up.body.toString("utf8").slice(0, 200)}`);
    const created = JSON.parse(up.body.toString("utf8"));
    assert.equal(created.ok, true);
    assert.equal(created.count, 50);

    const list = JSON.parse((await httpGet(`${base}/templates`)).body.toString("utf8"));
    assert.equal(list.count, 50, "上传后列表应 +1");
    assert.equal(list.system, 49, "预设数量不许变");
    assert.equal(list.user, 1);
    const item = list.templates.find((t) => t.id === created.id);
    assert.ok(item !== undefined, "上传的模板必须出现在列表里");
    assert.equal(item.kind, "user");
    assert.equal(item.status, "external", "用户模板不许自称 implemented（渲染在 Origin 里，不是我们的通道）");
    assert.equal(item.ext, ".otp");
    assert.equal(item.size, bytes.length);
    assert.equal(item.thumb, null, "没有缩略图就必须 null，不许拿别人的图");
    assert.ok(existsSync(item.origin_file), `origin_file 必须指向真实文件：${item.origin_file}`);
    assert.match(item.usage, /Origin/);

    const metaPath = join(root, created.id, "meta.json");
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    assert.equal(meta.sha256, um.sha256(bytes), "meta.sha256 必须等于源文件字节的 sha256");
    assert.equal(meta.original_name, "demo.otp");
    assert.equal(meta.origin_file, "source.otp");
    assert.equal(readFileSync(join(dirname(metaPath), "source.otp")).equals(bytes), true, "原件必须字节一致");
    assert.ok(existsSync(join(root, "index.json")), "建完必须重建 user index.json");

    const noThumb = await httpGet(`${base}/thumb/${created.id}`);
    assert.equal(noThumb.status, 404, "用户模板没给缩略图就是 404，不许占位");
    assert.equal(JSON.parse(noThumb.body.toString("utf8")).code, "no-thumbnail");

    const sel = await httpSend(
      `${base}/selection`,
      "POST",
      Buffer.from(JSON.stringify({ selected: created.id })),
      { "content-type": "application/json" },
    );
    assert.equal(sel.status, 200);
    const selData = JSON.parse(sel.body.toString("utf8"));
    assert.equal(selData.selected, created.id);
    assert.equal(selData.origin_file, item.origin_file, "选中用户模板必须回传 origin_file 绝对路径");
    assert.ok(String(selData.usage ?? "").length > 0, "选中用户模板必须回传「怎么用它」");
    const onDisk = JSON.parse(readFileSync(tm.selectionPath(env), "utf8"));
    assert.equal(onDisk.origin_file, item.origin_file, "selection.json 必须带 origin_file 给 agent 用");

    const ren = await httpSend(
      `${base}/user-templates/${created.id}/rename`,
      "POST",
      Buffer.from(JSON.stringify({ name: "改名后" })),
      { "content-type": "application/json" },
    );
    assert.equal(ren.status, 200);
    assert.equal(JSON.parse(ren.body.toString("utf8")).template.name, "改名后");

    // 拒绝非 Origin 扩展名：400 且说明支持哪些
    const badExt = await httpSend(`${base}/user-templates?filename=x.png`, "POST", Buffer.from("89504e47"));
    assert.equal(badExt.status, 400, "非 Origin 扩展名必须 400");
    const badBody = JSON.parse(badExt.body.toString("utf8"));
    assert.equal(badBody.code, "unsupported-ext");
    assert.match(String(badBody.message ?? ""), /\.otp/);
    assert.equal(Array.isArray(badBody.accepted) ? badBody.accepted.length : 0, 5, `accepted 必须列出 5 种扩展名，实际：${JSON.stringify(badBody)}`);

    // 超限：走同一条纯函数（HTTP 层另有 content-length 预检，这条盖住大小判定本身）
    const big = um.createUserTemplate({ root, bytes: Buffer.alloc(64 * 1024 * 1024 + 1), filename: "big.opju" });
    assert.equal(big.ok, false);
    assert.equal(big.code, "too-large");
    assert.match(big.message, /64 MB/);

    // 删除必须回落：列表回到 49、选中清空、目录消失
    const del = await httpSend(`${base}/user-templates/${created.id}`, "DELETE");
    assert.equal(del.status, 200);
    const after = JSON.parse((await httpGet(`${base}/templates`)).body.toString("utf8"));
    assert.equal(after.count, 49);
    assert.equal(after.user, 0);
    const afterSel = JSON.parse((await httpGet(`${base}/selection`)).body.toString("utf8"));
    assert.equal(afterSel.selected, null, "删掉选中的用户模板必须回落，不许留幽灵选中");
    assert.equal(existsSync(join(root, created.id)), false);

    ok(
      "用户模板：上传 +1 / 原件字节一致 / meta sha256 一致 / 选中带 origin_file / 改名 / 拒绝 png / 超限 / 删除回落",
      `id=${created.id} size=${bytes.length}B sha=${meta.sha256.slice(0, 12)}… count=${after.count}`,
    );
  });
}

/* ───────────── 16) CLI：从 Origin 存下来的文件建用户模板（SKILL 第 8 步用） ───────────── */
{
  const { execFileSync } = await import("node:child_process");
  const { dir } = freshHome();
  try {
    const fake = join(dir, "cli-demo.opju");
    const payload = Buffer.from("CLI-ORIGIN-PROJECT-BYTES-0123456789");
    writeFileSync(fake, payload);
    const out = execFileSync(
      process.execPath,
      [join(rootDir, "make_user_template.mjs"), "--from", fake, "--name", "CLI 模板", "--category", "user/cli", "--json"],
      { env: { ...process.env, DSH_HOME: "", USERPROFILE: dir }, encoding: "utf8" },
    );
    const parsed = JSON.parse(out);
    assert.equal(parsed.ok, true);
    assert.match(parsed.id, /^user-/);
    assert.ok(existsSync(parsed.origin_file), `CLI 原件不存在：${parsed.origin_file}`);
    assert.equal(readFileSync(parsed.origin_file).equals(payload), true, "CLI 复制必须字节一致");
    assert.equal(parsed.size, payload.length);
    assert.match(parsed.usage, /Origin/);
    assert.ok(existsSync(parsed.index), "CLI 必须建出 user index.json");
    ok("CLI make_user_template：原件字节一致 + 建 index", `id=${parsed.id} size=${parsed.size}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ───────────── 17. 侧栏标签客户端：文件与 package.json 契约 ───────────── */
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

/* ───────────── 18. 侧栏标签：在假宿主里真跑 apply ───────────── */
{
  const fsMod = await import("node:fs");
  const vmMod = await import("node:vm");
  const src = fsMod.readFileSync(join(rootDir, "lib", "client.js"), "utf8");
  const sandbox = {
    window: {},
    document: { getElementById: () => null, head: { appendChild: () => {} }, createElement: () => ({}) },
    console: { warn: () => {}, log: () => {}, error: () => {} },
    diagPosts: [],
    fetch: async (url, init) => {
      try {
        sandbox.diagPosts.push({ url: String(url), body: JSON.parse(init && init.body ? init.body : "null") });
      } catch {
        sandbox.diagPosts.push({ url: String(url), body: null });
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    },
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
  const namesSeen = [];
  plugin.apply({
    slots: slotsApi,
    inject: (names, cb) => {
      namesSeen.push(...names);
      return cb({ get: (n) => (n === "sidebarRightTabs" ? { register: (spec) => { types.push(spec); return () => {}; } } : undefined) });
    },
  });
  assert.deepEqual(
    namesSeen,
    ["sidebarRightTabs", "sidebarRight"],
    "必须同时注入 sidebarRightTabs 与 sidebarRight：宿主两个 provide 在同一个 effect 里，只点名一个很可能永远等不到 ready",
  );
  const diag = sandbox.diagPosts.map((p) => p.body).filter((b) => b !== null);
  const phases = diag.map((b) => b.phase);
  assert.ok(phases.includes("apply"), `apply 必须上报，实际 ${phases.join(",")}`);
  const cbEntry = diag.find((b) => b.phase === "inject-cb");
  assert.ok(cbEntry !== undefined, "进入 inject 回调必须留证据（phase=inject-cb）");
  assert.equal(cbEntry.typeofTabs, "object", "inject-cb 要带 typeof tabs");
  assert.deepEqual(cbEntry.names, ["sidebarRightTabs", "sidebarRight"]);
  const attempts = diag.filter((b) => b.phase === "register-attempt");
  const results = diag.filter((b) => b.phase === "register-result");
  assert.equal(attempts.length, 2, `每条 tab type 注册前都要上报 attempt，实际 ${attempts.length}`);
  assert.equal(results.length, 2, `每条 register 都要上报结果，实际 ${results.length}`);
  assert.ok(results.every((r) => r.hasDisposer === true && r.returned === "function"));
  const regEntry = diag.find((b) => b.phase === "registered");
  assert.equal(regEntry.registered, 2, "registered 必须带成功条数 2");

  // disposer 三种形态：函数 / {dispose} / undefined（拿不到也不能算没注册）
  assert.equal(typeof plugin.disposerOf(() => {}), "function");
  assert.equal(typeof plugin.disposerOf({ dispose() {} }), "function");
  assert.equal(plugin.disposerOf(undefined), null);
  assert.doesNotThrow(() => plugin.disposerOf({ dispose() {} })());

  for (const shape of ["function", "object", "undefined"]) {
    sandbox.diagPosts.length = 0;
    let made = 0;
    plugin.apply({
      // 独立的静音 slots 桩：别把这三轮注册写进上面那份 slotRegs 记录里。
      slots: { inject: (name, cb) => cb({ register: () => () => {} }), register: () => () => {} },
      inject: (names, cb) =>
        cb({
          get: () => ({
            register: () => {
              made += 1;
              if (shape === "function") return () => {};
              if (shape === "object") return { dispose() {} };
              return undefined;
            },
          }),
        }),
    });
    const entry = sandbox.diagPosts.map((p) => p.body).find((b) => b && b.phase === "registered");
    assert.ok(entry !== undefined, `register 返回 ${shape} 时也必须上报 registered`);
    assert.equal(entry.registered, 2, `register 返回 ${shape} 时两条都必须算注册成功，实际 ${entry.registered}`);
    assert.equal(made, 2, `register 返回 ${shape} 时两条都要真的调用 register，实际 ${made}`);
  }
  assert.equal(types.length, 2, "tab type 必须注册 2 条：主类型 + kind 兼容别名（旧标签自愈）");
  const main = types.find((t) => t.kind === plugin.TAB_KIND);
  const compat = types.find((t) => t.kind === "plot-clone-templates");
  assert.ok(main !== undefined, "主类型缺失");
  assert.equal(main.id, "dsh-plot-clone/templates");
  assert.equal(main.kind, main.id, "tab 的 kind 必须等于 id——宿主按 kind 查内容体，不等就是空白面板");
  assert.equal(main.title(), "模板");
  assert.ok(Array.isArray(main.guide) && main.guide.length > 0, "主类型要有 guide（「+」菜单入口）");
  assert.ok(compat !== undefined, "缺 kind 兼容别名：旧标签实例存的是 plot-clone-templates，找不到定义就渲染 tab.unavailable");
  assert.equal(compat.id, plugin.COMPAT_ID, "别名 id 必须与主 id 不同，否则覆盖主类型");
  assert.equal("guide" in compat, false, "别名不许给 guide，否则「+」菜单会多一个入口");
  assert.equal(compat.title(), "模板");

  // 模拟宿主真实查找：按 tab 实例的 kind 找定义，再用 definition.id 查槽位。
  const kinds = types.map((t) => ({ id: t.id, kind: t.kind }));
  const legacyFound = kinds.find((k) => k.kind === "plot-clone-templates");
  assert.equal(legacyFound.id, plugin.COMPAT_ID, "旧 kind 必须解析到别名 id");
  const slotKeys = new Set(slotRegs.map((r) => r.key));
  assert.equal(slotKeys.has(legacyFound.id), true, `别名 id 必须在槽位表里存在，实际 ${[...slotKeys].join(",")}`);
  assert.equal(kinds.find((k) => k.kind === plugin.TAB_KIND).id, plugin.TAB_ID, "新 kind 仍必须解析到主 id");

  assert.deepEqual(
    slotRegs.map((r) => r.name),
    ["sidebar.right.pane.tab", "sidebar.right.pane.tab.title", "sidebar.right.pane.tab", "sidebar.right.pane.tab.title"],
  );
  assert.deepEqual(slotRegs.map((r) => r.key), [plugin.TAB_ID, plugin.TAB_ID, plugin.COMPAT_ID, plugin.COMPAT_ID], "两个 key 各挂内容体与标题");
  assert.ok(slotRegs.every((r) => kinds.some((k) => k.id === r.key)), "slot key 必须等于某个已注册 tab type 的 id（内容体按 kind→id 查）");

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
    "侧栏标签：同时注入 sidebarRightTabs+sidebarRight、注册主类型+kind 别名（4 槽位）、register 返回函数/对象/undefined 都算成功、每个分支留 diag 证据，老宿主不抛",
    `types=${types.length}(${types.map((t) => t.kind).join("|")}) slots=${slotRegs.length} legacy→${legacyFound.id}`,
  );
}

/* ───────────── 19. 侧栏标签：真渲染（mini-React，不引依赖） ─────────────
   空白面板这种失败必须红：把 TemplatesPanel 真跑一遍，断言渲染出的文本里
   有 49 与张数、没有 undefined；fetch 404 时渲染出错误文案而不是空白。 */
{
  const fsMod = await import("node:fs");
  const vmMod = await import("node:vm");
  const src = fsMod.readFileSync(join(rootDir, "lib", "client.js"), "utf8");

  /** 迷你 React：够跑这个组件的 hooks + jsx，不装 react-dom。 */
  function mount(fetchImpl) {
    const hooks = [];
    const effects = [];
    let idx = 0;
    let dirty = false;
    let effectsDone = false;
    const sandbox = {
      window: {},
      document: { getElementById: () => null, head: { appendChild: () => {} }, createElement: () => ({}) },
      console: { warn() {}, log() {}, error() {} },
      fetch: fetchImpl,
    };
    sandbox.window.__ModuleLoader__ = { load: (cfg) => { sandbox.__cfg = cfg; } };
    sandbox.globalThis = sandbox;
    vmMod.createContext(sandbox);
    vmMod.runInContext(src, sandbox, { filename: "client.js" });

    const react = {
      useState(init) {
        const i = idx++;
        if (!(i in hooks)) hooks[i] = typeof init === "function" ? init() : init;
        return [hooks[i], (next) => {
          hooks[i] = typeof next === "function" ? next(hooks[i]) : next;
          dirty = true;
        }];
      },
      useRef(v) { const i = idx++; if (!(i in hooks)) hooks[i] = { current: v }; return hooks[i]; },
      useMemo(fn) { idx++; return fn(); },
      useEffect(fn) { idx++; effects.push(fn); },
    };
    const plugin = sandbox.__cfg.factory((name) =>
      name === "react" ? react : { jsx: (type, props, children) => ({ type, props: props ?? {}, children }) }
    );

    const render = async () => {
      idx = 0;
      let tree = plugin.TemplatesPanel({});
      // 只跑首轮 effect（deps: []）——组件每次渲染都会把 effect 重新 push 进来，
      // 每次都跑的话后到的读 selection 会把刚点过的收藏覆盖回空值。
      if (!effectsDone) {
        effectsDone = true;
        for (const fn of effects.splice(0)) await fn();
      } else {
        effects.length = 0;
      }
      for (let round = 0; round < 8; round += 1) {
        await new Promise((r) => setTimeout(r, 0));
        if (dirty === false) break;
        dirty = false;
        idx = 0;
        tree = plugin.TemplatesPanel({});
      }
      return tree;
    };
    return { plugin, render };
  }

  const textOf = (node, out = []) => {
    if (node === null || node === undefined) return out;
    if (Array.isArray(node)) { for (const c of node) textOf(c, out); return out; }
    if (typeof node === "object") return textOf(node.children, out);
    out.push(String(node));
    return out;
  };
  const nodesWith = (node, prop, out = []) => {
    if (node === null || node === undefined || typeof node !== "object") return out;
    if (Array.isArray(node)) { for (const c of node) nodesWith(c, prop, out); return out; }
    if (node.props && Object.prototype.hasOwnProperty.call(node.props, prop)) out.push(node.props[prop]);
    nodesWith(node.children, prop, out);
    return out;
  };

  const items = Array.from({ length: 49 }, (_, i) => ({
    id: `tpl-${i}`,
    name: `模板 ${i}`,
    category: i % 2 === 0 ? "general" : "spectroscopy",
    status: i < 9 ? "implemented" : "spec-only",
    channels: ["origin_plot:line"],
    thumb: i < 9 ? `/plot-clone/thumb/tpl-${i}` : null,
  }));
  const okFetch = async (url, init) => ({
    ok: true,
    status: 200,
    json: async () => {
      if (url.endsWith("/templates")) return { ok: true, templates: items };
      if (init !== undefined && typeof init.body === "string") {
        const body = JSON.parse(init.body);
        return { ok: true, selected: body.selected ?? null, favorites: body.favorites ?? [] };
      }
      return { ok: true, selected: null, favorites: [] };
    },
  });
  const badFetch = async () => ({ ok: false, status: 404, json: async () => { throw new Error("no body"); } });

  const good = mount(okFetch);
  const goodText = textOf(await good.render()).join(" ");
  const cards = nodesWith(await good.render(), "data-template-id");
  assert.ok(goodText.includes("全部 49"), `渲染出的标签数必须是 49，实际文本：${goodText.slice(0, 120)}`);
  assert.ok(goodText.includes("共 49 个模板（预设 49 · 用户 0）"), `页脚张数必须是 49，实际文本：${goodText.slice(-90)}`);
  assert.equal(cards.length, 49, `卡片数必须是 49，实际 ${cards.length}`);
  assert.ok(!goodText.includes("undefined"), "渲染结果里不许出现 undefined");
  assert.ok(goodText.includes("无实拍 / 仅规格，渲染未对接"), "spec-only 卡片必须显示「无实拍」");

  // 筛选三档按「来源」：全部 / 预设 / 收藏（status 只做徽标，不许占筛选位）。
  const allNodes = (node, out = []) => {
    if (node === null || node === undefined || typeof node !== "object") return out;
    if (Array.isArray(node)) { for (const c of node) allNodes(c, out); return out; }
    out.push(node);
    allNodes(node.children, out);
    return out;
  };
  const clickChip = async (mounted, label) => {
    const btn = allNodes(await mounted.render()).find(
      (n) => n.type === "button" && textOf(n).join("").trim().startsWith(label),
    );
    assert.ok(btn !== undefined, `找不到筛选按钮「${label}」`);
    btn.props.onClick();
    const next = await mounted.render();
    return { text: textOf(next).join(" "), cards: nodesWith(next, "data-template-id").length };
  };
  assert.ok(
    goodText.includes("全部 49") && goodText.includes("预设 49") && goodText.includes("用户 0") && goodText.includes("收藏 0"),
    `筛选位必须是 全部/预设/用户/收藏，实际：${goodText.slice(0, 110)}`,
  );
  const fAll = await clickChip(good, "全部");
  const fPre = await clickChip(good, "预设");
  const fUser = await clickChip(good, "用户");
  const fFav = await clickChip(good, "收藏");
  assert.equal(fAll.cards, 49, `「全部」应 49 张，实际 ${fAll.cards}`);
  assert.equal(fPre.cards, 49, `「预设」应 49 张（缺 kind 按 system），实际 ${fPre.cards}`);
  assert.equal(fUser.cards, 0, `「用户」空时应 0 张，实际 ${fUser.cards}`);
  assert.equal(fFav.cards, 0, `「收藏」空时应 0 张，实际 ${fFav.cards}`);
  assert.ok(
    fUser.text.includes("还没有你自己的模板，可以上传 Origin 模板或工程"),
    `用户档为空必须有上传引导，实际：${fUser.text.slice(0, 140)}`,
  );
  assert.ok(
    fFav.text.includes("还没有收藏的模板"),
    `收藏为空必须有空态文案，实际：${fFav.text.slice(0, 140)}`,
  );

  // 分类层只挂在「预设」下（用户原话：预设里再加一层分类，其他地方不用加）。
  const clickChipTree = async (mounted, label) => {
    const btn = allNodes(await mounted.render()).find(
      (n) => n.type === "button" && textOf(n).join("").trim().startsWith(label),
    );
    assert.ok(btn !== undefined, `找不到筛选按钮「${label}」`);
    btn.props.onClick();
    return await mounted.render();
  };
  const catChipsOf = (tree) =>
    allNodes(tree).filter((n) => n.type === "button" && n.props && n.props["data-cat"] !== undefined);

  const preTree = await clickChipTree(good, "预设");
  const preCats = catChipsOf(preTree);
  assert.equal(preCats.length, 3, `「预设」下必须出现「全部分类 + 通用 + 光谱」三个 chip，实际 ${preCats.length}`);
  const preNums = preCats.map((b) => Number((textOf(b).join("").trim().match(/(\d+)$/) ?? [])[1]));
  assert.equal(preNums[0], 49, `全部分类计数必须等于系统模板总数 49，实际 ${preNums[0]}`);
  assert.equal(preNums.slice(1).reduce((a, b) => a + b, 0), preNums[0], `各分类合计必须等于系统模板数，实际 ${preNums.slice(1).join("+")} vs ${preNums[0]}`);

  const specBtn = catChipsOf(preTree).find((b) => b.props["data-cat"] === "spectroscopy");
  assert.ok(specBtn !== undefined, "找不到「光谱」分类 chip");
  specBtn.props.onClick();
  const specTree = await good.render();
  const specCards = nodesWith(specTree, "data-template-id");
  assert.equal(specCards.length, 24, `「光谱」应只剩 24 张，实际 ${specCards.length}`);
  assert.equal(specCards.every((id) => Number(String(id).replace("tpl-", "")) % 2 === 1), true, "「光谱」只剩光谱类卡片");
  assert.equal(nodesWith(specTree, "data-kind").every((k) => k === "system"), true, "分类层下只应有系统模板");

  // 切到「全部」：分类层必须消失、卡片回到 49（不许残留成隐藏过滤）。
  const backAll = await clickChipTree(good, "全部");
  assert.equal(catChipsOf(backAll).length, 0, "「全部」不许出现分类层");
  assert.equal(nodesWith(backAll, "data-template-id").length, 49, `切回「全部」必须 49 张，实际 ${nodesWith(backAll, "data-template-id").length}`);
  assert.equal(textOf(backAll).join(" ").includes("没有匹配的模板"), false, "切回「全部」不许因为残留分类把卡片过滤光");

  // 预设 → 光谱 → 收藏：分类必须被清掉，不许带着隐藏过滤。
  const preAgain = await clickChipTree(good, "预设");
  const specAgain = catChipsOf(preAgain).find((b) => b.props["data-cat"] === "spectroscopy");
  specAgain.props.onClick();
  const favAfterCat = await clickChipTree(good, "收藏");
  assert.equal(catChipsOf(favAfterCat).length, 0, "「收藏」不许出现分类层");
  assert.equal(nodesWith(favAfterCat, "data-template-id").length, 0, "收藏为空时 0 张（分类不许残留成过滤）");
  const preFresh = await clickChipTree(good, "预设");
  assert.equal(
    nodesWith(preFresh, "data-template-id").length,
    49,
    `从「收藏」切回「预设」必须回到全部 49 张（分类不许残留），实际 ${nodesWith(preFresh, "data-template-id").length}`,
  );

  // 收藏是活的：点一个 ★ 之后「收藏」计数与筛选结果都要立刻变。
  await clickChip(good, "全部");
  const star = allNodes(await good.render()).find(
    (n) => n.type === "button" && textOf(n).join("").includes("☆"),
  );
  assert.ok(star !== undefined, "找不到收藏星标按钮");
  star.props.onClick();
  await new Promise((r) => setTimeout(r, 20));
  const favText = textOf(await good.render()).join(" ");
  assert.ok(favText.includes("收藏 1"), `收藏后计数必须实时变 1，实际：${favText.slice(0, 100)}`);
  const favOne = await clickChip(good, "收藏");
  assert.equal(favOne.cards, 1, `收藏后「收藏」筛选应 1 张，实际 ${favOne.cards}`);

  // 用户模板：按 kind 分类，user 不许混进「预设」；卡片不许伪造预览图。
  const mixed = items.map((t, i) =>
    i === 0
      ? {
          ...t,
          kind: "user",
          status: "external",
          thumb: null,
          ext: ".opju",
          original_name: "origin-demo.opju",
          size: 2048,
          usage: "Origin 工程：交给 Origin 打开 → origin_template_save 存成样式快照",
        }
      : { ...t, kind: "system" },
  );
  const mix = mount(async (url) => ({
    ok: true,
    status: 200,
    json: async () => (url.endsWith("/templates")
      ? { ok: true, templates: mixed }
      : { ok: true, selected: null, favorites: [] }),
  }));
  const mixText = textOf(await mix.render()).join(" ");
  assert.ok(mixText.includes("预设 48"), `user 模板不许算进预设，实际：${mixText.slice(0, 90)}`);
  assert.ok(mixText.includes("用户 1"), `用户档计数应为 1，实际：${mixText.slice(0, 120)}`);
  assert.ok(mixText.includes("用户"), "用户模板卡片必须标「用户」");
  assert.equal((await clickChip(mix, "预设")).cards, 48, "「预设」应排除 user 模板");
  const mixUser = await clickChip(mix, "用户");
  assert.equal(mixUser.cards, 1, `「用户」档应只剩用户模板，实际 ${mixUser.cards}`);
  assert.ok(
    mixUser.text.includes("无缩略图 · Origin 文件"),
    `用户模板没有图必须显示「无缩略图」，不许伪造预览，实际：${mixUser.text.slice(0, 160)}`,
  );
  assert.ok(mixUser.text.includes("origin_template_save"), "用户模板卡片必须给出「怎么用」一行");
  assert.ok(
    mixUser.text.includes("origin-demo.opju") && mixUser.text.includes("2.0 KB"),
    `用户卡片必须显示原始文件名与大小，实际：${mixUser.text.slice(0, 160)}`,
  );
  assert.ok(!mixUser.text.includes("undefined"), "用户卡片渲染不许出现 undefined");

  const bad = mount(badFetch);  const badText = textOf(await bad.render()).join(" ");
  const badCards = nodesWith(await bad.render(), "data-template-id");
  assert.ok(badText.includes("HTTP 404"), `列表拉不到时必须渲染错误文案，实际文本：${badText.slice(0, 160)}`);
  assert.equal(badCards.length, 0, `拉不到列表时不许有卡片，实际 ${badCards.length}`);
  assert.ok(badText.trim().length > 0, "拉不到列表时不许渲染成空白面板");

  // 关键：内容体必须挂在宿主按 kind 查的那条 key 上，且挂的正是能渲染 49 条的那个组件。
  const hostTypes = [];
  const hostSlots = [];
  const hostSlotsApi = {
    inject: (name, cb) => cb(hostSlotsApi),
    register: (spec, Component) => { hostSlots.push({ ...spec, Component }); return () => {}; },
  };
  good.plugin.apply({
    slots: hostSlotsApi,
    inject: (names, cb) =>
      cb({ get: (n) => (n === "sidebarRightTabs" ? { register: (spec) => { hostTypes.push(spec); return () => {}; } } : undefined) }),
  });
  const body = hostSlots.find((s) => s.name === "sidebar.right.pane.tab");
  assert.ok(body !== undefined, "必须注册 sidebar.right.pane.tab 内容体");
  assert.equal(body.key, hostTypes[0].kind, `内容体 key(${body.key}) 必须等于 tab.kind(${hostTypes[0].kind})，否则标签在、内容空白`);
  assert.equal(body.Component, good.plugin.TemplatesPanel, "内容体必须就是能渲染出 49 条的 TemplatesPanel");

  ok(
    "侧栏标签真渲染：49 条 + 无 undefined + 404 出错误文案 + 筛选四档 + 「预设」下分类层 + 用户卡片无伪造预览",
    `cards=${cards.length} 全部49=${goodText.includes("全部 49")} 无实拍=${goodText.includes("无实拍")} 筛选=${fAll.cards}/${fPre.cards}/${fUser.cards}/${fFav.cards} 用户空态=${fUser.text.includes("还没有你自己的模板")} 用户卡片=${mixUser.cards} 空态=${fFav.text.includes("还没有收藏的模板")} 404="${badText.includes("HTTP 404")}" bind=${body.key}==${hostTypes[0].kind}`,
  );
}

console.log(`\nselftest ok: ${passed}/${passed} 通过（幂等键 / 只读复用 / configure 失败不落半条 / patch 形态 / 模板列表 / 缩略图 / 选中落盘 / 三条路由 / 用户模板上传删除 / CLI 建模板 / 侧栏标签契约 / 侧栏 apply / 标签真渲染 / 筛选四档 / 预设分类层）`);
