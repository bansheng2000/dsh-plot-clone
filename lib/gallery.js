/**
 * dsh-plot-clone — 云端模板（OriginLab Graph Gallery）
 * ==================================================
 *
 * 三种来源必须彼此独立，这个文件只管中间那一种：
 *   1) 系统模板   随包 `templates/system/`（49 套，只读）
 *   2) 云端模板   `~/.dsh/dsh-plot-clone/gallery-templates/gid-<n>/`  ← 这里
 *   3) 用户模板   `~/.dsh/dsh-plot-clone/user-templates/`（只放用户手动上传的）
 *
 * 硬规矩：
 *   · 包内 `templates/gallery/index.json` **只有元数据**，不含任何 .opj/.opju/.otp；
 *     工程文件是用户点「下载」时按需从 OriginLab 拉的，落在 state 目录，不进仓库。
 *   · 下载件按 gid 独占目录，重复下载先问覆盖，不静默覆盖；删除只删自己的目录。
 *   · 许可：OriginLab 版权作品，仅本机个人使用，不随插件分发 —— meta.json 里写死。
 *   · 版本不兼容 / 网络失败 / zip 里没有工程文件，都回结构化错误码，别静默。
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { connect as tlsConnect } from 'node:tls';

import { PROJECT_EXTS, ZipError, extractZip, listZipEntries, pickProjectFile } from './zip.js';

export const GALLERY_LICENSE = 'OriginLab copyright, local personal use only';

/** 云端分类：顺序就是前端按钮顺序（「已安装」是运行时视图，不在元数据里）。 */
export const GALLERY_CATEGORIES = Object.freeze([
  { key: 'all', label: '全部' },
  { key: '2d', label: '2D' },
  { key: '3d', label: '3D' },
  { key: 'stats', label: '统计-QC' },
  { key: 'special', label: '专业坐标' },
  { key: 'other', label: '其他' },
  { key: 'installed', label: '已安装' },
]);

const STATS_RE = /(statistic|quality control|\bqc\b|histogram|box chart|violin|beeswarm|bland|qq plot|q-q|pareto|control chart|correlation|scatter matrix|interval plot|variability|marginal plot|cluster plot|dots plot|analysis)/i;
const SPECIAL_RE = /(polar|radar|ternary|tetrahedral|piper|schoeller|smith chart|stiff|kite|sunburst|chord|sankey|alluvial|ribbon|network|trellis|multi-?panel|inset|map|bubble|bullet|bridge|waterfall|ridgeline|spiral|pyramid|fence|walls|vector plot|wind rose|streamline|surface|contour|heatmap|image profile|function graph|graph browser|high-low-close|candlestick|lollipop)/i;
const THREE_D_RE = /(3d|three-?d|surface|wireframe)/i;

/** 分类归一：规则写死，顺序即优先级（测试钉死这几条边界）。 */
export function classifyEntry(entry) {
  const words = [...(entry?.types ?? []), ...(entry?.keywords ?? []), entry?.title ?? ''].join(' | ');
  if (entriesAre3d(entry)) return '3d';
  if (STATS_RE.test(words)) return 'stats';
  if (SPECIAL_RE.test(words)) return 'special';
  if ((entry?.types?.length ?? 0) > 0 || (entry?.keywords?.length ?? 0) > 0) return '2d';
  return 'other';
}

/** 3D 判定单独抽出来：类型里出现 3D 字样最可靠，关键词里出现也算。 */
function entriesAre3d(entry) {
  const types = (entry?.types ?? []).join(' | ');
  if (THREE_D_RE.test(types)) return true;
  const kw = (entry?.keywords ?? []).join(' | ');
  if (/\b3d\b/i.test(kw)) return true;
  return /\b3d\b/i.test(String(entry?.title ?? ''));
}

/* ───────────────────────── 路径与索引 ───────────────────────── */

export function stateRootDir(env = process.env) {
  return join(env.DSH_HOME || join(env.USERPROFILE || homedir(), '.dsh'), 'dsh-plot-clone');
}

export function galleryRootDir(env = process.env) {
  return join(stateRootDir(env), 'gallery-templates');
}

export function gidDirName(gid) {
  return `gid-${gid}`;
}

/** index.json 的路径：优先 templatesDir 传入的那份（可能是技能副本）。 */
export function galleryIndexPath(templatesDir) {
  return join(templatesDir, 'gallery', 'index.json');
}

