#!/usr/bin/env node
/**
 * vendor_sync.mjs — 把新版上游 Origin MCP 与包内 `server/` 做只读差异比对
 * =======================================================================
 *
 * 定位：`server/` 是**冻结快照**（随插件发版）。上游更新不会自动进来；要跟进时
 * 先跑本脚本看差在哪，再人工决定合并哪些文件。脚本**不写盘、不联网**。
 *
 * 用法：
 *   node scripts/vendor_sync.mjs --from <上游目录>
 *   node scripts/vendor_sync.mjs --from <上游 .tgz>
 *   node scripts/vendor_sync.mjs --from <上游目录> --json   # 机器可读
 *
 * 退出码：0 = 比对完成（无论有无差异）；2 = 参数/源目录错误。
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(HERE);
const BUNDLED = join(REPO, 'server');
const ENTRY = 'origin_mcp_stdio.py';

// 我们自己的随包元数据，不参与上游 diff
const OWN_FILES = new Set(['VENDOR.md', 'NOTICE.md', '.plot-clone-server.json']);

function fail(message) {
  console.error(`vendor_sync: ${message}`);
  process.exit(2);
}

function parseArgs(argv) {
  const out = { from: '', json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--from') {
      out.from = argv[i + 1] ?? '';
      i += 1;
    } else if (arg === '--json') {
      out.json = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log('用法: node scripts/vendor_sync.mjs --from <上游目录|.tgz> [--json]');
      process.exit(0);
    } else {
      fail(`不认识的参数 ${arg}（只支持 --from / --json）`);
    }
  }
  if (!out.from) fail('缺少 --from <上游目录|.tgz>');
  return out;
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

const SKIP_DIRS = new Set(['__pycache__', '.git', 'node_modules', '.venv', 'venv', 'dist', 'build']);

function walk(root, base = root, acc = new Map()) {
  for (const name of readdirSync(root).sort()) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(root, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, base, acc);
    } else if (!name.endsWith('.pyc')) {
      const rel = relative(base, full).split(sep).join('/');
      acc.set(rel, { size: st.size, sha256: sha256(full) });
    }
  }
  return acc;
}

function resolveSource(from) {
  const full = from;
  if (!existsSync(full)) fail(`源路径不存在: ${full}`);
  if (statSync(full).isDirectory()) {
    if (existsSync(join(full, ENTRY))) return { root: full, cleanup: null };
    // 允许指到包含多层的仓库根：找唯一一个含入口的目录
    const found = [];
    const stack = [full];
    while (stack.length) {
      const dir = stack.pop();
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === '.git' || name === '__pycache__') continue;
        const next = join(dir, name);
        if (!statSync(next).isDirectory()) continue;
        if (existsSync(join(next, ENTRY))) found.push(next);
        else stack.push(next);
      }
    }
    if (found.length === 1) return { root: found[0], cleanup: null };
    fail(`在 ${full} 下${found.length === 0 ? '没找到' : '找到多个'}含 ${ENTRY} 的目录`);
  }
  const lower = basename(full).toLowerCase();
  if (lower.endsWith('.tgz') || lower.endsWith('.tar.gz')) {
    const tmp = mkdtempSync(join(tmpdir(), 'vendor-sync-'));
    const r = spawnSync('tar', ['-xzf', full, '-C', tmp], { stdio: 'inherit' });
    if (r.status !== 0) {
      rmSync(tmp, { recursive: true, force: true });
      fail('解包失败（需要系统 tar；Windows 10+ 自带 bsdtar）');
    }
    const stack = [tmp];
    while (stack.length) {
      const dir = stack.pop();
      if (existsSync(join(dir, ENTRY))) return { root: dir, cleanup: tmp };
      for (const name of readdirSync(dir)) {
        const next = join(dir, name);
        if (statSync(next).isDirectory()) stack.push(next);
      }
    }
    rmSync(tmp, { recursive: true, force: true });
    fail(`tgz 里找不到 ${ENTRY}`);
  }
  fail('--from 要指向目录或 .tgz/.tar.gz');
}

function isVendoredName(rel) {
  // 我们只随包顶层 Python 服务端（含 requirements.txt / LICENSE）；
  // 上游仓库里的 README、工作流、bin/、templates/ 等不进快照。
  if (rel.includes('/')) return false;
  const lower = rel.toLowerCase();
  return lower.endsWith('.py') || rel === 'requirements.txt' || rel === 'LICENSE';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(BUNDLED)) fail(`包内缺少 ${BUNDLED}`);
  const { root, cleanup } = resolveSource(args.from);
  try {
    const bundled = new Map([...walk(BUNDLED)].filter(([rel]) => isVendoredName(rel)));
    const upstream = new Map([...walk(root)].filter(([rel]) => isVendoredName(rel)));
    const added = [];    // 上游有、包内没有
    const removed = [];  // 包内有、上游没有（多为我们的元数据或删掉的文件）
    const changed = [];
    const same = [];

    for (const [rel, meta] of upstream) {
      if (OWN_FILES.has(rel)) continue;
      const mine = bundled.get(rel);
      if (!mine) added.push({ file: rel, upstream: meta });
      else if (mine.sha256 !== meta.sha256) changed.push({ file: rel, bundled: mine, upstream: meta });
      else same.push(rel);
    }
    for (const [rel, meta] of bundled) {
      if (OWN_FILES.has(rel)) continue;
      if (!upstream.has(rel)) removed.push({ file: rel, bundled: meta });
    }

    if (args.json) {
      console.log(JSON.stringify({
        bundled: BUNDLED,
        upstream: root,
        same: same.length,
        added,
        removed,
        changed,
      }, null, 2));
    } else {
      console.log(`包内: ${BUNDLED}`);
      console.log(`上游: ${root}`);
      console.log(`相同 ${same.length} / 新增 ${added.length} / 缺失 ${removed.length} / 变动 ${changed.length}`);
      for (const item of changed) {
        console.log(`\n~ ${item.file}`);
        console.log(`    包内 ${item.bundled.size}B ${item.bundled.sha256.slice(0, 12)}`);
        console.log(`    上游 ${item.upstream.size}B ${item.upstream.sha256.slice(0, 12)}`);
      }
      for (const item of added) console.log(`\n+ ${item.file}  (上游 ${item.upstream.size}B)`);
      for (const item of removed) console.log(`\n- ${item.file}  (包内 ${item.bundled.size}B)`);
      if (added.length + removed.length + changed.length === 0) {
        console.log('\n没有差异：包内快照与上游一致。');
      } else {
        console.log('\n只打印差异，未改任何文件。确认要跟进时人工落盘，并更新 server/VENDOR.md 的哈希表与 fork commit。');
      }
    }
  } finally {
    if (cleanup) rmSync(cleanup, { recursive: true, force: true });
  }
}

main();
