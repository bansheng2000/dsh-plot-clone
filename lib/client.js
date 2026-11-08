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
    const VERSION = "2.10.4";

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
    /** 系统模板改名：只写 aliases.json（name=null 即清除别名、恢复原名），仓库零改动。 */
    const setAlias = (id, name) => call("/aliases", { method: "POST", body: JSON.stringify({ id, name }) });

    // 云端模板（OriginLab Graph Gallery）：元数据随包，工程文件按需下载到 state 目录。
    // 「已安装」是 gallery-templates/ 下真实存在的目录，与用户模板互不相干。
    const listGallery = (category, q) =>
      call(`/gallery?category=${encodeURIComponent(category ?? "all")}&q=${encodeURIComponent(q ?? "")}`);
    const galleryDetail = (gid) => call(`/gallery/entry/${encodeURIComponent(gid)}`);
    const downloadGallery = (gid, overwrite) =>
      call("/gallery/download", { method: "POST", body: JSON.stringify({ gid, overwrite: overwrite === true }) });
    const deleteGallery = (gid) => call("/gallery/delete", { method: "POST", body: JSON.stringify({ gid }) });
    const refreshGallery = () => call("/gallery/refresh", { method: "POST" });
    const galleryThumbUrl = (gid) => `${BASE}/gallery/thumb/${encodeURIComponent(gid)}`;

    // 内置 Origin MCP：状态只读；重试安装 = 再起一次 bootstrap；停用请求只落文件，
    // 真正的 mcp_connector_set_enabled 由 agent 执行（插件绝不自动改宿主配置）。
    const readMcp = () => call("/mcp");
    const retryMcp = () => call("/mcp/retry", { method: "POST" });
    const requestDisableMcp = () => call("/mcp/request-disable", { method: "POST" });

    /**
     * 把一句话作为「用户消息」送进当前会话：宿主没有 sendPrompt 之类的 API，
     * 唯一通道是会话作用域的 conversation 服务。拿不到就退回剪贴板，
     * 由用户自己粘贴——绝不假装已经发出。
     */
    let SERVICE_CTX = null;
    function currentSessionId() {
      try {
        const wrap = typeof document !== "undefined" ? document.querySelector("[data-pc-wrap]") : null;
        const holder = wrap && typeof wrap.closest === "function" ? wrap.closest("[data-sidebar-right-session]") : null;
        const id = holder && holder.dataset ? holder.dataset.sidebarRightSession : null;
        if (id) return id;
        const any = typeof document !== "undefined" ? document.querySelector("[data-sidebar-right-session]") : null;
        return any && any.dataset ? any.dataset.sidebarRightSession ?? null : null;
      } catch {
        return null;
      }
    }
    async function sendUserMessage(text) {
      const id = currentSessionId();
      try {
        const sessions = SERVICE_CTX && typeof SERVICE_CTX.get === "function" ? SERVICE_CTX.get("sessions") : null;
        const scoped = sessions && typeof sessions.scope === "function" && id ? sessions.scope(id) : null;
        const conv = scoped && typeof scoped.get === "function" ? scoped.get("conversation") : null;
        if (conv && typeof conv.send === "function") {
          await conv.send(text);
          postDiag({ phase: "mcp-send", via: "session", sessionId: id });
          return { ok: true, via: "session", sessionId: id };
        }
      } catch (error) {
        postDiag({ phase: "mcp-send-error", message: String(error?.message ?? error).slice(0, 200) });
      }
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          return { ok: false, via: "clipboard", sessionId: id };
        }
      } catch {
        /* 剪贴板不可用：把原文留在返回值里，让面板自己显示 */
      }
      return { ok: false, via: null, sessionId: id, text };
    }

    /** 复制到剪贴板；失败返回 false（由调用方提示手抄），不抛。 */
    async function copyText(text) {
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch {
        /* 落到 false */
      }
      return false;
    }

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

    /* 卡片尺寸档：五档固定高度，切换只换 CSS 变量，不重排数据。 */
    const VIEW_MODES = [
      ["xl", "超大"],
      ["lg", "大"],
      ["md", "中"],
      ["sm", "小"],
      ["rows", "列表"]
    ];
    const VIEW_KEY = "pc.view";
    const readView = () => {
      try {
        const v = localStorage.getItem(VIEW_KEY);
        return VIEW_MODES.some(([k]) => k === v) ? v : "md";
      } catch {
        return "md";
      }
    };
    const persistView = (v) => {
      try {
        localStorage.setItem(VIEW_KEY, v);
      } catch {
        /* 宿主禁用 localStorage 就只留内存态 */
      }
    };

    const CSS = `
.pc-wrap{display:flex;flex-direction:column;gap:8px;height:100%;min-height:0;overflow-y:auto;overflow-x:hidden;padding:10px;box-sizing:border-box;font-size:12px;color:var(--dsw-alias-text-primary,inherit)}
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
.pc-cloud{display:flex;flex-direction:column;gap:8px;flex:1 1 auto;min-height:180px;overflow:hidden}
.pc-cloud .pc-list{flex:1 1 auto;min-height:0;overflow:auto;align-content:start}
.pc-cloud .pc-card{max-height:none}
.pc-list{flex:1 1 auto;min-height:180px;overflow:auto;display:grid;grid-auto-rows:max-content;grid-template-columns:repeat(auto-fill,minmax(var(--pc-card-min,150px),1fr));gap:8px;align-content:start;--pc-card-min:150px;--pc-thumb-h:112px}
.pc-list.v-xl{--pc-card-min:240px;--pc-thumb-h:180px}
.pc-list.v-lg{--pc-card-min:190px;--pc-thumb-h:140px}
.pc-list.v-md{--pc-card-min:150px;--pc-thumb-h:112px}
.pc-list.v-sm{--pc-card-min:112px;--pc-thumb-h:84px}
.pc-list.v-rows{grid-template-columns:1fr}
.pc-list.v-rows .pc-card{flex-direction:row;align-items:center;gap:8px;padding:4px 6px}
.pc-list.v-rows .pc-thumb{width:52px;height:52px;flex:0 0 52px}
.pc-list.v-rows .pc-name{flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pc-list.v-rows .pc-meta,.pc-list.v-rows .pc-row{flex:0 0 auto}
.pc-card{position:relative;border:1px solid var(--dsw-alias-border-color,rgba(128,128,128,.3));border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-card,transparent);display:flex;flex-direction:column}
.pc-card.sel{outline:2px solid var(--dsw-alias-state-business-primary,#3b6ef6);outline-offset:-2px}
.pc-thumb{height:var(--pc-thumb-h,112px);background:rgba(128,128,128,.12);display:flex;align-items:center;justify-content:center;overflow:hidden}
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
.pc-mcp{padding:7px 8px;border-radius:7px;line-height:1.45;display:flex;flex-direction:column;gap:5px;font-size:11px}
.pc-mcp-warn{background:rgba(220,60,60,.12);border:1px solid rgba(220,60,60,.45);color:#d64545}
.pc-mcp-run{background:rgba(90,140,240,.10);border:1px solid rgba(90,140,240,.35)}
.pc-mcp-ok{background:rgba(46,160,67,.10);border:1px solid rgba(46,160,67,.3);color:#2ea043;padding:4px 8px}
.pc-mcp-title{font-weight:600}
.pc-mcp-text{opacity:.85}
.pc-mcp-err{color:#d64545}
.pc-pre{margin:0;padding:6px;border-radius:5px;background:rgba(128,128,128,.14);font-size:10px;line-height:1.5;white-space:pre-wrap;word-break:break-all;max-height:132px;overflow:auto;user-select:text}
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
      // 图在层里取不到就立刻收层，不许留一个裂图图标。
      // 图在层里取不到就立刻收层，不许留一个裂图图标。
      made.img.onerror = () => {
        if (zoomHover === hover) closeHover();
      };
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
      // 钉住层同理：图取不到就收层，而不是顶着一张裂图占满屏。
      made.img.onerror = () => {
        if (zoomPin !== null && zoomPin.layer === made.layer) closePin();
      };
      made.img.src = url;
      zoomPin = { layer: made.layer, img: made.img, url };
      made.layer.onclick = () => closePin();
    }

    const eventPoint = (ev) => ({
      x: Number(ev && ev.clientX) || 0,
      y: Number(ev && ev.clientY) || 0
    });

    /** 给有实拍缩略图的卡片 <img> 用；没图的卡片不绑定，避免破图与空放大层。 */
    function thumbZoomPropsFor(url) {
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

    /** 系统/用户模板：图片地址由 id 推。 */
    function thumbZoomProps(id) {
      return thumbZoomPropsFor(thumbUrl(id));
    }

    function TemplatesPanelInner() {
      const [state, setState] = useState({
        loading: true,
        error: null,
        notice: null,
        templates: [],
        selected: null,
        // 选中云端条目时，服务端会把 name/file 解析成模板形状放这里（顶部「已选」用）。
        selectedTemplate: null,
        selectedError: null,
        favorites: [],
        query: "",
        filter: "all",
        cat: "",
        busyId: null,
        uploading: false,
        // 内置 Origin MCP 状态（/mcp）：conflict 红条 / bootstrap 进度 / 就绪。
        mcp: null,
        mcpBusy: "",
        // 缩略图请求失败的模板 id：失败即撤掉这张卡的 img 与悬停绑定，退回占位块。
        broken: {},
        // 云端模板：列表/分类/详情/忙碌标记，与系统模板的状态完全分开
        cloud: null,
        cloudCat: "all",
        cloudQuery: "",
        cloudDetail: null,
        cloudBusy: "",
        cloudNotice: null,
        cloudError: null,
        cloudLoading: false,
        // 卡片尺寸档：xl/lg/md/sm/rows，固定高度不随内容伸缩
        view: readView()
      });
      const alive = useRef(true);
      const fileRef = useRef(null);
      const cloudTimer = useRef(null);

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
            selectedTemplate: sel.ok ? sel.data.selected_template ?? null : null,
            selectedError: sel.ok ? sel.data.selected_error ?? null : null,
            favorites: sel.ok && Array.isArray(sel.data.favorites) ? sel.data.favorites : []
          }));
          measureLayout("panel-rect", "[data-pc-wrap]");
        })();
        return () => {
          alive.current = false;
        };
      }, []);

      // MCP 状态：进面板读一次；只在「后台真的在装」时轮询，有上限、失败即停，
      // 免得测试/无人看的面板被定时器挂住（selftest 就吃过这个亏）。
      useEffect(() => {
        alive.current = true;
        let timer = null;
        let tries = 0;
        const tick = async () => {
          const res = await readMcp();
          if (!alive.current) return;
          if (!res.ok) {
            setState((s) => ({ ...s, mcp: { error: res.message } }));
            return;
          }
          const data = res.data;
          setState((s) => ({ ...s, mcp: data }));
          const boot = data && data.bootstrap ? data.bootstrap : null;
          tries += 1;
          const keepPolling = Boolean(boot && boot.running) && tries < 120;
          if (keepPolling) timer = setTimeout(tick, 1500);
        };
        void tick();
        return () => {
          alive.current = false;
          if (timer !== null) clearTimeout(timer);
        };
      }, []);

      const onRetryMcp = async () => {        setState((s) => ({ ...s, mcpBusy: "retry", notice: null }));
        const res = await retryMcp();
        setState((s) => ({
          ...s,
          mcpBusy: "",
          notice: res.ok ? "已开始后台安装依赖，进度会自动刷新" : `重试失败：${res.message ?? "未知原因"}（下面有可复制的手动命令）`
        }));
      };

      const onRequestDisable = async () => {
        setState((s) => ({ ...s, mcpBusy: "disable", notice: null }));
        const res = await requestDisableMcp();
        if (!res.ok) {
          setState((s) => ({ ...s, mcpBusy: "", notice: `没能生成停用请求：${res.message ?? "未知原因"}` }));
          return;
        }
        const prompt = res.data && res.data.prompt ? res.data.prompt : "";
        const sent = await sendUserMessage(prompt);
        setState((s) => ({
          ...s,
          mcpBusy: "",
          notice: sent.ok
            ? "已把停用请求作为消息发到这个会话——等 agent 执行并回读确认"
            : sent.via === "clipboard"
              ? "发消息通道不可用，停用请求已复制到剪贴板，去对话框粘贴发送（插件不会自己改连接配置）"
              : "发消息通道与剪贴板都不可用，请打开 mcp-migration-request.json 手工复制提示词"
        }));
      };

      /* ── 云端模板（OriginLab Graph Gallery）──
         元数据随包（templates/gallery/index.json），工程文件按需下到
         ~/.dsh/dsh-plot-clone/gallery-templates/gid-<n>/，与用户模板目录完全分开。 */
      const loadCloud = async (category, q) => {
        setState((s) => ({ ...s, cloudLoading: true, cloudError: null }));
        const res = await listGallery(category, q);
        if (!alive.current) return;
        if (!res.ok) {
          setState((s) => ({ ...s, cloudLoading: false, cloudError: `云端目录读取失败：${res.message}` }));
          return;
        }
        setState((s) => ({
          ...s,
          cloudLoading: false,
          cloud: res.data,
          cloudCat: res.data.category ?? category,
          cloudNotice: null
        }));
      };

      const openCloudDetail = async (gid) => {
        setState((s) => ({ ...s, cloudBusy: `detail-${gid}`, cloudNotice: null }));
        const res = await galleryDetail(gid);
        if (!alive.current) return;
        setState((s) => ({
          ...s,
          cloudBusy: "",
          cloudDetail: res.ok ? res.data : null,
          cloudNotice: res.ok ? null : `读取详情失败：${res.message}`
        }));
      };

      const doCloudDownload = async (gid, overwrite) => {
        setState((s) => ({ ...s, cloudBusy: `dl-${gid}`, cloudNotice: null }));
        const res = await downloadGallery(gid, overwrite);
        if (!alive.current) return;
        if (!res.ok) {
          setState((s) => ({
            ...s,
            cloudBusy: "",
            cloudNotice: `下载失败：${res.message}${String(res.message ?? "").includes("已安装") ? "（再点一次「下载」确认覆盖）" : ""}`
          }));
          return;
        }
        await loadCloud(state.cloudCat, state.cloudQuery);
        if (!alive.current) return;
        // 首次下载服务端会自动把它设为选中（重新下载不动已选）；把回执同步到面板。
        const picked = res.data && res.data.selection ? res.data.selection : null;
        setState((s) => ({
          ...s,
          cloudBusy: "",
          ...(picked === null ? {} : {
            selected: picked.selected ?? null,
            selectedTemplate: picked.selected_template ?? null,
            selectedError: picked.selected_error ?? null
          }),
          cloudNotice: `已安装 GID ${gid} · ${res.data.file} · ${fmtSize(res.data.bytes)} · sha256 ${String(res.data.sha256).slice(0, 16)}…${picked === null ? "" : "（已设为当前选中）"}`
        }));
      };

      const doCloudDelete = async (gid) => {
        setState((s) => ({ ...s, cloudBusy: `rm-${gid}`, cloudNotice: null }));
        const res = await deleteGallery(gid);
        if (!alive.current) return;
        if (!res.ok) {
          setState((s) => ({ ...s, cloudBusy: "", cloudNotice: `删除失败：${res.message}` }));
          return;
        }
        await loadCloud(state.cloudCat, state.cloudQuery);
        if (!alive.current) return;
        const wasSelected = state.selected === `gid-${gid}`;
        const selAfter = res.data?.selection?.selected;
        setState((s) => ({
          ...s,
          cloudBusy: "",
          cloudDetail: null,
          selected: selAfter !== undefined ? selAfter : wasSelected ? null : s.selected,
          selectedTemplate: wasSelected ? null : s.selectedTemplate,
          selectedError: wasSelected ? null : s.selectedError,
          cloudNotice: `已删除 GID ${gid}（${res.data.removed}）`
        }));
      };

      const doCloudRefresh = async () => {
        setState((s) => ({ ...s, cloudBusy: "refresh", cloudNotice: "正在抓线上目录，可能要几分钟（只在这次点击时跑，不后台刷新）…" }));
        const res = await refreshGallery();
        if (!alive.current) return;
        if (!res.ok) {
          setState((s) => ({ ...s, cloudBusy: "", cloudNotice: `刷新失败：${res.message}` }));
          return;
        }
        const d = res.data;
        await loadCloud(state.cloudCat, state.cloudQuery);
        if (!alive.current) return;
        setState((s) => ({
          ...s,
          cloudBusy: "",
          cloudNotice: `刷新完成：扫 ${d.scanned} 个 GID，命中 ${d.total_pages} 页，新增 ${Array.isArray(d.added) ? d.added.length : 0} 条，改名 ${Array.isArray(d.renamed) ? d.renamed.length : 0} 条，失败 ${d.failed} 次${d.truncated ? "（超时提前结束）" : ""}`
        }));
      };

      const cloudBlock = (() => {
        const cloud = state.cloud;
        if (state.cloudLoading === true && cloud === null) {
          return jsx("div", { className: "pc-empty", key: "cloud-load" }, "读取云端目录…");
        }
        if (state.cloudError) {
          return jsx("div", { className: "pc-err", role: "alert", key: "cloud-err" }, state.cloudError);
        }
        if (cloud === null) return null;
        const rows = Array.isArray(cloud.templates) ? cloud.templates : [];
        const cats = Array.isArray(cloud.categories) ? cloud.categories : [];
        const cache = cloud.cache;
        return jsx("div", { className: "pc-cloud", key: "cloud" }, [
          jsx("div", { className: "pc-bar pc-sub", key: "cats" }, [
            ...cats.map((c) =>
              jsx(
                "button",
                {
                  key: c.key,
                  type: "button",
                  className: `pc-chip${state.cloudCat === c.key ? " on" : ""}`,
                  "data-cloud-cat": c.key,
                  onClick: () => {
                    setState((s) => ({ ...s, cloudCat: c.key, cloudDetail: null }));
                    void loadCloud(c.key, state.cloudQuery);
                  }
                },
                `${c.label} ${c.count}`
              )
            ),
            jsx(
              "button",
              {
                key: "refresh",
                type: "button",
                className: "pc-btn",
                disabled: state.cloudBusy === "refresh",
                title: cache && cache.refreshed_at ? `上次刷新：${new Date(cache.refreshed_at).toLocaleString()}（新增 ${cache.added} 条）` : "还没刷新过",
                onClick: () => void doCloudRefresh()
              },
              state.cloudBusy === "refresh" ? "刷新中…" : "刷新目录"
            ),
            cache && cache.refreshed_at
              ? jsx("span", { key: "cache", className: "pc-note" }, `上次刷新 ${new Date(cache.refreshed_at).toLocaleString()} · 新增 ${cache.added} 条`)
              : null
          ]),
          state.cloudNotice === null
            ? null
            : jsx("div", { className: "pc-note", role: "status", key: "cloud-note" }, state.cloudNotice),
          rows.length === 0
            ? jsx("div", { className: "pc-empty", key: "cloud-none" }, "这一类里没有条目")
            : jsx(
                "div",
                { className: `pc-list v-${state.view}`, key: "cloud-list" },
                rows.map((t) => {
                  const thumb = t.installed && t.local ? galleryThumbUrl(t.gid) : t.thumb;
                  const thumbBroken = state.broken[`gid-${t.gid}`] === true;
                  const detail = state.cloudDetail && state.cloudDetail.entry && state.cloudDetail.entry.gid === t.gid
                    ? state.cloudDetail.entry
                    : null;
                  return jsx(
                    "div",
                    {
                      className: `pc-card${state.selected === `gid-${t.gid}` ? " sel" : ""}`,
                      key: `g${t.gid}`,
                      "data-gallery-gid": t.gid,
                      "data-installed": t.installed ? "1" : "0",
                      "data-category": t.category
                    },
                    [
                      thumb && !thumbBroken
                        ? jsx("div", { className: "pc-thumb", key: "thumb" }, [
                            jsx("img", {
                              key: "img",
                              src: thumb,
                              alt: t.title,
                              loading: "lazy",
                              ...thumbZoomPropsFor(thumb),
                              // 图取不到（站点缩略图过期 / 本地 thumb 丢了）：收掉放大层换占位，别留裂图。
                              onError: () => {
                                closeHover();
                                setState((st) => ({ ...st, broken: { ...st.broken, [`gid-${t.gid}`]: true } }));
                              }
                            })
                          ])
                        : jsx(
                            "div",
                            { className: "pc-thumb pc-thumb-none", key: "thumb" },
                            t.downloadable ? "无缩略图" : "站点无预览"
                          ),
                      jsx("div", { className: "pc-name", key: "name" }, `GID ${t.gid} · ${t.title}`),
                      jsx("div", { className: "pc-meta", key: "meta" }, [
                        jsx("span", { key: "cat", className: "pc-badge" }, t.category),
                        jsx(
                          "span",
                          { key: "dl", className: `pc-badge ${t.downloadable ? "" : "muted"}` },
                          t.downloadable ? "可下载" : "仅查看"
                        ),
                        t.installed ? jsx("span", { key: "inst", className: "pc-badge" }, "已安装") : null
                      ]),
                      jsx("div", { className: "pc-row", key: "row" }, [
                        t.downloadable
                          ? jsx(
                              "button",
                              {
                                key: "dl",
                                type: "button",
                                className: "pc-btn",
                                disabled: Boolean(state.cloudBusy),
                                onClick: () => void doCloudDownload(t.gid, t.installed)
                              },
                              state.cloudBusy === `dl-${t.gid}` ? "下载中…" : t.installed ? "重新下载" : "下载"
                            )
                          : null,
                        t.installed
                          ? jsx(
                              "button",
                              {
                                key: "use",
                                type: "button",
                                className: `pc-btn${state.selected === `gid-${t.gid}` ? " pri" : ""}`,
                                "data-gallery-use": t.gid,
                                disabled: Boolean(state.busyId) || Boolean(state.cloudBusy),
                                onClick: () => void useThis(`gid-${t.gid}`)
                              },
                              state.selected === `gid-${t.gid}` ? "已选" : "选用"
                            )
                          : null,
                        t.installed
                          ? jsx(
                              "button",
                              {
                                key: "rm",
                                type: "button",
                                className: "pc-btn",
                                disabled: Boolean(state.cloudBusy),
                                onClick: () => void doCloudDelete(t.gid)
                              },
                              state.cloudBusy === `rm-${t.gid}` ? "删除中…" : "删除"
                            )
                          : null,
                        jsx(
                          "button",
                          {
                            key: "detail",
                            type: "button",
                            className: "pc-btn",
                            onClick: () => void openCloudDetail(t.gid)
                          },
                          state.cloudBusy === `detail-${t.gid}` ? "…" : "详情"
                        )
                      ]),
                      detail === null
                        ? null
                        : jsx("div", { className: "pc-note", key: "detail" }, [
                            jsx("div", { key: "l1" }, detail.title || `GID ${detail.gid}`),
                            jsx("div", { key: "l2" }, `分类：${detail.category} · 文件：${(detail.files ?? []).length === 0 ? "站点无工程文件" : (detail.files ?? []).join(" , ")}`),
                            jsx(
                              "div",
                              { key: "l3" },
                              jsx("a", { href: detail.page, target: "_blank", rel: "noreferrer" }, "在 OriginLab Graph Gallery 打开"),
                              ` · 许可：${detail.license}`
                            )
                          ])
                    ]
                  );
                })
              )
        ]);
      })();

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
        if (hit !== undefined) return hit.name;
        // 云端选中（gid-<n>）：服务端解析好的 selected_template 优先，其次翻云端列表。
        const m = /^gid-([1-9]\d*)$/.exec(state.selected);
        if (m === null) return state.selected;
        const gid = Number(m[1]);
        const tmpl = state.selectedTemplate;
        if (tmpl && tmpl.gid === gid && typeof tmpl.name === "string" && tmpl.name !== "") return tmpl.name;
        const rows = Array.isArray(state.cloud?.templates) ? state.cloud.templates : [];
        const row = rows.find((t) => t.gid === gid);
        const title = typeof row?.title === "string" ? row.title : "";
        return title === "" ? `GID ${gid}` : `GID ${gid} · ${title}`;
      }, [state.selected, state.templates, state.cloud, state.selectedTemplate]);

      // 云端选中：把工程文件路径也显示出来（agent 读的就是它），路径过长交给 CSS 截断。
      const gallerySelected = useMemo(() => {
        const m = state.selected === null ? null : /^gid-([1-9]\d*)$/.exec(state.selected);
        if (m === null) return null;
        const gid = Number(m[1]);
        const rows = Array.isArray(state.cloud?.templates) ? state.cloud.templates : [];
        const row = rows.find((t) => t.gid === gid);
        const tmpl = state.selectedTemplate && state.selectedTemplate.gid === gid ? state.selectedTemplate : null;
        return { gid, file: tmpl?.origin_file ?? row?.local?.file ?? null, error: state.selectedError };
      }, [state.selected, state.cloud, state.selectedTemplate, state.selectedError]);

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
          selectedTemplate: res.data.selected_template ?? null,
          selectedError: res.data.selected_error ?? null,
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

      /**
       * 改名：用户模板写它自己的 meta.json；系统模板写 aliases.json 的显示名（留空 = 恢复原名）。
       * 两条路都不动仓库里的 templates/system/*。
       */
      const renameAny = async (t) => {
        if (state.busyId !== null) return;
        const isUser = kindOf(t) === "user";
        const label = isUser ? "新的模板名字" : "新的显示名（只写 aliases.json；留空 = 恢复原名）";
        const input = typeof prompt === "function" ? prompt(label, t.name) : null;
        if (input === null) return;
        const name = String(input).trim();
        if (name === "" && isUser) {
          setState((s) => ({ ...s, error: "名字不能为空" }));
          return;
        }
        setState((s) => ({ ...s, busyId: t.id, error: null, notice: null }));
        const res = isUser
          ? await renameTemplate(t.id, { name })
          : await setAlias(t.id, name === "" ? null : name);
        if (!alive.current) return;
        if (!res.ok) {
          setState((s) => ({ ...s, busyId: null, error: `改名失败：${res.message}` }));
          return;
        }
        const list = await listTemplates();
        if (!alive.current) return;
        setState((s) => ({
          ...s,
          busyId: null,
          templates: list.ok && Array.isArray(list.data.templates) ? list.data.templates : s.templates,
          notice: isUser
            ? null
            : name === ""
              ? `已清除别名，${t.id} 恢复原名`
              : `已把 ${t.id} 的显示名改成「${name}」（只写 aliases.json，仓库未动）`
        }));
      };

      const chips = [
        ["all", `全部 ${state.templates.length}`],
        ["system", `预设 ${systemCount}`],
        ["user", `用户 ${userCount}`],
        ["favorites", `收藏 ${favCount}`],
        ["cloud", "云端"]
      ];

      // MCP 顶部区：冲突红条 / 安装进度 / 就绪细线。三者互斥，永远只出现一块。
      const mcp = state.mcp;
      const boot = mcp && mcp.bootstrap ? mcp.bootstrap : null;
      const manualLines = boot && Array.isArray(boot.manual_command) ? boot.manual_command : [];
      const mcpBusy = state.mcpBusy !== "";
      const mcpBlock =
        mcp === null
          ? null
          : mcp.action === "conflict"
            ? jsx("div", { className: "pc-mcp pc-mcp-warn", key: "mcp-conflict", role: "alert" }, [
                jsx("div", { key: "t", className: "pc-mcp-title" }, "内置 Origin MCP 被同名连接挡住"),
                jsx(
                  "div",
                  { key: "d", className: "pc-mcp-text" },
                  `连接 ${mcp.conflict && mcp.conflict.key ? mcp.conflict.key : "custom-dsh-origin"}（serverName ${mcp.serverName ?? "dsh-origin"}）处于启用状态。两者同名时后加载的一整条会加载失败——插件不会自己停用它。`
                ),
                jsx("div", { key: "r", className: "pc-row" }, [
                  jsx(
                    "button",
                    {
                      key: "stop",
                      type: "button",
                      className: "pc-btn pri",
                      disabled: mcpBusy,
                      onClick: () => void onRequestDisable()
                    },
                    mcpBusy ? "处理中…" : "停用旧连接（发消息给 agent）"
                  )
                ])
              ])
            : mcp.ready === true && mcp.action === "ok"
              ? jsx("div", { className: "pc-mcp pc-mcp-ok", key: "mcp-ok" }, "内置 Origin MCP：就绪（server 随包，venv 已装好）")
              : jsx("div", { className: "pc-mcp pc-mcp-run", key: "mcp-run" }, [
                  jsx("div", { key: "h", className: "pc-mcp-title" }, [
                    jsx("span", { key: "s" }, `内置 Origin MCP：安装中 · ${boot && boot.stage ? boot.stage : "准备"}`),
                    boot && boot.progress ? jsx("span", { key: "p", className: "pc-meta" }, `（${boot.progress}）`) : null
                  ]),
                  boot && boot.error
                    ? jsx("div", { key: "e", className: "pc-mcp-err" }, `失败：${boot.error}${boot.hint ? ` · ${boot.hint}` : ""}`)
                    : jsx("div", { key: "wait", className: "pc-mcp-text" }, boot && boot.running ? "后台在装依赖，进度会自动刷新。" : "还没就位，点「重试安装」或照下面的命令手动装。"),
                  manualLines.length > 0
                    ? jsx("pre", { key: "cmd", className: "pc-pre" }, manualLines.join("\n"))
                    : null,
                  manualLines.length > 0
                    ? jsx("div", { key: "hint", className: "pc-mcp-text" }, boot && boot.mirror_hint ? boot.mirror_hint : "pip 慢就换镜像（上面命令已带清华源）。")
                    : null,
                  jsx("div", { key: "r", className: "pc-row" }, [
                    jsx(
                      "button",
                      { key: "retry", type: "button", className: "pc-btn", disabled: mcpBusy, onClick: () => void onRetryMcp() },
                      mcpBusy ? "处理中…" : "重试安装"
                    ),
                    manualLines.length > 0
                      ? jsx(
                          "button",
                          {
                            key: "copy",
                            type: "button",
                            className: "pc-btn",
                            onClick: async () => {
                              const ok = await copyText(manualLines.join("\n"));
                              setState((s) => ({ ...s, notice: ok ? "手动命令已复制" : "复制失败，请手抄上面的命令" }));
                            }
                          },
                          "复制命令"
                        )
                      : null
                  ])
                ]);

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
        mcpBlock,
        jsx("div", { className: "pc-bar", key: "bar" }, [
          jsx("input", {
            key: "q",
            className: "pc-search",
            type: "search",
            placeholder: "搜索名称 / id / 分类",
            value: state.query,
            onChange: (e) => {
              const v = e.target.value;
              setState((s) => ({ ...s, query: v, cloudQuery: v }));
              if (state.filter === "cloud") {
                if (cloudTimer.current !== null) clearTimeout(cloudTimer.current);
                cloudTimer.current = setTimeout(() => void loadCloud(state.cloudCat, v), 300);
              }
            }
          }),
          ...chips.map(([key, label]) =>
            jsx(
              "button",
              {
                key,
                type: "button",
                className: `pc-chip${state.filter === key ? " on" : ""}`,
                "aria-pressed": state.filter === key,
                onClick: () => {
                  setState((s) => ({ ...s, filter: key, cat: key === "system" ? s.cat : "" }));
                  if (key === "cloud" && state.cloud === null) void loadCloud(state.cloudCat, state.cloudQuery);
                }
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
          ...VIEW_MODES.map(([key, label]) =>
            jsx(
              "button",
              {
                key: `v-${key}`,
                type: "button",
                className: `pc-chip${state.view === key ? " on" : ""}`,
                "data-view": key,
                title: `卡片尺寸：${label}`,
                onClick: () => {
                  setState((s) => ({ ...s, view: key }));
                  persistView(key);
                }
              },
              label
            )
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
                gallerySelected === null
                  ? null
                  : jsx(
                      "span",
                      { key: "f", className: "pc-foot", title: gallerySelected.file ?? "" },
                      gallerySelected.file === null
                        ? `GID ${gallerySelected.gid}：工程文件未找到${gallerySelected.error === null ? "" : `（${gallerySelected.error.message}）`}`
                        : `文件：${gallerySelected.file}`
                    ),
                jsx(
                  "button",
                  { key: "c", type: "button", className: "pc-btn", onClick: clearSelected, disabled: state.busyId !== null },
                  "取消选择"
                )
              ]
        ),
        state.error === null
          ? null
          : jsx("div", { className: "pc-err", role: "alert", key: "err" }, state.error),
        state.notice === null
          ? null
          : jsx("div", { className: "pc-note", role: "status", key: "note" }, state.notice),
        state.filter === "cloud"
          ? cloudBlock
          : state.loading
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
                { className: `pc-list v-${state.view}`, key: "list" },
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
                        // 有图就放大、没图就不管：是否绑定只看这张卡最终有没有 <img>，
                        // 不看 id 白名单，所以用户自带预览图的模板照样生效。
                        t.thumb !== null && t.thumb !== undefined && state.broken[t.id] !== true
                          ? jsx("img", {
                              src: thumbUrl(t.id),
                              alt: t.name,
                              loading: "lazy",
                              ...thumbZoomProps(t.id),
                              // 图取不到：撤掉这张卡的悬停绑定，换成占位块，别再留裂图。
                              onError: () => {
                                closeHover();
                                setState((s) => ({ ...s, broken: { ...s.broken, [t.id]: true } }));
                              }
                            })
                          : jsx(
                              "div",
                              { className: "pc-none" },
                              state.broken[t.id] === true
                                ? "缩略图加载失败"
                                : kindOf(t) === "user"
                                  ? "无缩略图 · Origin 文件"
                                  : "无实拍 / 仅规格，渲染未对接"
                            )
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
                              title: state.selected === t.id ? "再点一次取消选择" : "选为本次要用的模板",
                              onClick: () => (state.selected === t.id ? clearSelected() : useThis(t.id))
                            },
                            state.selected === t.id ? "已选 / 取消" : "用这个"
                          ),
                          jsx(
                            "button",
                            {
                              key: "rn",
                              type: "button",
                              className: "pc-btn",
                              disabled: state.busyId !== null,
                              title:
                                kindOf(t) === "user"
                                  ? "改这个用户模板 meta.json 里的名字"
                                  : "只改显示名（写 aliases.json，仓库不动；留空 = 恢复原名）",
                              onClick: () => void renameAny(t)
                            },
                            "重命名"
                          ),
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
    const SERVICES = ["sidebarRightTabs", "sidebarRight", "sessions"];

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
          // 面板里「停用旧连接」要把话作为用户消息发出去：会话作用域服务只能从这里拿。
          SERVICE_CTX = injected;
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
    exports.inject = ["slots", "sidebarRightTabs", "sidebarRight", "sessions"];
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