export function loadGalleryIndex(templatesDir) {
  const path = galleryIndexPath(templatesDir);
  if (!existsSync(path)) {
    return { ok: false, code: 'gallery-index-missing', message: `找不到云端模板目录快照：${path}`, path };
  }
  try {
    const doc = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(doc?.templates)) throw new Error('templates 不是数组');
    return { ok: true, doc, path, bytes: statSync(path).size };
  } catch (error) {
    return { ok: false, code: 'gallery-index-broken', message: `云端模板目录解析失败：${error.message}`, path };
  }
}

/** 已安装：扫 gallery-templates/gid-<n>/meta.json（没有 meta 的目录当损坏，不计入）。 */
export function installedMap(root = galleryRootDir()) {
  const out = new Map();
  if (!existsSync(root)) return out;
  for (const name of readdirSync(root)) {
    if (!/^gid-\d+$/.test(name)) continue;
    const gid = Number(name.slice(4));
    const metaPath = join(root, name, 'meta.json');
    if (!existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      out.set(gid, { ...meta, dir: join(root, name) });
    } catch {
      /* 损坏的 meta 当没装，不阻塞列表 */
    }
  }
  return out;
}

/** 列表视图：条目 + 分类 + 是否已安装（不读工程文件字节）。 */
export function galleryListView(doc, { root = galleryRootDir(), category = 'all', query = '' } = {}) {
  const installed = installedMap(root);
  const q = String(query ?? '').trim().toLowerCase();
  const rows = [];
  for (const entry of doc.templates ?? []) {
    const cat = classifyEntry(entry);
    const local = installed.get(entry.gid) ?? null;
    const hit = q === ''
      || String(entry.title ?? '').toLowerCase().includes(q)
      || (entry.keywords ?? []).some((k) => String(k).toLowerCase().includes(q))
      || (entry.types ?? []).some((k) => String(k).toLowerCase().includes(q));
    if (!hit) continue;
    if (category === 'installed' && local === null) continue;
    if (category !== 'all' && category !== 'installed' && cat !== category) continue;
    rows.push({
      gid: entry.gid,
      title: entry.title || `GID ${entry.gid}（站点无标题）`,
      types: entry.types ?? [],
      keywords: entry.keywords ?? [],
      thumb: entry.thumb ?? null,
      downloadable: Boolean(entry.downloadable) && (entry.files?.length ?? 0) > 0,
      placeholder: Boolean(entry.placeholder),
      category: cat,
      installed: local !== null,
      local: local === null ? null : {
        file: local.file ?? null,
        bytes: local.bytes ?? null,
        sha256: local.sha256 ?? null,
        downloaded_at: local.downloaded_at ?? null,
      },
    });
  }
  const counts = { all: doc.templates?.length ?? 0, '2d': 0, '3d': 0, stats: 0, special: 0, other: 0, installed: installed.size };
  for (const entry of doc.templates ?? []) counts[classifyEntry(entry)] += 1;
  return {
    ok: true,
    total: doc.templates?.length ?? 0,
    counts,
    category,
    query,
    shown: rows.length,
    categories: GALLERY_CATEGORIES.map((c) => ({ ...c, count: counts[c.key] ?? 0 })),
    templates: rows,
  };
}

/** 单条详情（含来源链接与许可提示）。 */
export function galleryEntry(doc, gid) {
  const entry = (doc.templates ?? []).find((t) => t.gid === gid);
  if (!entry) return null;
  return {
    ...entry,
    category: classifyEntry(entry),
    page: `https://www.originlab.com/www/products/GraphGallery.aspx?GID=${gid}`,
    license: GALLERY_LICENSE,
    files: entry.files ?? [],
  };
}

/* ───────────────────────── HTTP ───────────────────────── */

const DEFAULT_PROXY = 'http://127.0.0.1:7890';
const MAX_REDIRECTS = 5;

function proxyFromEnv(env = process.env) {
  const raw = env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || DEFAULT_PROXY;
  try {
    const u = new URL(raw);
    return { host: u.hostname, port: Number(u.port || 80), raw };
  } catch {
    return null;
  }
}

