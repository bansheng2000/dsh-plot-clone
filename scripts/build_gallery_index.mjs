#!/usr/bin/env node
/**
 * 从 Graph Gallery 抓取结果生成随包目录快照 `templates/gallery/index.json`。
 *
 * 输入（都是未跟踪的原始抓取件，放在 .probe/gallery/）：
 *   gids.jsonl            1664 行：gid / http / title / download / ext / img
 *   pass2.jsonl           617 行：gid / title / types / kw / files / dlsrc / ver
 * 输出：templates/gallery/index.json —— **只有元数据**，不含任何 .opj/.opju/.otp 字节。
 *
 * 归一规则（写死，测试在 test/gallery_test.mjs）：
 *   · 只保留 617 条（含 23 条标题为空的占位页），全部条目都进文件；
 *   · files 非空的标 downloadable:true，空的标 false（占位页与无附件条目）；
 *   · thumb 的 `//host/...` 补成 `https:`；没有则 null；
 *   · 按 gid 升序、gid 去重（后出现的覆盖先出现的）。
 *
 * 用法：
 *   node scripts/build_gallery_index.mjs                  # 写 templates/gallery/index.json
 *   node scripts/build_gallery_index.mjs --check          # 只校验已生成文件与输入一致
 *   node scripts/build_gallery_index.mjs --src .probe/gallery --out templates/gallery/index.json
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/** 官方下载/缩略图 host 白名单：index.json 里出现别的 host 一律算生成失败。 */
export const ALLOWED_HOSTS = Object.freeze(['blog.originlab.com', 'd2mvzyuse3lwjc.cloudfront.net', 'www.originlab.com']);

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

function readJsonl(path) {
  if (!existsSync(path)) throw new Error(`缺少输入文件：${path}`);
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((row) => row !== null);
}

/** `//host/x.png` → `https://host/x.png`；别的形态原样保留（后面由白名单校验兜底）。 */
export function normalizeThumb(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s === '') return null;
  if (s.startsWith('//')) {
    const abs = `https:${s}`;
    // 占位页的 img 是目录（以 `/` 结尾），不是图片文件 —— 当没有缩略图。
    return abs.slice(-1) === '/' ? null : abs;
  }
  return s;
}

/** 反向：把 https URL 的 host 抽出来，越界的返回 null。 */
export function hostOf(url) {
  try {
    return new URL(String(url)).host.toLowerCase();
  } catch {
    return null;
  }
}

/** 下载直链归一：`/ftp/...` 是站内相对路径，补成官方绝对地址；其余原样（白名单兜底）。 */
export function normalizeFileUrl(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s === '') return null;
  if (s.startsWith('//')) return `https:${s}`;
  if (s.startsWith('/')) return `https://www.originlab.com${s}`;
  return s;
}

/**
 * 合并两个来源：pass2 给 types/keywords/files，gids 给 thumb（img）。
 * 同一个 gid 两处都有时以 pass2 的标题为准（它抓的是单图页）。
 */
export function buildIndex(gids, pass2) {
  const byGid = new Map();
  for (const row of gids) {
    const gid = Number(row?.gid);
    if (!Number.isInteger(gid) || gid <= 0) continue;
    // gids.jsonl 是全量枚举（1664 次 GET），其中 1047 个 GID 返回 HTTP 500 错误页；
    // 只有 200 的才是有内容的单图页，其余不进目录。
    if (Number(row?.http) !== 200) continue;
    byGid.set(gid, {
      gid,
      title: typeof row?.title === 'string' ? row.title.trim() : '',
      types: [],
      keywords: [],
      files: [],
      thumb: normalizeThumb(row?.img),
      downloadable: false,
      placeholder: false,
    });
  }
  for (const row of pass2) {
    const gid = Number(row?.gid);
    if (!Number.isInteger(gid) || gid <= 0) continue;
    const prev = byGid.get(gid) ?? {
      gid,
      title: '',
      types: [],
      keywords: [],
      files: [],
      thumb: null,
      downloadable: false,
      placeholder: false,
    };
    const title = typeof row?.title === 'string' && row.title.trim() !== '' ? row.title.trim() : prev.title;
    const files = Array.isArray(row?.files)
      ? row.files.map(normalizeFileUrl).filter((f) => f !== null)
      : prev.files;
    byGid.set(gid, {
      ...prev,
      title,
      types: Array.isArray(row?.types) ? row.types.filter((t) => typeof t === 'string' && t !== '') : [],
      keywords: Array.isArray(row?.kw) ? row.kw.filter((k) => typeof k === 'string' && k !== '') : [],
      files,
      downloadable: files.length > 0,
      placeholder: title === '' && files.length === 0,
    });
  }
  return [...byGid.values()].sort((a, b) => a.gid - b.gid);
}

