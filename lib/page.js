/**
 * dsh-plot-clone — 模板选择页（一个自包含 HTML 字符串，无 CDN、无构建）
 *
 * 为什么不做 client bundle：`dsh.client` + `window.__ModuleLoader__.load` 那套要
 * 手写浏览器模块协议，为了一个列表页不值当。路由直接吐 HTML，用 `sidebar_open`
 * 打开同一个 URL 即可；真要入口按钮再单独加。
 *
 * 页面上三条信息是**不许美化**的：status（implemented / spec-only）、
 * 「无实拍」占位（spec-only 没有 evidence PNG 时）、以及当前选中的 id。
 */

export const PAGE_TITLE = 'dsh-plot-clone 模板选择';

/**
 * @param {{count?:number, hasTemplates?:boolean}} opts
 * @returns {string} 完整 HTML
 */
export function renderPage({ count = 0, hasTemplates = true } = {}) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${PAGE_TITLE}</title>
<style>
:root{--bg:#fafaf8;--card:#fff;--ink:#1c1c1a;--muted:#6b6b66;--line:#e3e2dc;--accent:#2f6f4f;--warn:#8a5a12;--warnBg:#fdf3e0}
@media (prefers-color-scheme:dark){:root{--bg:#17181a;--card:#202124;--ink:#e8e6e1;--muted:#9a9a94;--line:#33343a;--accent:#5cbf8e;--warn:#e0b070;--warnBg:#3a2f1c}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,"Segoe UI","Microsoft YaHei",system-ui,sans-serif}
header{padding:18px 20px 10px;border-bottom:1px solid var(--line);background:var(--card);position:sticky;top:0;z-index:5}
h1{margin:0 0 2px;font-size:17px;font-weight:650}
.sub{color:var(--muted);font-size:12px}
.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}
input[type=search]{flex:1 1 220px;min-width:160px;padding:7px 10px;border:1px solid var(--line);border-radius:7px;background:var(--bg);color:var(--ink);font:inherit}
input[type=search]:focus{outline:2px solid var(--accent);outline-offset:-1px;border-color:transparent}
.chip{padding:6px 11px;border:1px solid var(--line);border-radius:999px;background:var(--bg);color:var(--muted);cursor:pointer;font:inherit;font-size:12px}
.chip[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#fff}
.count{color:var(--muted);font-size:12px;margin-left:auto}
.picked{margin:10px 20px 0;padding:9px 12px;border-radius:8px;border:1px solid var(--accent);background:var(--card);font-size:13px;display:flex;gap:10px;align-items:center}
.picked b{color:var(--accent)}
.picked button{margin-left:auto}
main{padding:14px 20px 40px;display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
.thumb{aspect-ratio:4/3;background:var(--bg);display:flex;align-items:center;justify-content:center;border-bottom:1px solid var(--line);overflow:hidden}
.thumb img{width:100%;height:100%;object-fit:contain}
.noThumb{padding:10px;text-align:center;color:var(--warn);font-size:12px;line-height:1.4}
.noThumb b{display:block;font-size:13px;margin-bottom:2px}
.body{padding:10px 11px 12px;display:flex;flex-direction:column;gap:6px;flex:1}
.name{font-weight:600;font-size:13px;line-height:1.35}
.meta{color:var(--muted);font-size:11px;font-family:ui-monospace,Consolas,monospace}
.tags{display:flex;gap:5px;flex-wrap:wrap}
.tag{font-size:10.5px;padding:2px 7px;border-radius:999px;border:1px solid var(--line);color:var(--muted)}
.tag.impl{color:var(--accent);border-color:var(--accent)}
.tag.spec{color:var(--warn);border-color:var(--warn);background:var(--warnBg)}
.actions{display:flex;gap:6px;margin-top:auto;padding-top:4px}
button{font:inherit;font-size:12px;padding:6px 10px;border-radius:7px;border:1px solid var(--line);background:var(--bg);color:var(--ink);cursor:pointer}
button:hover{border-color:var(--accent)}
button.use{flex:1;background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
button.use[disabled]{opacity:.55;cursor:not-allowed}
button.star{padding:6px 9px;font-size:14px;line-height:1}
button.star[aria-pressed=true]{color:#c8952a;border-color:#c8952a}
.empty{padding:40px 20px;text-align:center;color:var(--muted)}
.toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:8px 14px;border-radius:8px;font-size:12.5px;opacity:0;transition:opacity .18s;pointer-events:none}
.toast.on{opacity:.94}
</style>
</head>
<body>
<header>
  <h1>模板选择</h1>
  <div class="sub">${hasTemplates ? `系统模板 ${count} 个 · 点「用这个」后，复刻时优先按它做` : '模板库未找到（templates/index.json 缺失）'}</div>
  <div class="bar">
    <input type="search" id="q" placeholder="搜索名称 / id / 分类" autocomplete="off">
    <button class="chip" data-status="all" aria-pressed="true">全部</button>
    <button class="chip" data-status="implemented" aria-pressed="false">implemented</button>
    <button class="chip" data-status="spec-only" aria-pressed="false">spec-only</button>
    <span class="count" id="count"></span>
  </div>
</header>
<div id="picked"></div>
<main id="grid"></main>
<div class="toast" id="toast"></div>
<script>
const BASE = '/plugins/dsh-plot-clone';
let ALL = [], SEL = { selected: null, favorites: [] }, Q = '', STATUS = 'all';

function el(id) { return document.getElementById(id); }
function toast(msg) {
  const t = el('toast');
  t.textContent = msg; t.className = 'toast on';
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.className = 'toast'; }, 1600);
}

async function load() {
  const r = await fetch(BASE + '/templates', { cache: 'no-store' });
  const data = await r.json();
  if (!data.ok) { el('grid').innerHTML = '<div class="empty">模板库不可用：' + (data.message || data.code) + '</div>'; return; }
  ALL = data.templates; SEL = { selected: data.selected, favorites: data.favorites || [] };
  render();
}

async function post(patch) {
  const r = await fetch(BASE + '/selection', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch)
  });
  const data = await r.json();
  if (!data.ok) { toast('保存失败：' + ((data.errors || [data.message]).join('; '))); return false; }
  SEL = { selected: data.selected, favorites: data.favorites || [] };
  render();
  return true;
}

function visible() {
  const q = Q.trim().toLowerCase();
  return ALL.filter(t => {
    if (STATUS !== 'all' && t.status !== STATUS) return false;
    if (!q) return true;
    return (t.id + ' ' + t.name + ' ' + t.category).toLowerCase().includes(q);
  }).sort((a, b) => {
    const fa = SEL.favorites.includes(a.id) ? 0 : 1, fb = SEL.favorites.includes(b.id) ? 0 : 1;
    return fa - fb || a.id.localeCompare(b.id);
  });
}

function card(t) {
  const fav = SEL.favorites.includes(t.id);
  const isSel = SEL.selected === t.id;
  const d = document.createElement('article'); d.className = 'card';
  const thumb = document.createElement('div'); thumb.className = 'thumb';
  if (t.thumb) {
    const img = document.createElement('img');
    img.src = t.thumb; img.alt = t.name + ' 实拍缩略图'; img.loading = 'lazy';
    img.onerror = () => { thumb.innerHTML = ''; thumb.appendChild(noThumb(t)); };
    thumb.appendChild(img);
  } else {
    thumb.appendChild(noThumb(t));
  }
  const body = document.createElement('div'); body.className = 'body';
  const name = document.createElement('div'); name.className = 'name'; name.textContent = t.name;
  const meta = document.createElement('div'); meta.className = 'meta';
  meta.textContent = t.id + ' · ' + t.category;
  const tags = document.createElement('div'); tags.className = 'tags';
  const st = document.createElement('span'); st.className = 'tag ' + (t.status === 'implemented' ? 'impl' : 'spec');
  st.textContent = t.status; tags.appendChild(st);
  if (t.channels.length) { const c = document.createElement('span'); c.className = 'tag'; c.textContent = t.channels[0]; tags.appendChild(c); }
  const acts = document.createElement('div'); acts.className = 'actions';
  const use = document.createElement('button'); use.className = 'use';
  use.textContent = isSel ? '已选中' : '用这个';
  use.onclick = () => post({ selected: t.id }).then(ok => { if (ok && !t.thumb) toast('已选中，但此模板无实拍图'); });
  const star = document.createElement('button'); star.className = 'star';
  star.setAttribute('aria-pressed', String(fav)); star.title = fav ? '取消收藏' : '收藏';
  star.textContent = fav ? '★' : '☆';
  star.onclick = () => post({ favorites: fav ? SEL.favorites.filter(x => x !== t.id) : SEL.favorites.concat([t.id]) });
  acts.appendChild(use); acts.appendChild(star);
  body.appendChild(name); body.appendChild(meta); body.appendChild(tags); body.appendChild(acts);
  d.appendChild(thumb); d.appendChild(body);
  return d;
}

function noThumb(t) {
  const d = document.createElement('div'); d.className = 'noThumb';
  const b = document.createElement('b'); b.textContent = '无实拍';
  const s = document.createElement('span');
  s.textContent = t.status === 'spec-only' ? '仅规格，渲染未对接' : '该模板暂无导出证据图';
  d.appendChild(b); d.appendChild(s);
  return d;
}

function render() {
  const list = visible();
  const grid = el('grid'); grid.innerHTML = '';
  list.forEach(t => grid.appendChild(card(t)));
  if (!list.length) {
    const e = document.createElement('div'); e.className = 'empty'; e.textContent = '没有匹配的模板';
    grid.appendChild(e);
  }
  el('count').textContent = list.length + ' / ' + ALL.length;
  const picked = el('picked'); picked.innerHTML = '';
  if (SEL.selected) {
    const t = ALL.find(x => x.id === SEL.selected);
    picked.className = 'picked';
    const span = document.createElement('span');
    span.innerHTML = '当前选中：<b></b>  ';
    span.querySelector('b').textContent = t ? t.name + ' (' + t.id + ')' : SEL.selected;
    if (t && !t.thumb) span.appendChild(document.createTextNode('· 无实拍图'));
    const clear = document.createElement('button'); clear.textContent = '取消选中';
    clear.onclick = () => post({ selected: null });
    picked.appendChild(span); picked.appendChild(clear);
  } else { picked.className = ''; }
}

el('q').addEventListener('input', e => { Q = e.target.value; render(); });
document.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
  STATUS = b.dataset.status;
  document.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  render();
}));
load();
</script>
</body>
</html>`;
}
