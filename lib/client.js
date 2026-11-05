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
    const { jsx } = require("react/jsx-runtime");

    const BASE = "/plugins/dsh-plot-clone";
    const TAB_ID = "dsh-plot-clone/templates";
    // 宿主按 tab 的 kind 去 slot 里查内容体：id / kind / key 必须是同一个字符串，
    // 否则标签按钮出现、内容却查不到（表现为空白面板）。
    const TAB_KIND = TAB_ID;
    const TAB_TITLE = "模板";
    const STYLE_ID = "dsh-plot-clone-tab-style";
    const LOG = "[dsh-plot-clone]";

    /** fetch → {ok, data, message}；HTTP 非 2xx 也折成 ok:false 带后端 message。 */
    async function call(path, init) {
      let res;
      try {
        res = await fetch(BASE + path, {
          method: init?.method ?? "GET",
          headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
          body: init?.body,
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

    function TemplatesPanel() {
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
            setState((s) => ({ ...s, loading: false, error: list.message }));
            return;
          }
          const templates = Array.isArray(list.data.templates) ? list.data.templates : [];
          setState((s) => ({
            ...s,
            loading: false,
            error: sel.ok ? null : sel.message,
            templates,
            selected: sel.ok ? sel.data.selected ?? null : null,
            favorites: sel.ok && Array.isArray(sel.data.favorites) ? sel.data.favorites : []
          }));
        })();
        return () => {
          alive.current = false;
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

      return jsx("div", { className: "pc-wrap" }, [
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
                          : jsx("img", { src: thumbUrl(t.id), alt: t.name, loading: "lazy" })
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

    function PanelTitle() {
      return jsx("span", { className: "pc-tab-title" }, TAB_TITLE);
    }

    /**
     * 注册侧栏标签：tab type 进 sidebarRightTabs，内容与标题进 slots。
     * 任何一步拿不到都安全返回（warn 一行），绝不把异常抛给宿主。
     */
    function apply(ctx) {
      if (ctx === undefined || ctx === null) return;
      if (typeof ctx.inject !== "function") {
        console.warn(`${LOG} ctx.inject 不可用，模板标签未注册`);
        return;
      }
      let seat = null;
      try {
        seat = ctx.inject(["sidebarRightTabs"], (injected) => {
          const tabs = injected.get("sidebarRightTabs");
          if (tabs === undefined || typeof tabs.register !== "function") {
            console.warn(`${LOG} 宿主没有 sidebarRightTabs.register，模板标签未注册`);
            return;
          }
          const disposers = [];
          try {
            const disposeType = tabs.register({
              id: TAB_ID,
              kind: TAB_KIND,
              priority: "extension",
              title: () => TAB_TITLE,
              guide: [{ order: 45, title: () => TAB_TITLE }]
            });
            if (typeof disposeType === "function") disposers.push(disposeType);
          } catch (error) {
            console.warn(`${LOG} 注册 tab type 失败：`, error);
            return;
          }
          const slots = ctx.slots;
          if (slots === undefined || typeof slots.inject !== "function") {
            console.warn(`${LOG} ctx.slots 不可用，标签体未注册`);
          } else {
            try {
              disposers.push(
                slots.inject("sidebar.right.pane.tab", () => slots.register({
                  name: "sidebar.right.pane.tab",
                  key: TAB_ID,
                  inject: () => ({})
                }, TemplatesPanel))
              );
              disposers.push(
                slots.inject("sidebar.right.pane.tab.title", () => slots.register({
                  name: "sidebar.right.pane.tab.title",
                  key: TAB_ID,
                  inject: () => ({})
                }, PanelTitle))
              );
            } catch (error) {
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
    exports.inject = [];
    exports.TemplatesPanel = TemplatesPanel;
    exports.PanelTitle = PanelTitle;
    exports.TAB_ID = TAB_ID;
    exports.TAB_KIND = TAB_KIND;
    exports.TAB_TITLE = TAB_TITLE;
    return module.exports;
  }
});
