/**
 * dsh-plot-clone — 模板选择的服务端（纯逻辑 + 一个 raw-node HTTP handler）
 * =====================================================================
 *
 * 为什么要有这一层：`lib/index.js` 在此之前只注册 MCP，插件没有界面，
 * 用户选不了模板，只能由 agent 猜。这里给三条只读/一条写接口：
 *
 *   GET  /plugins/dsh-plot-clone/            → 自包含 HTML 页面（无 CDN、无打包）
 *   GET  /plugins/dsh-plot-clone/templates   → 系统 + 用户模板（kind 透传）
 *   GET  /plugins/dsh-plot-clone/thumb/<id>  → 缩略图字节（系统只认仓库 evidence PNG；用户只认自己的 thumb.png）
 *   GET|POST /plugins/dsh-plot-clone/selection → 选中 + 收藏（落盘 stateDir/selection.json）
 *   POST   /plugins/dsh-plot-clone/user-templates            → 上传 Origin 文件建用户模板
 *   DELETE /plugins/dsh-plot-clone/user-templates/<id>       → 删除（只动 runtime 目录）
 *   POST   /plugins/dsh-plot-clone/user-templates/<id>/rename → 改名/改分类/改说明
 *
 * 三条硬规矩写死在代码里，不靠注释约束：
 *   1. **spec-only 没有实拍图 → thumb 一律 null**，绝不用别的模板的图冒充。
 *      判据就是 `templates/evidence/<id>.png` 是否存在，而不是看 status。
 *   2. 选中只是**偏好**，这个模块不参与自动匹配；它只回答「用户选了谁」。
 *   3. 用户模板是 **Origin 文件引用**：原样存字节、只记元数据，不解析 Origin 格式、
 *      不量测、不生成预览图，也不替它声明 status（不许因为「是用户自己的」就标 implemented）。
 *
 * 路由契约照 dsh-auto-continue/lib/index.js:829 的实证形态：`kind:"prefix"` +
 * raw node `handler(req,res)` 自己写 head/end（不是 fastify reply）。插件路由
 * **不在宿主鉴权墙后面**，所以这里自己做回环校验（Host + peer 地址双查）。
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderPage } from './page.js';
import {
  MAX_USER_FILE,
  ORIGIN_EXTS,
  createUserTemplate,
  entryOf,
  isOriginFile,
  listUserTemplates,
  removeUserTemplate,
  renameUserTemplate,
  thumbFile as userThumbFile,
  userTemplatesDir,
} from './user_templates.js';

export const ROUTE_PREFIX = '/plugins/dsh-plot-clone';

/** 模板 id：小写字母数字开头，只含 `[a-z0-9_-]`。同时是防盗链/防目录穿越的唯一闸门。 */
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** POST body 上限：只收一个 id 和一个字符串数组，64KB 已经非常宽松。 */
const MAX_BODY = 64 * 1024;

/* ───────────────────────── 路径 ───────────────────────── */

/** 与 `lib/index.js` 同口径：venv/server/状态都放用户目录，pnpm 重装不清。 */
export function stateDir(env = process.env) {
  return join(env.DSH_HOME || join(env.USERPROFILE || homedir(), '.dsh'), 'dsh-plot-clone');
}

/** 与 `mcp-state.json` 同目录 —— 重装插件不会清掉用户的选择。 */
export function selectionPath(env = process.env) {
  return join(stateDir(env), 'selection.json');
}

/** 用户模板根目录：运行时数据，pnpm 重装不清，也不许落进仓库。 */
export function userRootDir(env = process.env) {
  return userTemplatesDir(stateDir(env));
}

/**
 * 找模板库目录，按优先级：
 *   1. `DSH_PLOT_CLONE_TEMPLATES`（测试/自定义部署）
 *   2. **插件自带** `<pkg>/templates`（仓库开发时就是仓库根，装好后是打包进去的副本）
 *   3. 已安装技能 `~/.agents/skills/dsh-plot-clone/templates`（只装技能不装插件的场景）
 * 找不到就返回 null —— 页面显示空状态，不假装有模板。
 */
