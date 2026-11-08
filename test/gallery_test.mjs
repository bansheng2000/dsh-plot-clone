#!/usr/bin/env node
/**
 * 云端模板（OriginLab Graph Gallery）单测 —— 不联网、不碰 Origin。
 *
 * 覆盖：
 *   1. 包内 index.json 的 schema / 条数 / host 白名单 / 「不含工程二进制」
 *   2. 分类归一（3D / 统计-QC / 专业坐标 / 2D / 其他）与已安装判定
 *   3. zip 读取：stored + deflate、挑 .opj/.opju/.otp
 *   4. 路径穿越必须拒（`../`、绝对路径、反斜杠、驱动盘）
 *   5. 下载链路：fixture zip → gid-<n>/source.opju + meta.json（sha256/bytes/license）
 *   6. 幂等（已安装不覆盖）与删除、错误分支（404 / zip 里没有工程文件 / gid 非法）
 *
 * 跑法：
 *   node test/gallery_test.mjs
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';

import {
  GALLERY_CATEGORIES,
  classifyEntry,
  deleteGid,
  downloadGid,
  galleryListView,
  installedMap,
  loadGalleryIndex,
  refreshGallery,
} from '../lib/gallery.js';
import { ZipError, extractZip, listZipEntries, pickProjectFile, safeEntryName } from '../lib/zip.js';

let ok = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) {
    ok += 1;
    return;
  }
  failures.push(`${name}${detail === '' ? '' : ` — ${detail}`}`);
}
function eq(name, actual, expected) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}

/* ───────── 最小 zip 构造器（只为测试，不做压缩优化） ───────── */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), 'utf8');
    const method = entry.method === 8 ? 8 : 0;
    const body = method === 8 ? deflateRawSync(data) : data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, eocd]);
}

/* ───────── 1. 包内 index.json ───────── */

const loaded = loadGalleryIndex(join(process.cwd(), 'templates'));
check('index.json 能加载', loaded.ok === true, loaded.message ?? '');
if (loaded.ok) {
  const doc = loaded.doc;
  eq('index 条数 617', doc.templates.length, 617);
  eq('可下载 455', doc.templates.filter((t) => t.downloadable && t.files.length > 0).length, 455);
  eq('占位 21（标题空且无文件）', doc.templates.filter((t) => t.placeholder).length, 21);
  const allowed = ['blog.originlab.com', 'd2mvzyuse3lwjc.cloudfront.net', 'www.originlab.com'];
  const badHost = doc.templates.flatMap((t) => [...t.files, t.thumb].filter(Boolean)).filter((u) => {
    try {
      return !allowed.includes(new URL(u).host.toLowerCase());
    } catch {
      return true;
    }
  });
  eq('所有 URL 都在白名单', badHost.length, 0);
  const gids = new Set(doc.templates.map((t) => t.gid));
  eq('gid 唯一', gids.size, doc.templates.length);
  check('gid 都是正整数', doc.templates.every((t) => Number.isInteger(t.gid) && t.gid > 0));
  eq('gid 升序', doc.templates.every((t, i) => i === 0 || t.gid > doc.templates[i - 1].gid), true);
}

// 包内不许出现 Origin 工程二进制：只允许 index.json。
const galleryDir = join(process.cwd(), 'templates', 'gallery');
const galleryFiles = existsSync(galleryDir) ? readdirSync(galleryDir) : [];
eq('templates/gallery 只有 index.json', galleryFiles, ['index.json']);
check('包内没有任何工程文件', !galleryFiles.some((f) => /\.(opj|opju|otp|otpu|oth)$/i.test(f)), galleryFiles.join(','));

/* ───────── 2. 分类归一 ───────── */

eq('3D surface 归 3D', classifyEntry({ types: ['Surface Plot'], keywords: [] }), '3d');
eq('关键词 3D 也归 3D', classifyEntry({ types: [], keywords: ['3D plot'] }), '3d');
eq('直方图归统计', classifyEntry({ types: ['Histogram'], keywords: [] }), 'stats');
eq('Pareto 归统计', classifyEntry({ types: ['Pareto Chart'], keywords: [] }), 'stats');
eq('极坐标归专业坐标', classifyEntry({ types: ['Polar Chart'], keywords: [] }), 'special');
eq('Sankey 归专业坐标', classifyEntry({ types: ['Sankey'], keywords: [] }), 'special');
eq('普通折线归 2D', classifyEntry({ types: ['Line Scatter Plot'], keywords: [] }), '2d');
eq('无类型无关键词归其他', classifyEntry({ types: [], keywords: [], title: 'x' }), 'other');
check('分类表含 7 档', GALLERY_CATEGORIES.length === 7, String(GALLERY_CATEGORIES.length));