function requestOnce(target, { timeoutMs, proxy, maxBytes }) {
  return new Promise((resolve, reject) => {
    const url = new URL(target);
    const isHttps = url.protocol === 'https:';
    const mod = isHttps ? httpsRequest : httpRequest;
    const opts = {
      method: 'GET',
      host: url.hostname,
      path: `${url.pathname}${url.search}`,
      headers: { 'user-agent': 'dsh-plot-clone gallery (+https://github.com/bansheng2000/dsh-plot-clone)', accept: 'application/zip,application/octet-stream,*/*' },
      timeout: timeoutMs,
    };
    const fail = (error) => reject(error);
    const handle = (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          res.destroy();
          reject(new Error(`响应超过上限 ${maxBytes} bytes`));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', fail);
    };

    if (!proxy) {
      const req = mod({ ...opts, servername: url.hostname }, handle);
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', fail);
      req.end();
      return;
    }

    // 走代理：先 CONNECT 建隧道，再在隧道上做 TLS（https）或纯 HTTP。
    const connectReq = httpRequest({
      host: proxy.host,
      port: proxy.port,
      method: 'CONNECT',
      path: `${url.hostname}:${url.port || (isHttps ? 443 : 80)}`,
      timeout: timeoutMs,
      headers: { host: `${url.hostname}:${url.port || (isHttps ? 443 : 80)}` },
    });
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`代理拒绝 CONNECT：${res.statusCode}`));
        return;
      }
      const req = isHttps
        ? httpsRequest({ ...opts, agent: false, createConnection: () => tlsConnect({ socket, servername: url.hostname }) }, handle)
        : httpRequest({ ...opts, createConnection: () => socket, agent: false }, handle);
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', fail);
      req.end();
    });
    connectReq.on('timeout', () => connectReq.destroy(new Error('proxy timeout')));
    connectReq.on('error', (error) => reject(new Error(`代理连接失败：${error.message}`)));
    connectReq.end();
  });
}

/**
 * 跟随重定向的 GET。先直连，失败再用代理重试一次（本机默认 127.0.0.1:7890）。
 * 返回 { ok, status, body, url, via } 或抛错。
 */
export async function fetchFollow(url, { timeoutMs = 30000, maxBytes = 64 * 1024 * 1024, proxy = null, env = process.env } = {}) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let res;
    try {
      res = await requestOnce(current, { timeoutMs, proxy, maxBytes });
    } catch (error) {
      if (proxy === null) {
        // 直连失败 → 回落本地代理（设计如此：本机 github/originlab 常需代理）。
        const p = proxyFromEnv(env);
        if (p !== null) return fetchFollow(current, { timeoutMs, maxBytes, proxy: p, env }).then((r) => ({ ...r, via: r.via ?? `proxy ${p.raw}` }));
        throw error;
      }
      throw error;
    }
    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers?.location) {
      current = new URL(String(res.headers.location), current).toString();
      continue;
    }
    return { ok: res.status >= 200 && res.status < 300, status: res.status, body: res.body, url: current, via: proxy === null ? 'direct' : `proxy ${proxy.raw}` };
  }
  throw new Error(`重定向超过 ${MAX_REDIRECTS} 次`);
}