export function resolveTemplatesDir(env = process.env) {
  const bundled = fileURLToPath(new URL('../templates', import.meta.url));
  const skill = join(env.USERPROFILE || homedir(), '.agents', 'skills', 'dsh-plot-clone', 'templates');
  for (const dir of [env.DSH_PLOT_CLONE_TEMPLATES, bundled, skill]) {
    if (!dir) continue;
    try {
      if (existsSync(join(dir, 'index.json'))) return dir;
    } catch {
      /* 权限/路径异常都当作"这个候选没有" */
    }
  }
  return null;
}

/* ───────────────────────── 列表 ───────────────────────── */

export function readIndex(dir) {
  if (!dir) return null;
  try {
    const parsed = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
    return Array.isArray(parsed?.templates) ? parsed : null;
  } catch {
    return null;
  }
}

/** 缩略图路径：**只认 evidence/<id>.png**，没有就是 null（spec-only 不许借用别人的图）。 */
export function thumbFile(dir, id) {
  if (!dir || typeof id !== 'string' || !ID_RE.test(id)) return null;
  try {
    const p = join(dir, 'evidence', `${id}.png`);
    if (!existsSync(p)) return null;
    const st = statSync(p);
    return st.isFile() && st.size > 0 ? p : null;
  } catch {
    return null;
  }
}

/** 索引条目 → 页面用的扁平结构。字段名按 Chief 定的契约，一个都不省。 */
export function buildTemplateList(index, dir, userRoot = null) {
  const items = Array.isArray(index?.templates) ? index.templates : [];
  const system = items.map((t) => {
    const id = String(t?.id ?? '');
    const hasThumb = Boolean(thumbFile(dir, id));
    return {
      id,
      name: t?.name_zh || t?.name || id,
      category: t?.category || 'uncategorized',
      status: t?.status === 'implemented' ? 'implemented' : 'spec-only',
      channels: Array.isArray(t?.renderer?.channel) ? t.renderer.channel : [],
      thumb: hasThumb ? `${ROUTE_PREFIX}/thumb/${id}` : null,
      evidencePath: hasThumb ? `evidence/${id}.png` : null,
      kind: t?.kind === 'user' ? 'user' : 'system',
      gap: t?.gap ?? null,
    };
  });

  // 用户模板 = 用户自己的 Origin 文件。它没有「我们验证过的渲染」这回事：
  // status 给 `external`（渲染由 Origin 负责），既不标 implemented，也不套 spec-only 的语义。
  const users = userRoot === null
    ? []
    : listUserTemplates(userRoot).map((meta) => {
        const item = entryOf(userRoot, meta);
        const hasThumb = Boolean(userThumbFile(userRoot, item.id));
        return {
          id: item.id,
          name: item.name,
          category: item.category,
          status: 'external',
          channels: [],
          thumb: hasThumb ? `${ROUTE_PREFIX}/thumb/${item.id}` : null,
          evidencePath: null,
          kind: 'user',
          gap: null,
          origin: 'user',
          origin_file: item.origin_file,
          original_name: item.original_name,
          ext: item.ext,
          sha256: item.sha256,
          size: item.size,
          note: item.note,
          usage: item.usage,
          createdAt: item.created_at,
        };
      });

  return [...system, ...users];
}

/**
 * 选中项的**对外视图**：选中星标用户模板时，把 `origin_file` 绝对路径和「怎么用它」
 * 一起交出去——agent 要拿这两样才能去 Origin 里套用，不必自己拼路径。
 * 系统模板没有这两项，给 null。
 */
export function selectionView(list, selection) {
  const hit = selection.selected === null ? null : list.find((t) => t.id === selection.selected) ?? null;
  const user = hit !== null && hit.kind === 'user' ? hit : null;
  return {
    selected: selection.selected,
    favorites: selection.favorites,
    updatedAt: selection.updatedAt,
    origin_file: user?.origin_file ?? null,
    usage: user?.usage ?? null,
  };
}

export function idsOf(list) {
  return new Set(list.map((t) => t.id));
}

/* ───────────────────────── 选中 / 收藏 ───────────────────────── */

