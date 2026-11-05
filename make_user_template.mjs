#!/usr/bin/env node
/**
 * make_user_template.mjs — 把「Origin 里刚改好的那张图/工程」存成用户模板
 * ===================================================================
 *
 * 场景（SKILL 第 8 步收尾）：用户说「保存模板」。此时不要让他提供图片，
 * 而是从当前 Origin 里存：优先 `origin_template_save`（样式快照），再用
 * `origin_save_project` 把工程存成文件，最后用这个脚本把它收进运行时目录。
 *
 * 只做三件事：原样复制字节、写 meta.json（含 sha256）、重建 index.json。
 * **不解析 Origin 格式、不量测、不生成预览图。**
 *
 * 用法：
 *   node make_user_template.mjs --from <file> --name <名字> [--category <分类>] [--note <说明>] [--json]
 *
 * 退出码：0 成功 / 1 失败 / 2 用法错误
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';

import { stateDir } from './lib/templates.js';
import { ORIGIN_EXTS, createUserTemplate, usageHint, userTemplatesDir } from './lib/user_templates.js';

function usage(message) {
  if (message) console.error(`错误：${message}`);
  console.error(`用法：node make_user_template.mjs --from <file> [--name <名字>] [--category <分类>] [--note <说明>] [--json]
支持：${ORIGIN_EXTS.join(' ')}`);
  process.exit(2);
}

const argv = process.argv.slice(2);
const opt = { from: null, name: '', category: '', note: '', json: false };
for (let i = 0; i < argv.length; i += 1) {
  const key = argv[i];
  const next = argv[i + 1];
  if (key === '--from') {
    if (!next) usage('--from 缺少路径');
    opt.from = next;
    i += 1;
  } else if (key === '--name') {
    if (!next) usage('--name 缺少值');
    opt.name = next;
    i += 1;
  } else if (key === '--category') {
    if (!next) usage('--category 缺少值');
    opt.category = next;
    i += 1;
  } else if (key === '--note') {
    if (!next) usage('--note 缺少值');
    opt.note = next;
    i += 1;
  } else if (key === '--json') {
    opt.json = true;
  } else if (key === '--help' || key === '-h') {
    usage();
  } else {
    usage(`多余的参数：${key}`);
  }
}

if (!opt.from) usage('必须给 --from（Origin 存下来的 .otp/.otpu/.opj/.opju/.oth）');
if (!existsSync(opt.from)) usage(`文件不存在：${opt.from}`);
let st;
try {
  st = statSync(opt.from);
} catch (error) {
  usage(`读不到文件信息：${error.message}`);
}
if (!st.isFile()) usage(`不是文件：${opt.from}`);

let bytes;
try {
  bytes = readFileSync(opt.from);
} catch (error) {
  usage(`读文件失败：${error.message}`);
}

const root = userTemplatesDir(stateDir(process.env));
const created = createUserTemplate({
  root,
  bytes,
  filename: basename(opt.from),
  name: opt.name || basename(opt.from).replace(/\.[^.]+$/, ''),
  category: opt.category || 'user/custom',
  note: opt.note,
  role: 'origin',
});

if (!created.ok) {
  console.error(`失败（${created.code}）：${created.message}`);
  process.exit(1);
}

const out = {
  ok: true,
  id: created.id,
  dir: created.dir,
  origin_file: created.originFile,
  sha256: created.meta.sha256,
  size: created.meta.size,
  usage: usageHint(created.meta.ext),
  index: `${root}/index.json`,
};

if (opt.json) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(`已存为用户模板：${created.id}`);
  console.log(`  目录：${created.dir}`);
  console.log(`  原件：${created.originFile}（${created.meta.size} 字节，sha256 ${created.meta.sha256.slice(0, 16)}…）`);
  console.log(`  清单：${out.index}`);
  console.log('  说明：快照/工程只含样式与页面，不含数据；套用时由 agent 在 Origin 里读图层再 apply。');
}
process.exit(0);
