/**
 * dsh-plot-clone — 用户模板的落盘层（Origin 文件引用 + 元数据）
 * ==========================================================
 *
 * 用户模板 = **一个 Origin 文件**（`.otp` / `.otpu` / `.opj` / `.opju` / `.oth`）
 * 原样复制进 runtime 目录 + 一份 meta.json。这个模块**只做存文件、列清单、改名、删除**：
 *
 *   - 不解析 Origin 内部格式（那是 Origin 的活，走 MCP 通道）
 *   - 不量测、不生成预览图（没有就报「无缩略图」，绝不画假的）
 *   - 不写 status：用户模板不是「我们验证过的渲染」，不许因为「是用户自己的」就标 implemented
 *
 * 目录形状（`~/.dsh/dsh-plot-clone/user-templates/`，pnpm 重装不清）：
 *   <id>/source.otp     上传的文件（字节原样，只改文件名）
 *   <id>/figure.opju    从 Origin 存下来的工程（agent 用 origin_save_project 存的）
 *   <id>/thumb.png      可选；用户自己给的缩略图，没有就是空
 *   <id>/meta.json      id / 名字 / 分类 / 说明 / origin_file / 扩展名 / sha256 / 原始名 / 时间
 *   index.json          机器可读清单（每次增删改重建）
 */

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

/** 只认这五种 Origin 文件；别的扩展名一律拒绝，不做「猜格式」。 */
export const ORIGIN_EXTS = Object.freeze(['.otp', '.otpu', '.opj', '.opju', '.oth']);

/** 单文件上限：Origin 工程可能不小，图片那条 8 MB 的口径不适用。 */
export const MAX_USER_FILE = 64 * 1024 * 1024;

/** 用户模板 id 与仓库模板同口径：小写字母数字开头，只含 `[a-z0-9_-]`（同时是防目录穿越的闸门）。 */
export const USER_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

const USAGE = {
  '.otp': 'Origin 图形模板：在 Origin 里打开它并套用图层样式（模板不含数据）',
  '.otpu': 'Origin 图形模板（用户版）：在 Origin 里打开它并套用图层样式（模板不含数据）',
  '.opj': 'Origin 工程：交给 Origin 打开 → origin_list_graphs 找到图 → origin_inspect_graph 读现状 → origin_template_save 存成样式快照',
  '.opju': 'Origin 工程：交给 Origin 打开 → origin_list_graphs 找到图 → origin_inspect_graph 读现状 → origin_template_save 存成样式快照',
  '.oth': 'Origin 主题：在 Origin 的 Theme Manager 里套用该主题',
};

/** 「怎么用它」那一行：给用户看，也给 agent 看（selection.json 里会带上）。 */
export function usageHint(ext) {
  return USAGE[String(ext ?? '').toLowerCase()] ?? '未知 Origin 文件类型';
}

export function isOriginFile(filename) {
  return ORIGIN_EXTS.includes(extname(String(filename ?? '')).toLowerCase());
}

/** 用户模板根目录（调用方传 stateDir，避免和 templates.js 互相 import）。 */
export function userTemplatesDir(stateDirPath) {
  return join(stateDirPath, 'user-templates');
}

export function indexPath(root) {
  return join(root, 'index.json');
}

/** id 必须过白名单才允许拼路径——这是唯一的目录穿越闸门。 */
export function templateDir(root, id) {
  if (!USER_ID_RE.test(String(id ?? ''))) throw new Error(`illegal template id: ${id}`);
  return join(root, String(id));
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function readMeta(root, id) {
  try {
    const meta = JSON.parse(readFileSync(join(templateDir(root, id), 'meta.json'), 'utf8'));
    return meta && typeof meta === 'object' ? meta : null;
  } catch {
    return null;
  }
}

/** 缩略图：只认用户自己放进来的 thumb.png，没有就 null（不许拿别人的图充）。 */
export function thumbFile(root, id) {
  try {
    const p = join(templateDir(root, id), 'thumb.png');
    if (!existsSync(p)) return null;
    const st = statSync(p);
    return st.isFile() && st.size > 0 ? p : null;
  } catch {
    return null;
  }
}

export function originFilePath(root, meta) {
  const rel = String(meta?.origin_file ?? '');
  if (rel === '' || rel.includes('..') || rel.startsWith('/') || rel.startsWith('\\')) return null;
  try {
    const p = join(templateDir(root, meta.id), rel);
    const st = statSync(p);
    return st.isFile() && st.size > 0 ? p : null;
  } catch {
    return null;
  }
}

/** 目录扫描（不信 index.json：手工删过目录也不会列出一条幽灵模板）。 */
export function listUserTemplates(root) {
  if (!existsSync(root)) return [];
  let names = [];
  try {
    names = readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && USER_ID_RE.test(d.name))
      .map((d) => d.name);
  } catch {
    return [];
  }
  return names
    .map((id) => readMeta(root, id))
    .filter((m) => m !== null)
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
}