/** schema 校验：生成后立刻自检，别把坏文件写进仓库。 */
export function validateIndex(doc) {
  const errors = [];
  if (doc === null || typeof doc !== 'object') return ['index 必须是对象'];
  if (!Array.isArray(doc.templates)) return ['templates 必须是数组'];
  const seen = new Set();
  for (const t of doc.templates) {
    if (!Number.isInteger(t?.gid) || t.gid <= 0) errors.push(`gid 非法：${JSON.stringify(t?.gid)}`);
    if (seen.has(t?.gid)) errors.push(`gid 重复：${t?.gid}`);
    seen.add(t?.gid);
    if (typeof t?.title !== 'string') errors.push(`gid ${t?.gid} title 不是字符串`);
    for (const key of ['types', 'keywords', 'files']) {
      if (!Array.isArray(t?.[key])) errors.push(`gid ${t?.gid} ${key} 不是数组`);
    }
    if (t?.thumb !== null && typeof t?.thumb !== 'string') errors.push(`gid ${t?.gid} thumb 非法`);
    if (typeof t?.downloadable !== 'boolean') errors.push(`gid ${t?.gid} downloadable 不是布尔`);
    for (const f of t?.files ?? []) {
      const host = hostOf(f);
      if (host === null || !ALLOWED_HOSTS.includes(host)) errors.push(`gid ${t?.gid} 下载 URL host 不在白名单：${f}`);
    }
    if (t?.thumb) {
      const host = hostOf(t.thumb);
      if (host === null || !ALLOWED_HOSTS.includes(host)) errors.push(`gid ${t?.gid} thumb host 不在白名单：${t.thumb}`);
    }
  }
  if (doc.counts && doc.counts.total !== doc.templates.length) errors.push('counts.total 与条目数不一致');
  return errors;
}

export function buildDocument(gids, pass2) {
  const templates = buildIndex(gids, pass2);
  const doc = {
    source: 'https://www.originlab.com/www/products/GraphGallery.aspx',
    license: 'OriginLab copyright. 仅元数据快照；工程文件由用户按需自 OriginLab 下载，本插件不随包分发。',
    generated_by: 'scripts/build_gallery_index.mjs',
    counts: {
      total: templates.length,
      downloadable: templates.filter((t) => t.downloadable).length,
      placeholder: templates.filter((t) => t.placeholder).length,
    },
    templates,
  };
  return doc;
}

function main() {
  const src = resolve(ROOT, arg('src', '.probe/gallery'));
  const out = resolve(ROOT, arg('out', 'templates/gallery/index.json'));
  const gids = readJsonl(join(src, 'gids.jsonl'));
  const pass2 = readJsonl(join(src, 'pass2.jsonl'));
  const doc = buildDocument(gids, pass2);
  const errors = validateIndex(doc);

  if (process.argv.includes('--check')) {
    if (!existsSync(out)) {
      console.error(`FAIL 还没有生成 ${out}`);
      return 1;
    }
    const onDisk = JSON.parse(readFileSync(out, 'utf8'));
    const same = JSON.stringify(onDisk) === JSON.stringify(doc);
    console.log(`check: ${same ? 'MATCH' : 'DIFF'} on-disk vs 输入`);
    console.log(`总 ${doc.counts.total} / 可下载 ${doc.counts.downloadable} / 占位 ${doc.counts.placeholder}`);
    if (errors.length > 0) {
      for (const e of errors.slice(0, 10)) console.error(`  ✗ ${e}`);
      return 1;
    }
    return same ? 0 : 1;
  }

  if (errors.length > 0) {
    console.error(`FAIL schema：${errors.length} 条问题`);
    for (const e of errors.slice(0, 10)) console.error(`  ✗ ${e}`);
    return 1;
  }

  mkdirSync(dirname(out), { recursive: true });
  const text = `${JSON.stringify(doc, null, 1)}\n`;
  writeFileSync(out, text, 'utf8');
  const digest = createHash('sha256').update(text).digest('hex');
  console.log(`写 ${out}`);
  console.log(`总 ${doc.counts.total} / 可下载 ${doc.counts.downloadable} / 占位 ${doc.counts.placeholder}`);
  console.log(`sha256 ${digest}`);
  console.log(`bytes ${Buffer.byteLength(text)}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