export function normalizeSelection(raw) {
  const selected = typeof raw?.selected === 'string' && ID_RE.test(raw.selected) ? raw.selected : null;
  const favorites = Array.isArray(raw?.favorites)
    ? [...new Set(raw.favorites.filter((x) => typeof x === 'string' && ID_RE.test(x)))]
    : [];
  // origin_file / usage 是选中的用户模板派生出来的字段：写盘时一起带上，
  // agent 直接读 selection.json 就能拿到路径，不用再请求列表。
  const originFile = typeof raw?.origin_file === 'string' && raw.origin_file !== '' ? raw.origin_file : null;
  const usage = typeof raw?.usage === 'string' && raw.usage !== '' ? raw.usage : null;
  return {
    selected,
    favorites,
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : null,
    origin_file: originFile,
    usage,
  };
}

export function readSelection(path) {
  try {
    return normalizeSelection(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return { selected: null, favorites: [], updatedAt: null, origin_file: null, usage: null };
  }
}

export function writeSelection(path, selection) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(selection, null, 1)}\n`, 'utf8');
  return selection;
}

/**
 * 校验 POST body。**非法 id 一律拒绝并逐条报出来**，不静默丢弃——
 * 静默丢弃会让页面以为收藏成功了，实际没落盘。
 * 返回 `{ok:true, patch}` 或 `{ok:false, errors:[...]}`。
 */
export function validateSelection(body, ids) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errors: ['body must be a JSON object'] };
  }
  const hasSelected = Object.prototype.hasOwnProperty.call(body, 'selected');
  const hasFavorites = Object.prototype.hasOwnProperty.call(body, 'favorites');
  if (!hasSelected && !hasFavorites) return { ok: false, errors: ['body needs "selected" or "favorites"'] };

  const errors = [];
  const patch = {};

  if (hasSelected) {
    const v = body.selected;
    if (v !== null && typeof v !== 'string') errors.push('selected must be a string id or null');
    else if (typeof v === 'string' && !ids.has(v)) errors.push(`selected id not found: ${v}`);
    else patch.selected = v;
  }

  if (hasFavorites) {
    const v = body.favorites;
    if (!Array.isArray(v)) errors.push('favorites must be an array of ids');
    else {
      const bad = v.filter((x) => typeof x !== 'string' || !ids.has(x));
      if (bad.length > 0) errors.push(`favorites contains unknown ids: ${bad.join(', ')}`);
      else patch.favorites = [...new Set(v)];
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, patch };
}

/** 收藏增删都走同一个列表（前端就是整列提交），这里给 CLI/测试一个方便函数。 */
export function toggleFavorite(selection, id, ids) {
  const has = selection.favorites.includes(id);
  const next = has ? selection.favorites.filter((x) => x !== id) : [...selection.favorites, id];
  return validateSelection({ favorites: next }, ids).ok ? { ...selection, favorites: next } : selection;
}

/* ───────────────────────── HTTP ───────────────────────── */

/**
 * 插件路由绕过宿主鉴权墙：Host 挡隧道/DNS rebinding，peer 地址挡同网段直连
 * （宿主实测监听 0.0.0.0，Host 头可以伪造）。两道都过才放行。
 */
export function isLoopbackRequest(req) {
  const rawHost = String(req?.headers?.host ?? '');
  const hostname = rawHost.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  const peer = String(req?.socket?.remoteAddress ?? '');
  const hostOk = hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
  const peerOk = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
  return hostOk && peerOk;
}

function sendJson(res, status, value) {
  const body = `${JSON.stringify(value, null, 1)}\n`;
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function sendText(res, status, text, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(text), 'cache-control': 'no-store' });
  res.end(text);
}

/** 读原始字节：上传 Origin 文件用（JSON 那条走 readBody，上限小得多）。 */
function readBytes(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error(`body too large (>${limit} bytes)`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function readBody(req, limit = MAX_BODY) {
  return readBytes(req, limit).then((buf) => buf.toString('utf8'));
}

/**
 * 建 handler。每次请求都重新解析模板目录：装完插件不重启也能看到新模板，
 * 且测试可以只改 env 就换 fixture。
 */
export function createRoutes({ env = process.env, templatesDir, log = () => {} } = {}) {
  const pickDir = () => templatesDir ?? resolveTemplatesDir(env);

  return async function handler(req, res) {
    try {
      if (!isLoopbackRequest(req)) {
        req.resume();
        sendJson(res, 403, { ok: false, code: 'loopback-only', message: 'this route is loopback-only' });
        return;
      }

      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const sub = url.pathname.startsWith(ROUTE_PREFIX) ? url.pathname.slice(ROUTE_PREFIX.length) || '/' : url.pathname;
      const dir = pickDir();
      const userRoot = userRootDir(env);
      const index = readIndex(dir);
      const readAll = () => buildTemplateList(index, dir, userRoot);
      const selected = readSelection(selectionPath(env));

      /* 页面 */
      if (sub === '/' || sub === '') {
        if (req.method !== 'GET') return sendJson(res, 405, { ok: false, code: 'method-not-allowed', message: 'GET only' });
        const list = readAll();
        return sendText(res, 200, renderPage({ count: list.length, hasTemplates: Boolean(index) }), 'text/html; charset=utf-8');
      }

      /* 列表：系统 + 用户 */
      if (sub === '/templates') {
        if (req.method !== 'GET') return sendJson(res, 405, { ok: false, code: 'method-not-allowed', message: 'GET only' });
        const list = readAll();
        const users = list.filter((t) => t.kind === 'user').length;
        const ok = Boolean(index) || users > 0;
        return sendJson(res, ok ? 200 : 503, {
          ok,
          count: list.length,
          system: list.length - users,
          user: users,
          templates: list,
          selected: selected.selected,
          favorites: selected.favorites,
          ...(ok ? {} : { code: 'templates-not-found', message: 'templates/index.json not found', searched: dir ?? null }),
        });
      }

      /* 上传用户模板：body 是文件原始字节，文件名/名字/分类/说明走 query。 */
      if (sub === '/user-templates') {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, code: 'method-not-allowed', message: 'POST only' });
        const filename = url.searchParams.get('filename') ?? '';
        if (!isOriginFile(filename)) {
          req.resume();
          return sendJson(res, 400, {
            ok: false,
            code: 'unsupported-ext',
            message: `只支持 Origin 文件：${ORIGIN_EXTS.join(' ')}；收到 ${filename === '' ? '(未给 filename)' : filename}`,
            accepted: [...ORIGIN_EXTS],
          });
        }
        const declared = Number(req.headers['content-length'] ?? 0);
        if (declared > MAX_USER_FILE) {
          req.resume();
          return sendJson(res, 413, { ok: false, code: 'too-large', message: `文件 ${declared} 字节，超过上限 64 MB` });
        }
        let bytes;
        try {
          bytes = await readBytes(req, MAX_USER_FILE);
        } catch (error) {
          return sendJson(res, 413, { ok: false, code: 'too-large', message: error.message });
        }
        const created = createUserTemplate({
          root: userRoot,
          bytes,
          filename,
          name: url.searchParams.get('name') ?? '',
          category: url.searchParams.get('category') ?? '',
          note: url.searchParams.get('note') ?? '',
          role: 'upload',
        });
        if (!created.ok) return sendJson(res, 400, created);
        const list = readAll();
        return sendJson(res, 200, {
          ok: true,
          id: created.id,
          template: list.find((t) => t.id === created.id) ?? null,
          count: list.length,
          system: list.filter((t) => t.kind !== 'user').length,
          user: list.filter((t) => t.kind === 'user').length,
        });
      }

      /* 删除 / 改名：只动 runtime 目录，仓库零污染。 */
      if (sub.startsWith('/user-templates/')) {
        const rest = sub.slice('/user-templates/'.length);
        const [rawId, action, ...extra] = rest.split('/');
        const id = decodeURIComponent(rawId ?? '');
        if (extra.length > 0) return sendJson(res, 404, { ok: false, code: 'no-route', message: `unknown path: ${url.pathname}` });

        if (action === undefined && req.method === 'DELETE') {
          const removed = removeUserTemplate(userRoot, id);
          if (!removed.ok) return sendJson(res, removed.code === 'not-found' ? 404 : 400, removed);
          const list = readAll();
          const next = selected.selected === id
            ? normalizeSelection({ ...selected, selected: null, updatedAt: new Date().toISOString(), origin_file: null, usage: null })
            : selected;
          if (selected.selected === id) writeSelection(selectionPath(env), next);
          return sendJson(res, 200, { ...removed, selection: selectionView(list, next) });
        }

        if (action === 'rename' && req.method === 'POST') {
          let body;
          try {
            body = JSON.parse((await readBody(req)) || '{}');
          } catch (error) {
            return sendJson(res, 400, { ok: false, code: 'bad-json', message: error.message });
          }
          const renamed = renameUserTemplate(userRoot, id, body ?? {});
          if (!renamed.ok) return sendJson(res, renamed.code === 'not-found' ? 404 : 400, renamed);
          const list = readAll();
          return sendJson(res, 200, {
            ok: true,
            id: renamed.id,
            template: list.find((t) => t.id === renamed.id) ?? null,
            selection: selectionView(list, selected),
          });
        }

        return sendJson(res, 405, { ok: false, code: 'method-not-allowed', message: 'DELETE /user-templates/<id> 或 POST /user-templates/<id>/rename' });
      }

      /* 缩略图：系统只认仓库 evidence PNG，用户只认自己的 thumb.png */
      if (sub.startsWith('/thumb/')) {
        if (req.method !== 'GET') return sendJson(res, 405, { ok: false, code: 'method-not-allowed', message: 'GET only' });
        const id = decodeURIComponent(sub.slice('/thumb/'.length));
        const file = thumbFile(dir, id) ?? (ID_RE.test(id) ? userThumbFile(userRoot, id) : null);
        if (!file) {
          // 没有实拍图是**正常状态**，不是错误：404 让前端画占位，别拿别人的图顶。
          return sendJson(res, 404, { ok: false, code: 'no-thumbnail', message: `no thumbnail for template: ${id}` });
        }
        const bytes = readFileSync(file);
        res.writeHead(200, {
          'content-type': 'image/png',
          'content-length': bytes.length,
          'cache-control': 'no-cache',
        });
        res.end(bytes);
        return undefined;
      }

      /* 选中 / 收藏 */
      if (sub === '/selection') {
        if (req.method === 'GET') {
          return sendJson(res, 200, { ok: true, ...selectionView(readAll(), selected) });
        }
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, code: 'method-not-allowed', message: 'GET or POST' });
        let body;
        try {
          body = JSON.parse((await readBody(req)) || '{}');
        } catch (error) {
          return sendJson(res, 400, { ok: false, code: 'bad-json', message: error.message });
        }
        const list = readAll();
        const verdict = validateSelection(body, idsOf(list));
        if (!verdict.ok) return sendJson(res, 400, { ok: false, code: 'invalid-selection', errors: verdict.errors });
        const merged = normalizeSelection({
          selected: Object.prototype.hasOwnProperty.call(verdict.patch, 'selected') ? verdict.patch.selected : selected.selected,
          favorites: Object.prototype.hasOwnProperty.call(verdict.patch, 'favorites') ? verdict.patch.favorites : selected.favorites,
          updatedAt: new Date().toISOString(),
        });
        // 选中用户模板时把 origin_file / usage 一并写盘：agent 读文件就能去 Origin 里套用。
        const view = selectionView(list, merged);
        const next = { ...merged, origin_file: view.origin_file, usage: view.usage };
        try {
          writeSelection(selectionPath(env), next);
        } catch (error) {
          log(`selection 写入失败：${error.message}`);
          return sendJson(res, 500, { ok: false, code: 'write-failed', message: error.message });
        }
        return sendJson(res, 200, { ok: true, ...view });
      }

      return sendJson(res, 404, { ok: false, code: 'no-route', message: `unknown path: ${url.pathname}` });
    } catch (error) {
      // handler 是 async：裸抛会变成未捕获 rejection（宿主策略含直接退出）。
      log(`templates 路由异常：${error?.message ?? error}`);
      try {
        sendJson(res, 500, { ok: false, code: 'internal', message: String(error?.message ?? error) });
      } catch {
        /* socket 已断 */
      }
      return undefined;
    }
  };
}