/* ───────── 3. zip 读取 ───────── */

const zip = makeZip([
  { name: 'doc/readme.txt', data: 'hello', method: 0 },
  { name: 'project/Yet Another Graph.opju', data: Buffer.alloc(2048, 7), method: 8 },
]);
const names = listZipEntries(zip).map((e) => e.name);
eq('列出 2 个条目', names.length, 2);
eq('挑出 .opju', pickProjectFile(names), 'project/Yet Another Graph.opju');
const files = extractZip(zip);
eq('解出 2 个条目', files.size, 2);
eq('deflate 条目内容完整', files.get('project/Yet Another Graph.opju').length, 2048);
eq('stored 条目内容完整', files.get('doc/readme.txt').toString('utf8'), 'hello');
eq('多个工程文件时 .opju 优先于 .opj', pickProjectFile(['a.opj', 'b.opju']), 'b.opju');
eq('没有工程文件返回 null', pickProjectFile(['a.txt', 'b.png']), null);

/* ───────── 4. 路径穿越 ───────── */

const unsafe = [
  ['../evil.opju', 'unsafe-path'],
  ['/abs/evil.opju', 'unsafe-path'],
  ['C:/evil.opju', 'unsafe-path'],
  ['dir\\evil.opju', 'unsafe-path'],
  ['', 'unsafe-path'],
];
let refused = 0;
for (const [name, code] of unsafe) {
  try {
    safeEntryName(name);
  } catch (error) {
    if (error instanceof ZipError && error.code === code) refused += 1;
  }
}
eq('5 种非法路径全部拒绝', refused, 5);
const evilZip = makeZip([{ name: '../escape.opju', data: 'x', method: 0 }]);
let evilCode = '';
try {
  extractZip(evilZip);
} catch (error) {
  evilCode = error.code ?? '';
}
eq('含 ../ 的 zip 解压即拒', evilCode, 'unsafe-path');

/* ───────── 5. 下载链路（fixture zip，不联网） ───────── */

const stateRoot = mkdtempSync(join(tmpdir(), 'pc-gallery-'));
const root = join(stateRoot, 'gallery-templates');
const projectBytes = Buffer.alloc(4096, 3);
const fixtureZip = makeZip([{ name: 'Graph1.opju', data: projectBytes, method: 8 }]);
const calls = [];
const fakeFetch = async (url) => {
  calls.push(url);
  if (String(url).includes('thumb')) return { ok: true, status: 200, body: Buffer.from([0xff, 0xd8, 0xff]), via: 'fake' };
  return { ok: true, status: 200, body: fixtureZip, via: 'fake' };
};

const entry = {
  gid: 254,
  title: 'Quality Control - Pareto Chart',
  files: ['https://blog.originlab.com/ftp/graph_gallery/GID254_2026b.zip'],
  thumb: 'https://d2mvzyuse3lwjc.cloudfront.net/x.png',
};
const first = await downloadGid({ gid: 254, entry, root, fetchImpl: fakeFetch });
check('下载成功', first.ok === true, first.message ?? '');
eq('落盘 source.opju', first.file.replace(/\\/g, '/').endsWith('gid-254/source.opju'), true);
eq('字节数', first.bytes, projectBytes.length);
eq('sha256 与实际字节一致', first.sha256, createHash('sha256').update(projectBytes).digest('hex'));
const meta = JSON.parse(readFileSync(join(root, 'gid-254', 'meta.json'), 'utf8'));
eq('meta.license', meta.license, 'OriginLab copyright, local personal use only');
eq('meta 记来源页', meta.page.includes('GID=254'), true);
eq('meta 记原始文件名', meta.origin_name, 'Graph1.opju');
const inst = installedMap(root);
eq('已安装扫到 1 条', inst.size, 1);
eq('已安装字节数', inst.get(254).bytes, projectBytes.length);

const again = await downloadGid({ gid: 254, entry, root, fetchImpl: fakeFetch });
eq('重复下载不覆盖（already-installed）', again.code, 'already-installed');
const overwrite = await downloadGid({ gid: 254, entry, root, overwrite: true, fetchImpl: fakeFetch });
check('显式覆盖可重下', overwrite.ok === true, overwrite.message ?? '');