/* ───────────────────────── 下载 / 删除 ───────────────────────── */

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/** 下载一条云端模板：拉 zip → 解出工程文件 → 落 gid-<n>/source.<ext> + meta.json（+ thumb 尽力而为）。 */
export async function downloadGid({ gid, entry, root = galleryRootDir(), overwrite = false, env = process.env, fetchImpl = fetchFollow }) {
  const files = Array.isArray(entry?.files) ? entry.files.filter((f) => typeof f === 'string' && f !== '') : [];
  if (files.length === 0) {
    return { ok: false, code: 'no-download', message: `GID ${gid} 站点未提供工程文件下载` };
  }
  const dir = join(root, gidDirName(gid));
  const metaPath = join(dir, 'meta.json');
  if (existsSync(metaPath) && overwrite !== true) {
    const prev = JSON.parse(readFileSync(metaPath, 'utf8'));
    return { ok: false, code: 'already-installed', message: `GID ${gid} 已安装，需确认覆盖`, dir, meta: prev };
  }

  let res;
  try {
    res = await fetchImpl(files[0], { env });
  } catch (error) {
    return { ok: false, code: 'network-error', message: `下载失败：${error.message}`, url: files[0] };
  }
  if (!res.ok) {
    return { ok: false, code: res.status === 404 ? 'not-found' : 'http-error', message: `站点返回 HTTP ${res.status}`, url: files[0], status: res.status };
  }

  let extracted;
  let names;
  try {
    names = listZipEntries(res.body).filter((e) => !e.isDir).map((e) => e.name);
    extracted = extractZip(res.body);
  } catch (error) {
    const code = error instanceof ZipError ? error.code : 'bad-zip';
    return { ok: false, code, message: `压缩包解析失败：${error.message}`, url: files[0] };
  }
  const picked = pickProjectFile(names);
  if (picked === null) {
    return { ok: false, code: 'no-project-in-zip', message: `压缩包里没有 Origin 工程文件（${PROJECT_EXTS.join(' / ')}），实际条目：${names.slice(0, 6).join(', ')}`, url: files[0], entries: names.slice(0, 20) };
  }
  const bytes = extracted.get(picked);
  if (!bytes || bytes.length === 0) {
    return { ok: false, code: 'empty-project', message: `工程文件是空文件：${picked}`, url: files[0] };
  }

  const ext = picked.slice(picked.lastIndexOf('.')).toLowerCase();
  const fileName = `source${ext}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, fileName), bytes);

  // 缩略图尽力而为：失败不影响工程文件可用性，meta 里记 thumb:null。
  let thumb = null;
  if (typeof entry?.thumb === 'string' && entry.thumb !== '') {
    try {
      const t = await fetchImpl(entry.thumb, { env, maxBytes: 8 * 1024 * 1024 });
      if (t.ok && t.body.length > 0) {
        const ext2 = entry.thumb.toLowerCase().endsWith('.gif') ? '.gif' : '.jpg';
        writeFileSync(join(dir, `thumb${ext2}`), t.body);
        thumb = `thumb${ext2}`;
      }
    } catch {
      thumb = null;
    }
  }

  const meta = {
    gid,
    title: entry?.title ?? '',
    source_url: files[0],
    page: `https://www.originlab.com/www/products/GraphGallery.aspx?GID=${gid}`,
    file: fileName,
    origin_name: picked,
    sha256: sha256(bytes),
    bytes: bytes.length,
    downloaded_at: new Date().toISOString(),
    license: GALLERY_LICENSE,
    thumb,
  };
  writeFileSync(metaPath, `${JSON.stringify(meta, null, 1)}\n`, 'utf8');
  return { ok: true, gid, dir, file: join(dir, fileName), sha256: meta.sha256, bytes: meta.bytes, thumb: thumb === null ? null : join(dir, thumb), via: res.via ?? null };
}

/** 删除已安装的云端模板：只删 gallery-templates/gid-<n> 自己。 */
export function deleteGid(gid, { root = galleryRootDir() } = {}) {
  if (!Number.isInteger(gid) || gid <= 0) return { ok: false, code: 'bad-gid', message: `gid 非法：${gid}` };
  const dir = join(root, gidDirName(gid));
  if (!existsSync(dir)) return { ok: false, code: 'not-installed', message: `GID ${gid} 没装`, dir };
  rmSync(dir, { recursive: true, force: true });
  return { ok: true, gid, removed: dir };
}

/** 打开用的路径（沿用用户模板的打开通道，但目录是 gallery-templates）。 */
export function installedFilePath(gid, { root = galleryRootDir() } = {}) {
  const metaPath = join(root, gidDirName(gid), 'meta.json');
  if (!existsSync(metaPath)) return null;
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  const file = join(root, gidDirName(gid), meta.file ?? '');
  return existsSync(file) ? { path: file, meta } : null;
}

/* ───────────────────────── 在线刷新（只在用户点按钮时跑） ───────────────────────── */

const TITLE_RE = /id="LabelSP_title"[^>]*>([\s\S]{0,400}?)<\/span>/i;
const TYPE_RE = /Show more of same type[^"]*"/i;
const DL_RE = /id="HyperLinkSP_project"[^>]*href="([^"]+)"/i;
const IMG_RE = /images_galleries_new\/([A-Za-z0-9._%+-]+\.(?:png|jpg|jpeg|gif))/i;

function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/** 抓一个 GID 的单图页，抽出标题/下载链接/缩略图。 */
export async function probeGid(gid, { env = process.env, fetchImpl = fetchFollow } = {}) {
  const url = `https://www.originlab.com/www/products/GraphGallery.aspx?GID=${gid}`;
  try {
    const res = await fetchImpl(url, { env, timeoutMs: 20000, maxBytes: 2 * 1024 * 1024 });
    if (!res.ok) return { gid, status: res.status, ok: false };
    const html = res.body.toString('utf8');
    const title = decodeEntities((html.match(TITLE_RE)?.[1] ?? '').replace(/<[^>]+>/g, ''));
    const dl = html.match(DL_RE)?.[1] ?? null;
    const img = html.match(IMG_RE)?.[1] ?? null;
    return {
      gid,
      status: res.status,
      ok: true,
      title,
      files: dl === null ? [] : [dl.startsWith('//') ? `https:${dl}` : new URL(dl, url).toString()],
      thumb: img === null ? null : `https://d2mvzyuse3lwjc.cloudfront.net/www/resources/graph_gallery/images_galleries_new/${img}`,
    };
  } catch (error) {
    return { gid, ok: false, status: 0, error: error.message };
  }
}