/** meta → 清单条目（`--list` / GET /templates 共用同一形状）。 */
export function entryOf(root, meta) {
  const abs = originFilePath(root, meta);
  return {
    id: String(meta.id),
    name: String(meta.name ?? meta.id),
    name_zh: String(meta.name ?? meta.id),
    category: String(meta.category ?? 'user/custom'),
    kind: 'user',
    origin: 'user',
    visibility: 'private',
    note: String(meta.note ?? ''),
    origin_file: abs,
    original_name: String(meta.original_name ?? ''),
    ext: String(meta.ext ?? ''),
    sha256: String(meta.sha256 ?? ''),
    size: Number(meta.size ?? 0),
    created_at: String(meta.created_at ?? ''),
    updated_at: String(meta.updated_at ?? ''),
    path: String(meta.id),
    usage: usageHint(meta.ext),
  };
}

export function readUserIndex(root) {
  try {
    const parsed = JSON.parse(readFileSync(indexPath(root), 'utf8'));
    return Array.isArray(parsed?.templates) ? parsed.templates : null;
  } catch {
    return null;
  }
}

/** 增删改之后重建 index.json —— 永远由目录推导，不做增量修补。 */
export function rebuildIndex(root) {
  const entries = listUserTemplates(root).map((m) => entryOf(root, m));
  if (entries.length === 0) {
    // 一条都没有就不留一份空索引；下次创建时再建。
    try {
      rmSync(indexPath(root), { force: true });
    } catch {
      /* 删不掉也不算错 */
    }
    return entries;
  }
  mkdirSync(root, { recursive: true });
  writeFileSync(
    indexPath(root),
    `${JSON.stringify({ schema_version: 1, updated_at: new Date().toISOString(), templates: entries }, null, 1)}\n`,
    'utf8',
  );
  return entries;
}

function newId(root) {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  for (let i = 0; i < 20; i += 1) {
    const id = `user-${stamp}-${randomBytes(2).toString('hex')}`;
    if (!existsSync(join(root, id))) return id;
  }
  throw new Error('无法生成唯一模板 id');
}

function cleanText(v, max) {
  const s = String(v ?? '').replace(/[\r\n\t]+/g, ' ').trim();
  return s.slice(0, max);
}

/**
 * 建一条用户模板。`role`：
 *   - `upload`：用户手选的文件 → 存成 `source.<ext>`
 *   - `origin`：agent 从 Origin 存下来的图/工程 → 存成 `figure.<ext>`
 * 返回 `{ok:true,id,dir,meta,originFile}` 或 `{ok:false,code,message}`（错误必须有话说，不静默）。
 */
export function createUserTemplate({ root, bytes, filename, name, category, note, role = 'upload' }) {
  const ext = extname(String(filename ?? '')).toLowerCase();
  if (!ORIGIN_EXTS.includes(ext)) {
    return {
      ok: false,
      code: 'unsupported-ext',
      message: `只支持 Origin 文件：${ORIGIN_EXTS.join(' ')}；收到 ${ext === '' ? '(无扩展名)' : ext}`,
    };
  }
  const buf = bytes instanceof Uint8Array ? Buffer.from(bytes) : null;
  if (buf === null || buf.length === 0) return { ok: false, code: 'empty-file', message: '文件是空的（0 字节）' };
  if (buf.length > MAX_USER_FILE) {
    return { ok: false, code: 'too-large', message: `文件 ${buf.length} 字节，超过上限 ${MAX_USER_FILE} 字节（64 MB）` };
  }

  const id = newId(root);
  const dir = join(root, id);
  const rel = `${role === 'origin' ? 'figure' : 'source'}${ext}`;
  const now = new Date().toISOString();
  const meta = {
    id,
    name: cleanText(name, 80) || basename(String(filename ?? ''), ext) || id,
    category: cleanText(category, 60) || 'user/custom',
    note: cleanText(note, 400),
    origin_file: rel,
    ext,
    sha256: sha256(buf),
    original_name: String(filename ?? ''),
    size: buf.length,
    created_at: now,
    updated_at: now,
  };

  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, rel), buf); // 原样字节，不做任何转码/改写
  writeFileSync(join(dir, 'meta.json'), `${JSON.stringify(meta, null, 1)}\n`, 'utf8');
  rebuildIndex(root);
  return { ok: true, id, dir, meta, originFile: join(dir, rel) };
}

export function removeUserTemplate(root, id) {
  let dir;
  try {
    dir = templateDir(root, id);
  } catch (error) {
    return { ok: false, code: 'bad-id', message: error.message };
  }
  if (!existsSync(join(dir, 'meta.json'))) {
    return { ok: false, code: 'not-found', message: `没有这个用户模板：${id}` };
  }
  rmSync(dir, { recursive: true, force: true });
  const entries = rebuildIndex(root);
  return { ok: true, id: String(id), count: entries.length };
}

/** 只改元数据（名字/分类/说明），不动文件、不动 sha256。 */
export function renameUserTemplate(root, id, { name, category, note } = {}) {
  const meta = readMeta(root, id);
  if (meta === null) return { ok: false, code: 'not-found', message: `没有这个用户模板：${id}` };
  const nextName = cleanText(name, 80);
  if (nextName === '') return { ok: false, code: 'bad-name', message: '名字不能为空' };
  const next = {
    ...meta,
    name: nextName,
    category: cleanText(category, 60) || meta.category || 'user/custom',
    note: note === undefined ? meta.note : cleanText(note, 400),
    updated_at: new Date().toISOString(),
  };
  writeFileSync(join(templateDir(root, id), 'meta.json'), `${JSON.stringify(next, null, 1)}\n`, 'utf8');
  rebuildIndex(root);
  return { ok: true, id: String(id), meta: next };
}