/* 错误分支 */
const e404 = await downloadGid({ gid: 9, entry: { ...entry, gid: 9 }, root, fetchImpl: async () => ({ ok: false, status: 404, body: Buffer.alloc(0) }) });
eq('HTTP 404 → not-found', e404.code, 'not-found');
const noProj = makeZip([{ name: 'only.txt', data: 'x', method: 0 }]);
const eNoProj = await downloadGid({ gid: 10, entry: { ...entry, gid: 10 }, root, fetchImpl: async () => ({ ok: true, status: 200, body: noProj }) });
eq('zip 里没有工程文件 → no-project-in-zip', eNoProj.code, 'no-project-in-zip');
const eNoFiles = await downloadGid({ gid: 11, entry: { gid: 11, files: [] }, root, fetchImpl: fakeFetch });
eq('站点无文件 → no-download', eNoFiles.code, 'no-download');
const eNet = await downloadGid({ gid: 12, entry: { ...entry, gid: 12 }, root, fetchImpl: async () => { throw new Error('boom'); } });
eq('网络异常 → network-error', eNet.code, 'network-error');
const eBadGid = deleteGid('abc', { root });
eq('非数字 gid 删除被拒', eBadGid.code, 'bad-gid');

/* 列表视图：已安装分类只出已装条目 */
const doc = {
  templates: [
    { gid: 254, title: 'A', types: ['Line Scatter Plot'], keywords: [], files: ['https://blog.originlab.com/a.zip'], thumb: null, downloadable: true, placeholder: false },
    { gid: 1, title: 'B', types: ['Surface Plot'], keywords: [], files: [], thumb: null, downloadable: false, placeholder: false },
  ],
};
const instView = galleryListView(doc, { root, category: 'installed' });
eq('已安装分类只出 1 条', instView.templates.length, 1);
eq('已安装分类计数', instView.counts.installed, 1);
const q3d = galleryListView(doc, { root, category: '3d' });
eq('3D 分类只出 1 条', q3d.templates.length, 1);
const searched = galleryListView(doc, { root, category: 'all', query: 'surface' });
eq('关键词搜索命中 1 条', searched.templates.length, 1);

/* 删除 */
const removed = deleteGid(254, { root });
check('删除成功', removed.ok === true, removed.message ?? '');
eq('删除后目录不在了', existsSync(join(root, 'gid-254')), false);
eq('删除后已安装为空', installedMap(root).size, 0);
eq('再删一次是 not-installed', deleteGid(254, { root }).code, 'not-installed');

rmSync(stateRoot, { recursive: true, force: true });

/* 刷新：线上枚举只把「有标题」的算新增，空标题占位页单独计数 */
const refreshHome = mkdtempSync(join(tmpdir(), 'pc-refresh-'));
const refreshTemplates = join(refreshHome, 'templates');
const refreshIndex = {
  version: 1,
  counts: { total: 1, downloadable: 1, placeholder: 0 },
  templates: [{ gid: 1, title: '已有图', types: [], keywords: [], files: [], thumb: null, downloadable: false }],
};
mkdirSync(join(refreshTemplates, 'gallery'), { recursive: true });
writeFileSync(join(refreshTemplates, 'gallery', 'index.json'), JSON.stringify(refreshIndex));
const pageHtml = (title) => `<span id="LabelSP_title">${title}</span>`;
const fakePages = async (url) => {
  const gid = Number(new URL(url).searchParams.get('GID'));
  const title = { 1: '已有图', 2: '新图 A', 3: '' }[gid] ?? '';
  if (gid > 3) return { ok: false, status: 500, body: Buffer.alloc(0) };
  return { ok: true, status: 200, body: Buffer.from(pageHtml(title), 'utf8') };
};
const refreshed = await refreshGallery({
  env: { ...process.env, DSH_HOME: refreshHome },
  templatesDir: refreshTemplates,
  maxGid: 4,
  fetchImpl: fakePages,
});
eq('刷新扫描 4 个 GID', refreshed.scanned, 4);
eq('刷新新增只算有标题的', refreshed.added.map((a) => a.gid).join(','), '2');
eq('刷新占位页单独计数', refreshed.added_placeholders, 1);
eq('刷新失败数', refreshed.failed, 1);
check('刷新落 gallery-cache.json', existsSync(join(refreshHome, 'dsh-plot-clone', 'gallery-cache.json')));
rmSync(refreshHome, { recursive: true, force: true });

/* ───────── 汇总 ───────── */

if (failures.length > 0) {
  console.error(`gallery_test FAIL: ${failures.length} 条`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`gallery_test ok: ${ok} 项全通过`);
