/**
 * dsh-plot-clone — 极简 ZIP 读取器（纯 Node，不引第三方库）
 * ======================================================
 *
 * 为什么要自己写：云端模板下载下来的是 zip，里面可能只有 1 个 .opj/.opju/.otp。
 * 为了不把 jszip / yauzl 拖进依赖（pnpm 装不上就整个插件挂），这里只实现
 * 「读中央目录 → 挑选条目 → inflate」这一条路径，够用且可审计。
 *
 * 硬规矩（测试 test/gallery_test.mjs 覆盖）：
 *   1. **路径穿越必须拒**：`../x`、`/abs/x`、`C:\x`、反斜杠、空名，一律 ZipError。
 *   2. 只认 method 0（stored）与 8（deflate），其余抛 `unsupported-compression`。
 *   3. 条目数与解压总字节有上限，防 zip bomb。
 *   4. 不做 zip 加密（flags & 1 → `encrypted`）。
 */

import { inflateRawSync } from 'node:zlib';

export const ZIP_ERRORS = Object.freeze({
  NOT_ZIP: 'not-zip',
  BAD_CENTRAL: 'bad-central-directory',
  UNSAFE_PATH: 'unsafe-path',
  ENCRYPTED: 'encrypted',
  UNSUPPORTED_COMPRESSION: 'unsupported-compression',
  TOO_LARGE: 'too-large',
});

export class ZipError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ZipError';
    this.code = code;
  }
}

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const MAX_ENTRIES = 4096;
const MAX_TOTAL_BYTES = 512 * 1024 * 1024;

/** zip 内路径安全检查：返回归一化后的相对路径（用 `/` 分隔），不合法就抛。 */
export function safeEntryName(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new ZipError(ZIP_ERRORS.UNSAFE_PATH, `zip 条目名为空`);
  }
  if (raw.includes('\\')) {
    throw new ZipError(ZIP_ERRORS.UNSAFE_PATH, `zip 条目名含反斜杠：${raw}`);
  }
  if (raw.startsWith('/') || /^[a-zA-Z]:/.test(raw)) {
    throw new ZipError(ZIP_ERRORS.UNSAFE_PATH, `zip 条目名是绝对路径：${raw}`);
  }
  const parts = raw.split('/');
  if (parts.some((p) => p === '..')) {
    throw new ZipError(ZIP_ERRORS.UNSAFE_PATH, `zip 条目名含 .. ：${raw}`);
  }
  const clean = parts.filter((p) => p !== '.' && p !== '').join('/');
  if (clean === '') throw new ZipError(ZIP_ERRORS.UNSAFE_PATH, `zip 条目名为空`);
  return clean;
}

function findEocd(buf) {
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i -= 1) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

/** 读中央目录：列出条目元数据，不碰数据段。 */
export function listZipEntries(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new ZipError(ZIP_ERRORS.NOT_ZIP, '文件太小，不是 zip');
  const eocd = findEocd(buf);
  if (eocd < 0) throw new ZipError(ZIP_ERRORS.NOT_ZIP, '找不到 zip 目录尾（可能是 rar/7z 或损坏文件）');
  const count = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (count > MAX_ENTRIES) throw new ZipError(ZIP_ERRORS.TOO_LARGE, `zip 条目过多：${count}`);
  if (cdOffset >= buf.length) throw new ZipError(ZIP_ERRORS.BAD_CENTRAL, '中央目录偏移越界');

  const entries = [];
  let p = cdOffset;
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CENTRAL_SIG) {
      throw new ZipError(ZIP_ERRORS.BAD_CENTRAL, `第 ${i + 1} 个中央目录项损坏`);
    }
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const rawName = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    total += size;
    if (total > MAX_TOTAL_BYTES) throw new ZipError(ZIP_ERRORS.TOO_LARGE, '解压后总量超过上限');
    entries.push({
      name: safeEntryName(rawName),
      rawName,
      flags,
      method,
      compSize,
      size,
      localOffset,
      isDir: rawName.endsWith('/'),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** 解一个条目的原始字节。 */
function readEntryData(buf, entry) {
  if ((entry.flags & 0x1) !== 0) throw new ZipError(ZIP_ERRORS.ENCRYPTED, `zip 条目加密：${entry.name}`);
  const lo = entry.localOffset;
  if (lo + 30 > buf.length || buf.readUInt32LE(lo) !== LOCAL_SIG) {
    throw new ZipError(ZIP_ERRORS.BAD_CENTRAL, `本地头损坏：${entry.name}`);
  }
  const nameLen = buf.readUInt16LE(lo + 26);
  const extraLen = buf.readUInt16LE(lo + 28);
  const start = lo + 30 + nameLen + extraLen;
  const end = start + entry.compSize;
  if (start < 0 || end > buf.length) throw new ZipError(ZIP_ERRORS.BAD_CENTRAL, `数据段越界：${entry.name}`);
  const body = buf.subarray(start, end);
  if (entry.method === 0) return Buffer.from(body);
  if (entry.method === 8) return inflateRawSync(body);
  throw new ZipError(ZIP_ERRORS.UNSUPPORTED_COMPRESSION, `不支持的压缩方式 ${entry.method}：${entry.name}`);
}

/** 全量解压成 Map<name, Buffer>（跳过目录项）。 */
export function extractZip(buf) {
  const entries = listZipEntries(buf);
  const out = new Map();
  for (const entry of entries) {
    if (entry.isDir) continue;
    out.set(entry.name, readEntryData(buf, entry));
  }
  return out;
}

export const PROJECT_EXTS = Object.freeze(['.opju', '.opj', '.otp']);

/** 从条目名里挑出 Origin 工程文件；多个时优先 .opju → .opj → .otp，再按名字排序保证确定性。 */
export function pickProjectFile(names) {
  const rank = (name) => {
    const lower = name.toLowerCase();
    const i = PROJECT_EXTS.indexOf(lower.slice(lower.lastIndexOf('.')));
    return i < 0 ? 99 : i;
  };
  const hits = [...names].filter((n) => rank(n) !== 99).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return hits[0] ?? null;
}
