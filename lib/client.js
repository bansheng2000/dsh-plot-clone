// dsh-plot-clone — 右侧栏「模板」标签（免构建，直接注入宿主 ModuleLoader）
//
// 挂载点：sidebar.right.pane.tab + sidebarRightTabs 的 tab type 注册。
// 数据全部走插件自己的路由（lib/templates.js），页面只做展示与写 selection.json。
//
// 老版本宿主没有 sidebarRightTabs / slots 时**不许炸**：拿不到就 warn 一行返回，
// 侧栏其余标签照常工作（见 registerTab 的 try/catch 与 typeof 判断）。
window.__ModuleLoader__.load({
  id: "dsh-plot-clone",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;

    const React = require("react");
    const { useEffect, useMemo, useRef, useState } = React;
    // 用 createElement，不用 react/jsx-runtime 的 jsx：后者的第三个参数是 **key**，
    // 而本文件所有调用都是 jsx(type, props, [子元素]) —— children 会被整个丢掉，
    // 面板只剩空壳（innerHTML 长度 0、卡片 0 张）。createElement 的
    // (type, props, ...children) 与这个调用形态完全兼容。
    const { createElement: jsx } = React;

    const BASE = "/plot-clone";
    const TAB_ID = "dsh-plot-clone/templates";
    // 宿主按 tab 的 kind 去 slot 里查内容体：id / kind / key 必须是同一个字符串，
    // 否则标签按钮出现、内容却查不到（表现为空白面板）。
    const TAB_KIND = TAB_ID;
    /**
     * kind 兼容别名（给旧标签自愈用）。
     * 早期版本把 tab 的 id 与 kind 注册成两个不同值（id=`dsh-plot-clone/templates`、
     * kind=`plot-clone-templates`），而侧栏会把标签实例连同它的 kind 一起持久化。
     * 之后我们把 id/kind/key 统一成一个字符串，旧实例里存的仍是旧 kind：宿主按
     * 实例的 kind 去已注册类型里找定义，找不到就渲染 `tab.unavailable`（「这类内容
     * 还没有可用的查看方式」），entryKey 也跟着变成旧 kind 查不到槽位。
     * 所以额外注册一个同 kind 的别名类型 + 同一套槽位，让用户侧栏里残留的旧标签
     * 直接自愈。**不给 guide**：它不该在「+」菜单里多出一个入口。
     * 旧标签清干净后（约一个版本）可以连同这个别名一起删。
     */
    const COMPAT_ID = "dsh-plot-clone/templates-compat";
    const COMPAT_KIND = "plot-clone-templates";
    // 只改显示名，id / kind / 槽位 key 一律不动：宿主按 kind 查内容体，
    // 改标识符会让用户侧栏里已存在的标签再次变成「这类内容还没有可用的查看方式」。
    const TAB_TITLE = "Origin 模板";
    const STYLE_ID = "dsh-plot-clone-tab-style";
    const LOG = "[dsh-plot-clone]";
    const VERSION = "0.1.0";

    /**
     * 诊断上报：回答「客户端 bundle 到底有没有执行 apply」。
     * 失败静默、keepalive 保活——诊断绝不能影响面板本身。
     */
    function postDiag(payload) {
      try {
        const origin = typeof location !== "undefined" && location && location.origin ? location.origin : "";
        const body = JSON.stringify({ ...payload, origin });
        const p = fetch(`${BASE}/diag`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          keepalive: true
        });
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch {
        /* 诊断失败不往上抛 */
      }
    }

    let windowErrorBound = false;
    /** window.onerror 只挂一次：重复 apply（HMR / 重挂载）不许叠加监听。 */
    function bindWindowError() {
      if (windowErrorBound) return;
      if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
      windowErrorBound = true;
      window.addEventListener("error", (event) => {
        postDiag({
          phase: "window-error",
          message: String(event?.message ?? "").slice(0, 300),
          stack: String(event?.error?.stack ?? "").slice(0, 500)
        });
      });
    }


    /** fetch → {ok, data, message}；HTTP 非 2xx 也折成 ok:false 带后端 message。 */
    /**
     * 宿主页面 origin 可能是 `dsh-app://app`，相对路径未必落到插件路由上。
     * 先试相对路径；status 非 200 或抛异常时回落 `http://127.0.0.1:<port>` 同路径，
     * 成功就记住这个 base。每一次尝试都记 diag（phase:"fetch"）。
     */
    let fallbackBase = null;

    function localOrigin() {
      try {
        const port = typeof location !== "undefined" && location ? String(location.port || "") : "";
        if (port !== "") return `http://127.0.0.1:${port}`;
        const uri = typeof document !== "undefined" && document ? String(document.baseURI || "") : "";
        if (uri === "") return null;
        const u = new URL(uri);
        return `${u.protocol}//${u.host}`;
      } catch {
        return null;
      }
    }

    /** 首次 = 相对路径（空 base）+ 本地回落；记住回落之后只用它。 */
    function baseCandidates() {
      if (fallbackBase !== null) return [fallbackBase];
      const list = [""];
      const local = localOrigin();
      if (local !== null) list.push(local);
      return list;
    }

    async function fetchRoute(path, init) {
      const opts = {
        method: init?.method ?? "GET",
        headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
        body: init?.body,
        cache: "no-store"
      };
      let lastError = null;
      for (const base of baseCandidates()) {
        const url = base + BASE + path;
        let res;
        try {
          res = await fetch(url, opts);
        } catch (error) {
          lastError = error;
          postDiag({ phase: "fetch", url, status: 0, ok: false, error: String(error?.message ?? error).slice(0, 200) });
          continue;
        }
        postDiag({ phase: "fetch", url, status: res.status, ok: Boolean(res.ok) });
        if (res.ok) {
          if (base !== "" && fallbackBase === null) {
            fallbackBase = base;
            postDiag({ phase: "fetch-base-fallback", base });
          }
          return res;
        }
        lastError = new Error(`HTTP ${res.status}`);
      }
      throw lastError ?? new Error("连不上插件路由");
    }

    async function call(path, init) {
      let res;
      try {
        res = await fetchRoute(path, init);
      } catch (error) {
        return { ok: false, message: `连不上插件路由：${error?.message ?? String(error)}` };
      }
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!res.ok || data === null || data.ok === false) {
        const message = data?.message ?? data?.error?.message ?? `HTTP ${res.status}`;
        return { ok: false, message };
      }
      return { ok: true, data };
    }

    const listTemplates = () => call("/templates");
    const readSelection = () => call("/selection");
    const writeSelection = (body) => call("/selection", { method: "POST", body: JSON.stringify(body) });
    const thumbUrl = (id) => `${BASE}/thumb/${encodeURIComponent(id)}`;
    const deleteTemplate = (id) => call(`/user-templates/${encodeURIComponent(id)}`, { method: "DELETE" });
    const renameTemplate = (id, patch) =>
      call(`/user-templates/${encodeURIComponent(id)}/rename`, { method: "POST", body: JSON.stringify(patch) });

    /**
     * 上传 Origin 文件：body 是文件原始字节，元数据走 query。
     * 和 call() 分开，因为这里不能带 `content-type: application/json`。
     */
    const uploadTemplate = async (file) => {
      const qs = new URLSearchParams({
        filename: String(file?.name ?? ""),
        name: String(file?.name ?? "").replace(/\.[^.]+$/, "")
      });
      let res;
      try {
        res = await fetch(`${BASE}/user-templates?${qs.toString()}`, {
          method: "POST",
          body: file,
          cache: "no-store"
        });
      } catch (error) {
        return { ok: false, message: `连不上插件路由：${error?.message ?? String(error)}` };
      }
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!res.ok || data === null || data.ok === false) {
        return { ok: false, message: data?.message ?? `HTTP ${res.status}` };
      }
      return { ok: true, data };
    };

    /** 文件大小的可读文本（上传回执里显示）。 */
    const fmtSize = (n) => {
      const bytes = Number(n ?? 0);
      if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    };

    /** 只认这五种扩展名（与 lib/user_templates.js 的 ORIGIN_EXTS 同口径）。 */
    const ORIGIN_ACCEPT = ".otp,.otpu,.opj,.opju,.oth";

    /** 模板来源：只有 "user" 才算用户自建，缺省一律当系统预设（后端字段见 lib/templates.js:110）。 */
    const kindOf = (t) => (t?.kind === "user" ? "user" : "system");

    /** 分类取 category 的首段（"spectroscopy/xps" → "spectroscopy"）；未知分类原样用英文段。 */
    const catOf = (t) => String(t?.category ?? "").split("/")[0].trim().toLowerCase();
    const CAT_LABEL = {
      general: "通用",
      spectroscopy: "光谱",
      electrochemistry: "电化学",
      "medical-ai": "医学",
      "thermal-analysis": "热分析",
      research: "研究信号"
    };
    const catLabel = (key) => CAT_LABEL[key] ?? key;

    const CSS = `
.pc-wrap{display:flex;flex-direction:column;gap:8px;height:100%;min-height:0;padding:10px;box-sizing:border-box;font-size:12px;color:var(--dsw-alias-text-primary,inherit)}
.pc-bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.pc-search{flex:1 1 130px;min-width:0;padding:5px 8px;border-radius:6px;border:1px solid var(--dsw-alias-border-color,rgba(128,128,128,.35));background:transparent;color:inherit;font-size:12px}
.pc-chip{padding:4px 9px;border-radius:999px;border:1px solid var(--dsw-alias-border-color,rgba(128,128,128,.35));background:transparent;color:inherit;font-size:11px;cursor:pointer;white-space:nowrap}
.pc-chip.on{background:var(--dsw-alias-state-business-primary,#3b6ef6);border-color:transparent;color:#fff}
.pc-head{font-size:12px;font-weight:600;color:var(--dsw-alias-text-2,rgba(0,0,0,.65));padding:6px 2px 2px}
.pc-sub{padding-left:8px;border-left:2px solid var(--dsw-alias-border-color,rgba(128,128,128,.25));margin-left:2px}
.pc-cur{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:6px 8px;border-radius:6px;background:rgba(128,128,128,.09)}
.pc-cur b{font-weight:600}
.pc-btn{padding:4px 9px;border-radius:6px;border:1px solid var(--dsw-alias-border-color,rgba(128,128,128,.35));background:transparent;color:inherit;font-size:11px;cursor:pointer}
.pc-btn.pri{background:var(--dsw-alias-state-business-primary,#3b6ef6);border-color:transparent;color:#fff}
.pc-btn:disabled{opacity:.5;cursor:default}
.pc-err{padding:6px 8px;border-radius:6px;background:rgba(220,60,60,.12);color:#d64545;line-height:1.45}
.pc-list{flex:1 1 auto;min-height:0;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(126px,1fr));gap:8px;align-content:start}
.pc-card{position:relative;border:1px solid var(--dsw-alias-border-color,rgba(128,128,128,.3));border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-card,transparent);display:flex;flex-direction:column}
.pc-card.sel{outline:2px solid var(--dsw-alias-state-business-primary,#3b6ef6);outline-offset:-2px}
.pc-thumb{aspect-ratio:4/3;background:rgba(128,128,128,.12);display:flex;align-items:center;justify-content:center;overflow:hidden}
.pc-thumb img{width:100%;height:100%;object-fit:contain;display:block}
.pc-none{font-size:10px;line-height:1.4;text-align:center;padding:6px;opacity:.72}
.pc-body{padding:5px 6px 6px;display:flex;flex-direction:column;gap:4px}
.pc-name{font-weight:600;line-height:1.3;word-break:break-word}
.pc-meta{font-size:10px;opacity:.66;line-height:1.3;word-break:break-all}
.pc-tag{align-self:flex-start;font-size:10px;padding:1px 5px;border-radius:4px}
.pc-tag.impl{background:rgba(46,160,67,.16);color:#2ea043}
.pc-tag.spec{background:rgba(200,140,20,.16);color:#b57b10}
.pc-tag.kind{background:rgba(128,128,128,.16);opacity:.8}
.pc-star{position:absolute;top:3px;right:3px;border:0;background:rgba(0,0,0,.35);color:#fff;border-radius:6px;font-size:12px;line-height:1;padding:3px 5px;cursor:pointer}
.pc-star.on{color:#f5c518}
.pc-card .pc-btn{align-self:flex-start}
.pc-row{display:flex;gap:4px;flex-wrap:wrap}
.pc-usage{font-size:10px;line-height:1.35;opacity:.72}
.pc-note{padding:6px 8px;border-radius:6px;background:rgba(46,160,67,.12);color:#2ea043;line-height:1.4;word-break:break-all}
.pc-empty{padding:14px;text-align:center;opacity:.7}
.pc-foot{font-size:10px;opacity:.6}
`;

    function ensureStyle() {
      if (typeof document === "undefined") return;
      if (document.getElementById(STYLE_ID) !== null) return;
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    let panelEntered = false;

    /**
     * 渲染兜底：面板内部任何异常都要在页面上留下痕迹（红字 stack），
     * 不许出现「白屏但没有线索」；同时上报 phase:"panel-error"。
     */
    function TemplatesPanel() {
      if (panelEntered === false) {
        panelEntered = true;
        postDiag({ phase: "panel-enter" });
      }
      try {
        return TemplatesPanelInner();
      } catch (error) {
        postDiag({
          phase: "panel-error",
          message: String(error?.message ?? error).slice(0, 300),
          stack: String(error?.stack ?? "").slice(0, 500)
        });
        return jsx("pre", { style: { color: "#c00", whiteSpace: "pre-wrap" } }, String(error?.stack ?? error));
      }
    }

    /**
     * 布局取证：DOM 有了但屏幕空白时，唯一能区分「被压成 0 高」和「被裁掉」的就是几何。
     * 必须等一帧再量（React 提交后才算布局），拿不到 DOM 就如实记 null，不编数。
     */
    const rectOf = (el) => {
      if (el === null || el === undefined || typeof el.getBoundingClientRect !== "function") return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x ?? 0),
        y: Math.round(r.y ?? 0),
        width: Math.round(r.width ?? 0),
        height: Math.round(r.height ?? 0)
      };
    };

    const computedOf = (el) => {
      if (el === null || el === undefined) return null;
      try {
        const gcs = typeof window !== "undefined" && typeof window.getComputedStyle === "function"
          ? window.getComputedStyle(el)
          : null;
        if (gcs === null) return null;
        return { display: gcs.display ?? "", height: gcs.height ?? "", overflow: gcs.overflow ?? "" };
      } catch {
        return null;
      }
    };

    const nameOf = (el) => {
      if (el === null || el === undefined) return null;
      const tag = String(el.tagName ?? "").toLowerCase();
      const cls = typeof el.className === "string" ? el.className.trim() : "";
      return cls === "" ? tag : `${tag}.${cls.split(/\s+/).join(".")}`;
    };

    const styleOf = (el) => {
      if (el === null || el === undefined) return null;
      try {
        const gcs = typeof window !== "undefined" && typeof window.getComputedStyle === "function"
          ? window.getComputedStyle(el)
          : null;
        if (gcs === null) return null;
        return {
          display: gcs.display ?? "",
          visibility: gcs.visibility ?? "",
          opacity: gcs.opacity ?? "",
          overflow: gcs.overflow ?? "",
          clipPath: gcs.clipPath ?? gcs.webkitClipPath ?? "",
          height: gcs.height ?? "",
          position: gcs.position ?? "",
          zIndex: gcs.zIndex ?? ""
        };
      } catch {
        return null;
      }
    };

    /**
     * 一次取全：wrap 几何、父级几何与计算样式、四层祖先链的可见性、卡片计数、
     * HTML 片段（判「有没有渲染出来」）、中心点命中元素（判「被谁盖住」）、
     * 以及是否在 shadow root 里（宿主可能用 shadow DOM，querySelector 也就量不到）。
     */
    function collectLayout(selector) {
      const doc = typeof document === "undefined" ? null : document;
      if (doc === null || typeof doc.querySelector !== "function") return { wrap: null, note: "no-document" };
      let wrap = null;
      try {
        wrap = doc.querySelector(selector);
      } catch {
        wrap = null;
      }
      const countIn = (sel) => {
        if (wrap === null || wrap === undefined || typeof wrap.querySelectorAll !== "function") return null;
        try {
          return wrap.querySelectorAll(sel).length;
        } catch {
          return null;
        }
      };
      let list = null;
      try {
        list = wrap === null || wrap === undefined || typeof wrap.querySelector !== "function" ? null : wrap.querySelector(".pc-list");
      } catch {
        list = null;
      }
      let listChildren = null;
      try {
        listChildren = list === null || list === undefined ? null : list.children.length;
      } catch {
        listChildren = null;
      }
      const ancestors = [];
      let node = wrap === null || wrap === undefined ? null : wrap.parentElement ?? null;
      for (let i = 0; i < 4 && node !== null && node !== undefined; i += 1) {
        ancestors.push({ name: nameOf(node), rect: rectOf(node), style: styleOf(node) });
        node = node.parentElement ?? null;
      }
      let card = null;
      try {
        card = wrap === null || wrap === undefined || typeof wrap.querySelector !== "function"
          ? (typeof doc.querySelector === "function" ? doc.querySelector("[data-template-id]") : null)
          : wrap.querySelector("[data-template-id]");
      } catch {
        card = null;
      }
      const wrapRect = rectOf(wrap);
      let atPoint = null;
      if (wrapRect !== null && typeof doc.elementFromPoint === "function" && wrapRect.width > 0 && wrapRect.height > 0) {
        try {
          atPoint = nameOf(doc.elementFromPoint(wrapRect.x + Math.round(wrapRect.width / 2), wrapRect.y + Math.round(wrapRect.height / 2)));
        } catch {
          atPoint = null;
        }
      }
      let rootKind = null;
      try {
        rootKind = wrap !== null && wrap !== undefined && typeof wrap.getRootNode === "function"
          ? (wrap.getRootNode() === doc ? "document" : "shadow/other")
          : null;
      } catch {
        rootKind = null;
      }
      let html = "";
      try {
        html = wrap !== null && wrap !== undefined && typeof wrap.innerHTML === "string" ? wrap.innerHTML : "";
      } catch {
        html = "";
      }
      return {
        wrap: wrapRect,
        parent: ancestors.length === 0 ? null : ancestors[0].rect,
        parentStyle: ancestors.length === 0 ? null : ancestors[0].style,
        firstCard: rectOf(card),
        cards: { byAttr: countIn("[data-template-id]"), byClass: countIn(".pc-card"), listChildren, listRect: rectOf(list) },
        innerLen: html.length,
        innerHead: html.replace(/\s+/g, " ").slice(0, 300),
        ancestors,
        atPoint,
        rootKind,
        styleApplied: doc !== null && typeof doc.getElementById === "function" && doc.getElementById(STYLE_ID) !== null
      };
    }

    /**
     * 布局取证：DOM 有了但屏幕空白时，唯一能区分「被压成 0 高」「被裁掉」「根本没渲染」
     * 的就是几何 + HTML。必须等一帧再量（rAF 可能在 React 提交前），并在 600 ms 后再量一次
     * —— firstCard: null 往往就是这种竞态，两次都报才有对比。
     */
    function measureLayout(phase, selector) {
      const post = (pass) => {
        try {
          postDiag({ phase, pass, ...collectLayout(selector) });
        } catch (error) {
          postDiag({ phase, pass, error: String(error && error.message ? error.message : error).slice(0, 200) });
        }
      };
      const later = () => {
        if (typeof setTimeout === "function") setTimeout(() => post("late"), 600);
      };
      const run = () => {
        post("raf");
        later();
      };
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
      else if (typeof setTimeout === "function") setTimeout(run, 0);
      else run();
    }

    /**
     * 缩略图悬停放大。
     * 放大层挂在 document.body 上、用原生节点创建：侧栏 seat 的祖先 div.acoR2W_tabBody
     * 是 overflow:hidden（实测 1151×1474），transform: scale 必被裁，子树里的 fixed
     * 也可能被祖先的 overflow 裁掉。挂 body 最稳，也不引入 react-dom。
     */
    const ZOOM_Z = 2147483000;
    const ZOOM_EDGE = 8;
    const ZOOM_GAP = 16;
    const ZOOM_DELAY = 150;

    const clampNum = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

    /** 纯函数：把 w×h 的放大层放进 vw×vh 视口，优先光标右侧 +16，放不下翻左，上下夹 8px。 */
    function placePreview({ x, y, w, h, vw, vh }) {
      let left = x + ZOOM_GAP;
      if (left + w > vw - ZOOM_EDGE) left = x - ZOOM_GAP - w;
      left = clampNum(left, ZOOM_EDGE, Math.max(ZOOM_EDGE, vw - ZOOM_EDGE - w));
      const top = clampNum(y - h / 2, ZOOM_EDGE, Math.max(ZOOM_EDGE, vh - ZOOM_EDGE - h));
      return { left: Math.round(left), top: Math.round(top) };
    }

    /** 等比缩到视口内：宽 ≤ min(640, 60vw)，高 ≤ 80vh。 */
    function fitPreviewSize(nw, nh, vw, vh) {
      const maxW = Math.max(120, Math.min(640, Math.floor(vw * 0.6)));
      const maxH = Math.max(120, Math.floor(vh * 0.8));
      const ratio = nw > 0 && nh > 0 ? nh / nw : 3 / 4;
      let w = maxW;
      let h = Math.round(w * ratio);
      if (h > maxH) {
        h = maxH;
        w = Math.round(h / ratio);
      }
      return { w, h };
    }

    const viewport = () => ({
      vw: typeof window !== "undefined" && Number(window.innerWidth) > 0 ? Number(window.innerWidth) : 1200,
      vh: typeof window !== "undefined" && Number(window.innerHeight) > 0 ? Number(window.innerHeight) : 800
    });

    const canZoom = () =>
      typeof document !== "undefined" &&
      document !== null &&
      typeof document.createElement === "function" &&
      document.body !== undefined &&
      document.body !== null;

    const removeNode = (node) => {
      try {
        if (node === null || node === undefined) return;
        if (node.parentNode !== null && node.parentNode !== undefined && typeof node.parentNode.removeChild === "function") {
          node.parentNode.removeChild(node);
        } else if (typeof node.remove === "function") {
          node.remove();
        }
      } catch {
        /* 收层失败不影响面板 */
      }
    };

    let zoomHover = null; // { layer, img, url, size }
    let zoomPin = null; // { layer, img, url }
    let zoomTimer = 0;
    let zoomAt = null; // 最新光标位置 {x, y}

    /** 惰性建层并挂 body（移除即删节点，不留空层）。kind: hover | pin */
    function makeZoomLayer(kind) {
      if (!canZoom()) return null;
      const layer = document.createElement("div");
      layer.setAttribute("data-pc-zoom", kind);
      const img = document.createElement("img");
      img.setAttribute("alt", "");
      img.setAttribute("draggable", "false");
      if (kind === "hover") {
        layer.style.cssText = `position:fixed;left:0;top:0;z-index:${ZOOM_Z};pointer-events:none;border-radius:10px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.45);background:#111`;
        img.style.cssText = "display:block;width:100%;height:auto";
      } else {
        layer.style.cssText = `position:fixed;left:0;right:0;top:0;bottom:0;z-index:${ZOOM_Z};background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;cursor:zoom-out`;
        img.style.cssText = "display:block;max-width:90vw;max-height:90vh;box-shadow:0 12px 40px rgba(0,0,0,.5);background:#111";
      }
      layer.appendChild(img);
      document.body.appendChild(layer);
      return { layer, img };
    }

    function closeHover() {
      if (zoomTimer !== 0 && typeof clearTimeout === "function") {
        clearTimeout(zoomTimer);
        zoomTimer = 0;
      }
      const hov = zoomHover;
      zoomHover = null;
      if (hov !== null) removeNode(hov.layer);
    }

    function closePin() {
      const pin = zoomPin;
      zoomPin = null;
      if (pin !== null) removeNode(pin.layer);
    }

    function closeZoom() {
      closeHover();
      closePin();
    }

    function positionHover() {
      if (zoomHover === null || zoomAt === null) return;
      const { vw, vh } = viewport();
      const p = placePreview({ x: zoomAt.x, y: zoomAt.y, w: zoomHover.size.w, h: zoomHover.size.h, vw, vh });
      zoomHover.layer.style.left = `${p.left}px`;
      zoomHover.layer.style.top = `${p.top}px`;
      zoomHover.layer.style.width = `${zoomHover.size.w}px`;
      zoomHover.layer.style.height = `${zoomHover.size.h}px`;
    }

    function showHover(url, at) {
      zoomAt = at;
      if (zoomPin !== null) return; // 钉住时不叠悬停层
      if (zoomHover !== null && zoomHover.url === url) {
        positionHover();
        return;
      }
      closeHover();
      const made = makeZoomLayer("hover");
      if (made === null) return;
      const { vw, vh } = viewport();
      const hover = { layer: made.layer, img: made.img, url, size: fitPreviewSize(4, 3, vw, vh) };
      zoomHover = hover;
      made.img.onload = () => {
        if (zoomHover !== hover) return;
        const { vw: w2, vh: h2 } = viewport();
        hover.size = fitPreviewSize(Number(made.img.naturalWidth) || 4, Number(made.img.naturalHeight) || 3, w2, h2);
        positionHover();
      };
      made.img.src = url;
      positionHover();
    }

    function scheduleHover(url, at) {
      zoomAt = at;
      closeHover();
      if (typeof setTimeout !== "function") {
        showHover(url, at);
        return;
      }
      zoomTimer = setTimeout(() => {
        zoomTimer = 0;
        showHover(url, zoomAt === null ? at : zoomAt);
      }, ZOOM_DELAY);
    }

    function pinZoom(url) {
      closeHover();
      if (zoomPin !== null && zoomPin.url === url) {
        closePin();
        return;
      }
      closePin();
      const made = makeZoomLayer("pin");
      if (made === null) return;
      made.img.src = url;
      zoomPin = { layer: made.layer, img: made.img, url };
      made.layer.onclick = () => closePin();
    }

    const eventPoint = (ev) => ({
      x: Number(ev && ev.clientX) || 0,
      y: Number(ev && ev.clientY) || 0
    });

    /** 给有实拍缩略图的卡片 <img> 用；没图的卡片不绑定，避免破图与空放大层。 */
    function thumbZoomProps(id) {
      const url = thumbUrl(id);
      return {
        style: { cursor: "zoom-in" },
        onMouseEnter: (ev) => scheduleHover(url, eventPoint(ev)),
        onMouseMove: (ev) => {
          zoomAt = eventPoint(ev);
          positionHover();
        },
        onMouseLeave: () => closeHover(),
        onFocus: (ev) => {
          const r = rectOf(ev && ev.currentTarget);
          showHover(url, { x: r === null ? ZOOM_EDGE : r.x + r.width, y: r === null ? 40 : r.y + r.height / 2 });
        },
        onBlur: () => closeHover(),
        onClick: (ev) => {
          if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
          pinZoom(url);
        }
      };
    }

    function TemplatesPanelInner() {
      const [state, setState] = useState({
        loading: true,
        error: null,
        notice: null,
        templates: [],
        selected: null,
        favorites: [],
        query: "",
        filter: "all",
        cat: "",
        busyId: null,
        uploading: false
      });
      const alive = useRef(true);
      const fileRef = useRef(null);

      useEffect(() => {
        ensureStyle();
        alive.current = true;
        (async () => {
          const list = await listTemplates();
          const sel = await readSelection();
          if (!alive.current) return;
          if (!list.ok) {
            postDiag({ phase: "panel-ready", count: 0, error: String(list.message ?? "").slice(0, 200) });
            setState((s) => ({ ...s, loading: false, error: list.message }));
            measureLayout("panel-rect", "[data-pc-wrap]");
            return;
          }
          const templates = Array.isArray(list.data.templates) ? list.data.templates : [];
          postDiag({
            phase: "panel-ready",
            count: templates.length,
            error: sel.ok ? null : String(sel.message ?? "").slice(0, 200)
          });
          setState((s) => ({
            ...s,
            loading: false,
            error: sel.ok ? null : sel.message,
            templates,
            selected: sel.ok ? sel.data.selected ?? null : null,
            favorites: sel.ok && Array.isArray(sel.data.favorites) ? sel.data.favorites : []
          }));
          measureLayout("panel-rect", "[data-pc-wrap]");
        })();
        return () => {
          alive.current = false;
        };
      }, []);

      // 放大层挂在 body 上：面板滚动 / 窗口缩放 / Esc / 卸载都必须收掉，否则会留在原地。
      useEffect(() => {
        if (typeof window === "undefined" || typeof window.addEventListener !== "function") return undefined;
        const onScroll = () => closeHover();
        const onResize = () => closeZoom();
        const onKey = (ev) => {
          if (ev && ev.key === "Escape") closeZoom();
        };
        window.addEventListener("scroll", onScroll, true);
        window.addEventListener("resize", onResize);
        window.addEventListener("keydown", onKey);
        return () => {
          if (typeof window.removeEventListener === "function") {
            window.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("resize", onResize);
            window.removeEventListener("keydown", onKey);
          }
          closeZoom();
        };
      }, []);

      const selectedName = useMemo(() => {
        if (state.selected === null) return null;
        const hit = state.templates.find((t) => t.id === state.selected);
        return hit === undefined ? state.selected : hit.name;
      }, [state.selected, state.templates]);

      // 筛选按「来源」（全部 / 预设 / 用户 / 收藏），status 只做卡片徽标、不再占筛选位。
      const systemCount = useMemo(
        () => state.templates.filter((t) => kindOf(t) === "system").length,
        [state.templates]
      );
      const userCount = useMemo(
        () => state.templates.filter((t) => kindOf(t) === "user").length,
        [state.templates]
      );
      const favCount = useMemo(
        () => state.templates.filter((t) => state.favorites.includes(t.id)).length,
        [state.templates, state.favorites]
      );

      // 分类层只挂在「预设」下面：数量只数系统模板，且不受搜索/收藏影响（否则合计对不上）。
      const categoryCounts = useMemo(() => {
        const map = new Map();
        for (const t of state.templates) {
          if (kindOf(t) !== "system") continue;
          const key = catOf(t);
          if (key === "") continue;
          map.set(key, (map.get(key) ?? 0) + 1);
        }
        return [...map.entries()]
          .map(([key, count]) => ({ key, count, label: catLabel(key) }))
          .sort((a, b) => (a.key === "general" ? -1 : b.key === "general" ? 1 : b.count - a.count));
      }, [state.templates]);
      const catCount = useMemo(() => categoryCounts.reduce((n, c) => n + c.count, 0), [categoryCounts]);

      const shown = useMemo(() => {
        const q = state.query.trim().toLowerCase();
        return state.templates.filter((t) => {
          const kind = kindOf(t);
          if (state.filter === "system" && kind !== "system") return false;
          if (state.filter === "user" && kind !== "user") return false;
          if (state.filter === "favorites" && !state.favorites.includes(t.id)) return false;
          // 分类只在「预设」下生效；切到别的档位时 cat 会被清空，不会残留成隐藏过滤。
          if (
            state.filter === "system" &&
            state.cat !== "" &&
            categoryCounts.some((c) => c.key === state.cat) &&
            catOf(t) !== state.cat
          ) {
            return false;
          }
          if (q === "") return true;
          return (
            String(t.id).toLowerCase().includes(q) ||
            String(t.name).toLowerCase().includes(q) ||
            String(t.category ?? "").toLowerCase().includes(q)
          );
        });
      }, [state.templates, state.query, state.filter, state.favorites, state.cat, categoryCounts]);

      /** 一次 POST 同时带 selected 与 favorites，避免互相覆盖。 */
      const commit = async (next, busyId) => {
        setState((s) => ({ ...s, busyId: busyId ?? null, error: null }));
        const res = await writeSelection({
          selected: next.selected === undefined ? state.selected : next.selected,
          favorites: next.favorites === undefined ? state.favorites : next.favorites
        });
        if (!alive.current) return;
        if (!res.ok) {
          setState((s) => ({ ...s, busyId: null, error: `写入失败：${res.message}` }));
          return;
        }
        setState((s) => ({
          ...s,
          busyId: null,
          selected: res.data.selected ?? null,
          favorites: Array.isArray(res.data.favorites) ? res.data.favorites : s.favorites
        }));
      };

      const useThis = (id) => {
        if (state.busyId !== null) return;
        void commit({ selected: id }, id);
      };

      const clearSelected = () => {
        if (state.busyId !== null) return;
        void commit({ selected: null }, null);
      };

      const toggleFavorite = (id) => {
        if (state.busyId !== null) return;
        const next = state.favorites.includes(id)
          ? state.favorites.filter((f) => f !== id)
          : [...state.favorites, id];
        void commit({ favorites: next }, id);
      };

      /** 上传 Origin 文件 → 建用户模板。回执只报文件名/大小/类型/时间，不画预览图。 */
      const onPickFile = async (file) => {
        if (file === undefined || file === null) return;
        if (Number(file.size ?? 0) > 64 * 1024 * 1024) {
          setState((s) => ({ ...s, error: `文件 ${file.size} 字节，超过上限 64 MB`, notice: null }));
          return;
        }
        setState((s) => ({ ...s, uploading: true, busyId: "upload", error: null, notice: null }));
        const up = await uploadTemplate(file);
        if (!alive.current) return;
        if (!up.ok) {
          setState((s) => ({ ...s, uploading: false, busyId: null, error: `上传失败：${up.message}` }));
          return;
        }
        const list = await listTemplates();
        if (!alive.current) return;
        const templates = list.ok && Array.isArray(list.data.templates) ? list.data.templates : state.templates;
        const ext = String(file.name).slice(String(file.name).lastIndexOf(".")).toLowerCase();
        setState((s) => ({
          ...s,
          uploading: false,
          busyId: null,
          templates,
          filter: "user",
          notice: `已存为 ${up.data?.id ?? "?"} · ${file.name} · ${fmtSize(file.size)} · ${ext} · ${new Date().toLocaleString()}`
        }));
      };

      const removeUser = async (t) => {
        if (state.busyId !== null) return;
        const ask = typeof confirm === "function" ? confirm(`删除用户模板「${t.name}」？只删运行时目录，不动仓库。`) : true;
        if (!ask) return;
        setState((s) => ({ ...s, busyId: t.id, error: null, notice: null }));
        const res = await deleteTemplate(t.id);
        if (!alive.current) return;
        if (!res.ok) {
          setState((s) => ({ ...s, busyId: null, error: `删除失败：${res.message}` }));
          return;
        }
        const list = await listTemplates();
        if (!alive.current) return;
        setState((s) => ({
          ...s,
          busyId: null,
          templates: list.ok && Array.isArray(list.data.templates) ? list.data.templates : s.templates.filter((x) => x.id !== t.id),
          selected: res.data?.selection?.selected ?? (s.selected === t.id ? null : s.selected)
        }));
      };

      const renameUser = async (t) => {
        if (state.busyId !== null) return;
        const name = typeof prompt === "function" ? prompt("新的模板名字", t.name) : null;
        if (name === null) return;
        if (String(name).trim() === "") {
          setState((s) => ({ ...s, error: "名字不能为空" }));
          return;
        }
        setState((s) => ({ ...s, busyId: t.id, error: null, notice: null }));
        const res = await renameTemplate(t.id, { name: String(name).trim() });
        if (!alive.current) return;
        if (!res.ok) {
          setState((s) => ({ ...s, busyId: null, error: `改名失败：${res.message}` }));
          return;
        }
        setState((s) => ({
          ...s,
          busyId: null,
          templates: s.templates.map((x) => (x.id === t.id ? { ...x, name: res.data?.template?.name ?? x.name } : x))
        }));
      };

      const chips = [
        ["all", `全部 ${state.templates.length}`],
        ["system", `预设 ${systemCount}`],
        ["user", `用户 ${userCount}`],
        ["favorites", `收藏 ${favCount}`]
      ];

      return jsx("div", {
        className: "pc-wrap",
        "data-pc-wrap": "1"
      }, [
        // 永远先渲染这一行：「一点内容都没有」和「内容为空」要能分开。
        jsx(
          "div",
          { className: "pc-head", key: "head" },
          state.loading ? "模板 · 加载中" : `模板 · 共 ${state.templates.length} 个`
        ),
        jsx("div", { className: "pc-bar", key: "bar" }, [
          jsx("input", {
            key: "q",
            className: "pc-search",
            type: "search",
            placeholder: "搜索名称 / id / 分类",
            value: state.query,
            onChange: (e) => setState((s) => ({ ...s, query: e.target.value }))
          }),
          ...chips.map(([key, label]) =>
            jsx(
              "button",
              {
                key,
                type: "button",
                className: `pc-chip${state.filter === key ? " on" : ""}`,
                "aria-pressed": state.filter === key,
                onClick: () => setState((s) => ({ ...s, filter: key, cat: key === "system" ? s.cat : "" }))
              },
              label
            )
          ),
          jsx(
            "button",
            {
              key: "upload",
              type: "button",
              className: "pc-btn",
              title: "上传 Origin 图形模板或工程（.otp/.otpu/.opj/.opju/.oth）",
              disabled: state.uploading,
              onClick: () => {
                if (fileRef.current !== null && typeof fileRef.current.click === "function") fileRef.current.click();
              }
            },
            state.uploading ? "上传中…" : "＋ 上传模板"
          ),
          jsx("input", {
            key: "file",
            ref: fileRef,
            type: "file",
            accept: ORIGIN_ACCEPT,
            style: { display: "none" },
            onChange: (e) => {
              const picked = e?.target?.files?.[0] ?? null;
              if (e?.target !== undefined) e.target.value = "";
              void onPickFile(picked);
            }
          })
        ]),
        // 分类子筛选：只在「预设」档出现，且不与其他档位叠加（切档时 cat 已清空）。
        state.filter === "system"
          ? jsx(
              "div",
              { className: "pc-bar pc-sub", key: "cat" },
              [
                jsx(
                  "button",
                  {
                    key: "__all",
                    type: "button",
                    className: `pc-chip${state.cat === "" ? " on" : ""}`,
                    "data-cat": "",
                    onClick: () => setState((s) => ({ ...s, cat: "" }))
                  },
                  `全部分类 ${catCount}`
                ),
                ...categoryCounts.map((c) =>
                  jsx(
                    "button",
                    {
                      key: c.key,
                      type: "button",
                      className: `pc-chip${state.cat === c.key ? " on" : ""}`,
                      "data-cat": c.key,
                      onClick: () => setState((s) => ({ ...s, cat: c.key }))
                    },
                    `${c.label} ${c.count}`
                  )
                )
              ]
            )
          : null,
        jsx(
          "div",
          { className: "pc-cur", key: "cur" },
          state.selected === null
            ? jsx("span", { className: "pc-foot" }, "当前没选模板：按数据自动匹配")
            : [
                jsx("span", { key: "t" }, [jsx("b", { key: "b" }, "已选："), selectedName]),
                jsx(
                  "button",
                  { key: "c", type: "button", className: "pc-btn", onClick: clearSelected, disabled: state.busyId !== null },
                  "清除"
                )
              ]
        ),
        state.error === null
          ? null
          : jsx("div", { className: "pc-err", role: "alert", key: "err" }, state.error),
        state.notice === null
          ? null
          : jsx("div", { className: "pc-note", role: "status", key: "note" }, state.notice),
        state.loading
          ? jsx("div", { className: "pc-empty", key: "load" }, "读取模板库…")
          : shown.length === 0
            ? jsx(
                "div",
                { className: "pc-empty", key: "none" },
                state.filter === "favorites" && favCount === 0
                  ? "还没有收藏的模板"
                  : state.filter === "user" && userCount === 0
                    ? "还没有你自己的模板，可以上传 Origin 模板或工程"
                    : "没有匹配的模板"
              )
            : jsx(
                "div",
                { className: "pc-list", key: "list" },
                shown.map((t) =>
                  jsx(
                    "div",
                    { className: `pc-card${state.selected === t.id ? " sel" : ""}`, key: t.id, "data-template-id": t.id, "data-kind": kindOf(t), "data-status": String(t.status ?? "") },
                    [
                      jsx(
                        "button",
                        {
                          key: "star",
                          type: "button",
                          className: `pc-star${state.favorites.includes(t.id) ? " on" : ""}`,
                          title: state.favorites.includes(t.id) ? "取消收藏" : "收藏",
                          "aria-label": state.favorites.includes(t.id) ? "取消收藏" : "收藏",
                          onClick: () => toggleFavorite(t.id)
                        },
                        state.favorites.includes(t.id) ? "★" : "☆"
                      ),
                      jsx(
                        "div",
                        { className: "pc-thumb", key: "thumb" },
                        t.thumb === null || t.thumb === undefined
                          ? jsx(
                              "div",
                              { className: "pc-none" },
                              kindOf(t) === "user" ? "无缩略图 · Origin 文件" : "无实拍 / 仅规格，渲染未对接"
                            )
                          : jsx("img", { src: thumbUrl(t.id), alt: t.name, loading: "lazy", ...thumbZoomProps(t.id) })
                      ),
                      jsx("div", { className: "pc-body", key: "body" }, [
                        jsx("span", { key: "n", className: "pc-name" }, t.name),
                        jsx(
                          "span",
                          { key: "k", className: "pc-tag kind", "data-kind": kindOf(t) },
                          kindOf(t) === "user" ? "用户" : "预设"
                        ),
                        // 用户模板不声明 implemented/spec-only：它渲染在 Origin 里，不是我们的通道。
                        // 只标扩展名，避免看的人以为是「我们验证过的图型」。
                        kindOf(t) === "user"
                          ? jsx("span", { key: "ext", className: "pc-tag kind" }, String(t.ext ?? "Origin"))
                          : jsx(
                              "span",
                              { key: "s", className: `pc-tag ${t.status === "implemented" ? "impl" : "spec"}` },
                              String(t.status ?? "")
                            ),
                        jsx("span", { key: "c", className: "pc-meta" }, t.category ?? ""),
                        kindOf(t) === "user"
                          ? jsx(
                              "span",
                              { key: "m", className: "pc-meta" },
                              `${t.original_name ?? ""} · ${fmtSize(t.size)}`
                            )
                          : null,
                        kindOf(t) === "user" && t.usage
                          ? jsx("span", { key: "u", className: "pc-usage" }, t.usage)
                          : null,
                        jsx("div", { key: "row", className: "pc-row" }, [
                          jsx(
                            "button",
                            {
                              key: "use",
                              type: "button",
                              className: `pc-btn${state.selected === t.id ? "" : " pri"}`,
                              disabled: state.busyId !== null,
                              onClick: () => useThis(t.id)
                            },
                            state.selected === t.id ? "已选" : "用这个"
                          ),
                          kindOf(t) === "user"
                            ? jsx(
                                "button",
                                {
                                  key: "rn",
                                  type: "button",
                                  className: "pc-btn",
                                  disabled: state.busyId !== null,
                                  onClick: () => void renameUser(t)
                                },
                                "重命名"
                              )
                            : null,
                          kindOf(t) === "user"
                            ? jsx(
                                "button",
                                {
                                  key: "del",
                                  type: "button",
                                  className: "pc-btn",
                                  disabled: state.busyId !== null,
                                  onClick: () => void removeUser(t)
                                },
                                "删除"
                              )
                            : null
                        ])
                      ])
                    ]
                  )
                )
              ),
        jsx(
          "div",
          { className: "pc-foot", key: "foot" },
          `共 ${state.templates.length} 个模板（预设 ${systemCount} · 用户 ${userCount}）· 收藏 ${favCount}`
        )
      ]);
    }

    let titleEntered = false;

    function PanelTitle() {
      if (titleEntered === false) {
        titleEntered = true;
        postDiag({ phase: "title-enter" });
      }
      measureLayout("title-rect", ".pc-tab-title");
      return jsx("span", { className: "pc-tab-title" }, TAB_TITLE);
    }

    /**
     * 客户端要等的服务。宿主把 sidebarRightTabs 与 sidebarRight 在同一个 effect 里
     * provide（app.asar 46938054 / 46938127），只点名一个很可能永远等不到 ready
     * ——github-workbench 也是两个一起注入的。
     */
    const SERVICES = ["sidebarRightTabs", "sidebarRight"];

    /** disposer 三种形态都收：函数 / {dispose()} / undefined；拿不到也不能算没注册。 */
    function disposerOf(value) {
      if (typeof value === "function") return value;
      if (value !== null && typeof value === "object" && typeof value.dispose === "function") {
        return () => value.dispose();
      }
      return null;
    }

    /**
     * 注册侧栏标签：tab type 进 sidebarRightTabs，内容与标题进 slots。
     * 任何一步拿不到都安全返回（warn 一行），绝不把异常抛给宿主。
     */
    function apply(ctx) {
      const entry = { phase: "apply", version: VERSION, hasInject: false, hasSlots: false, hasTabs: false };
      try {
        entry.hasInject = typeof ctx?.inject === "function";
        entry.hasSlots = Boolean(ctx?.slots);
      } catch {
        /* 连 ctx 都读不了也要留下记录 */
      }
      postDiag(entry);
      bindWindowError();
      try {
        return applyInner(ctx);
      } catch (error) {
        postDiag({
          phase: "error",
          message: String(error?.message ?? error).slice(0, 300),
          stack: String(error?.stack ?? "").slice(0, 500)
        });
        console.warn(`${LOG} apply 异常：`, error);
        return () => {};
      }
    }

    function applyInner(ctx) {
      if (ctx === undefined || ctx === null) {
        postDiag({ phase: "no-ctx" });
        return;
      }
      if (typeof ctx.inject !== "function") {
        postDiag({ phase: "no-inject", keys: Object.keys(ctx || {}).slice(0, 10) });
        console.warn(`${LOG} ctx.inject 不可用，模板标签未注册`);
        return;
      }
      let seat = null;
      try {
        seat = ctx.inject(SERVICES, (injected) => {
          let tabs;
          try {
            tabs = injected !== null && typeof injected?.get === "function" ? injected.get("sidebarRightTabs") : undefined;
          } catch (error) {
            postDiag({ phase: "inject-get-error", message: String(error?.message ?? error).slice(0, 300) });
            tabs = undefined;
          }
          postDiag({
            phase: "inject-cb",
            names: SERVICES,
            injectedKeys: Object.keys(Object(injected)).slice(0, 12),
            typeofTabs: typeof tabs
          });
          if (tabs === undefined || tabs === null) {
            postDiag({ phase: "no-service", service: "sidebarRightTabs", typeofTabs: typeof tabs });
            console.warn(`${LOG} 宿主没有 sidebarRightTabs，模板标签未注册`);
            return;
          }
          if (typeof tabs.register !== "function") {
            postDiag({ phase: "no-register", typeofRegister: typeof tabs.register });
            console.warn(`${LOG} sidebarRightTabs.register 不可用，模板标签未注册`);
            return;
          }
          const disposers = [];
          let typesRegistered = 0;
          // 主类型 + kind 兼容别名：宿主按**实例自带 kind** 找定义，旧标签存的是旧 kind。
          const specs = [
            { id: TAB_ID, kind: TAB_KIND, guide: [{ order: 45, title: () => TAB_TITLE }] },
            { id: COMPAT_ID, kind: COMPAT_KIND, guide: null }
          ];
          for (const spec of specs) {
            postDiag({ phase: "register-attempt", id: spec.id, kind: spec.kind });
            let result;
            try {
              result = tabs.register({
                id: spec.id,
                kind: spec.kind,
                priority: "extension",
                title: () => TAB_TITLE,
                ...(spec.guide === null ? {} : { guide: spec.guide })
              });
            } catch (error) {
              postDiag({ phase: "register-error", id: spec.id, message: String(error?.message ?? error).slice(0, 300) });
              console.warn(`${LOG} 注册 tab type 失败（${spec.id}）：`, error);
              continue;
            }
            const disposer = disposerOf(result);
            if (disposer !== null) disposers.push(disposer);
            // 返回值三种形态（函数 / {dispose} / undefined）都算注册成功——判空只影响能否卸载。
            typesRegistered += 1;
            postDiag({
              phase: "register-result",
              id: spec.id,
              returned: typeof result,
              returnedKeys: result !== null && typeof result === "object" ? Object.keys(result).slice(0, 10) : null,
              hasDisposer: disposer !== null
            });
          }
          postDiag({
            phase: "registered",
            hasTabs: true,
            hasSlots: Boolean(ctx.slots && typeof ctx.slots.inject === "function"),
            ids: specs.map((spec) => spec.id),
            kinds: specs.map((spec) => spec.kind),
            registered: typesRegistered
          });
          if (typesRegistered === 0) return;
          const slots = ctx.slots;
          if (slots === undefined || typeof slots.inject !== "function") {
            postDiag({ phase: "no-slots", hasSlots: Boolean(slots), typeofInject: typeof slots?.inject });
            console.warn(`${LOG} ctx.slots 不可用，标签体未注册`);
          } else {
            try {
              // 两个 key 挂同一套内容体：主 key 走新标签，别名 key 让旧标签也能查到槽位。
              const seatSpecs = [
                ["sidebar.right.pane.tab", TemplatesPanel],
                ["sidebar.right.pane.tab.title", PanelTitle]
              ];
              for (const key of [TAB_ID, COMPAT_ID]) {
                for (const [name, component] of seatSpecs) {
                  disposers.push(
                    slots.inject(name, () => {
                      let registered;
                      try {
                        registered = slots.register({ name, key, inject: () => ({}) }, component);
                      } catch (error) {
                        postDiag({
                          phase: "slot-error",
                          name,
                          key,
                          message: String(error?.message ?? error).slice(0, 300)
                        });
                        throw error;
                      }
                      postDiag({
                        phase: "slot-result",
                        name,
                        key,
                        returned: typeof registered,
                        hasDisposer: disposerOf(registered) !== null
                      });
                      return registered;
                    })
                  );
                }
              }
            } catch (error) {
              postDiag({ phase: "slots-error", message: String(error?.message ?? error).slice(0, 300) });
              console.warn(`${LOG} 注册标签体失败：`, error);
            }
          }
          return () => {
            for (const dispose of disposers.reverse()) {
              try {
                dispose();
              } catch {
                /* 卸载阶段的异常不往上抛 */
              }
            }
          };
        });
      } catch (error) {
        postDiag({ phase: "inject-error", message: String(error?.message ?? error).slice(0, 300) });
        console.warn(`${LOG} 等待 sidebarRightTabs 失败：`, error);
      }
      return () => {
        try {
          seat?.dispose?.();
        } catch {
          /* 同上 */
        }
      };
    }

    exports.apply = apply;
    exports.inject = ["slots", "sidebarRightTabs", "sidebarRight"];
    exports.TemplatesPanel = TemplatesPanel;
    exports.PanelTitle = PanelTitle;
    exports.disposerOf = disposerOf;
    exports.placePreview = placePreview;
    exports.fitPreviewSize = fitPreviewSize;
    exports.closeZoom = closeZoom;
    exports.SERVICES = SERVICES;
    exports.TAB_ID = TAB_ID;
    exports.TAB_KIND = TAB_KIND;
    exports.COMPAT_ID = COMPAT_ID;
    exports.COMPAT_KIND = COMPAT_KIND;
    exports.TAB_TITLE = TAB_TITLE;
    return module.exports;
  }
});