/**
 * 用户点「刷新」时抓线上目录：按 GID 递增枚举（站点列表页硬截断 199 条且无翻页，
 * 只能靠 GID 枚举拿到全集），与包内 index.json 比对，报「新增 / 变化」。
 * 结果写 state/gallery-cache.json，供下次直接读；**不开定时器、不后台跑**。
 */
export async function refreshGallery({ env = process.env, templatesDir, maxGid = null, maxSeconds = 300, concurrency = 12, fetchImpl = fetchFollow, now = () => new Date() } = {}) {
  const started = Date.now();
  // 没传 templatesDir 时退回包内那份（面板路由会传技能副本/包内路径，脚本/测试可能不传）。
  const indexRoot = templatesDir || join(dirname(fileURLToPath(import.meta.url)), '..', 'templates');
  const index = loadGalleryIndex(indexRoot);
  const known = new Map();
  if (index.ok) for (const t of index.doc.templates) known.set(t.gid, t);
  const highest = [...known.keys()].reduce((a, b) => Math.max(a, b), 0);
  // 枚举范围：已知最大 GID + 64（站点新增条目只会追加在这之后），最少 200。
  const limit = Number.isInteger(maxGid) && maxGid > 0 ? maxGid : Math.max(highest + 64, 200);

  const results = [];
  let cursor = 1;
  const worker = async () => {
    while (cursor <= limit && Date.now() - started < maxSeconds * 1000) {
      const gid = cursor;
      cursor += 1;
      // eslint-disable-next-line no-await-in-loop
      results.push(await probeGid(gid, { env, fetchImpl }));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(24, concurrency)) }, worker));

  const pages = results.filter((r) => r.ok);
  // 「新增」只算有标题的条目：站点里存在大量空标题占位页（没有图名，用户点进去也没内容），
  // 把它们算进新增会让用户以为多了几十个模板。占位页单独计数，用于判断站点是否在扩容。
  const fresh = pages.filter((r) => !known.has(r.gid));
  const added = fresh.filter((r) => r.title !== '');
  const addedPlaceholders = fresh.length - added.length;
  const renamed = pages.filter((r) => known.has(r.gid) && r.title !== '' && known.get(r.gid).title !== r.title);
  const completed = cursor > limit;
  const summary = {
    refreshed_at: now().toISOString(),
    elapsed_ms: Date.now() - started,
    scanned: results.length,
    max_gid_scanned: Math.min(cursor - 1, limit),
    total_pages: pages.length,
    completed,
    added: added.map((r) => ({ gid: r.gid, title: r.title })).slice(0, 200),
    added_placeholders: addedPlaceholders,
    renamed: renamed.map((r) => ({ gid: r.gid, from: known.get(r.gid).title, to: r.title })).slice(0, 200),
    failed: results.filter((r) => !r.ok).length,
    truncated: !completed,
  };
  const cachePath = join(stateRootDir(env), 'gallery-cache.json');
  mkdirSync(stateRootDir(env), { recursive: true });
  writeFileSync(cachePath, `${JSON.stringify({ ...summary, pages: pages.map(({ gid, title, files, thumb }) => ({ gid, title, files, thumb })) }, null, 1)}\n`, 'utf8');
  return { ok: true, ...summary, cache: cachePath };
}

/** 上一次刷新的结果（没有就 null）。 */
export function readRefreshCache(env = process.env) {
  const path = join(stateRootDir(env), 'gallery-cache.json');
  if (!existsSync(path)) return null;
  try {
    const doc = JSON.parse(readFileSync(path, 'utf8'));
    return {
      refreshed_at: doc.refreshed_at ?? null,
      scanned: doc.scanned ?? 0,
      total_pages: doc.total_pages ?? 0,
      added: Array.isArray(doc.added) ? doc.added.length : 0,
      renamed: Array.isArray(doc.renamed) ? doc.renamed.length : 0,
      failed: doc.failed ?? 0,
      truncated: doc.truncated === true,
      elapsed_ms: doc.elapsed_ms ?? 0,
    };
  } catch {
    return null;
  }
}
