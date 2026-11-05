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

    const CSS = `
.pc-wrap{display:flex;flex-direction:column;gap:8px;height:100%;min-height:0;padding:10px;box-sizing:border-box;font-size:12px;color:var(--dsw-alias-text-primary,inherit)}
.pc-bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.pc-search{flex:1 1 130px;min-width:0;padding:5px 8px;border-radius:6px;border:1px solid var(--dsw-alias-border-color,rgba(128,128,128,.35));background:transparent;color:inherit;font-size:12px}
.pc-chip{padding:4px 9px;border-radius:999px;border:1px solid var(--dsw-alias-border-color,rgba(128,128,128,.35));background:transparent;color:inherit;font-size:11px;cursor:pointer;white-space:nowrap}
.pc-chip.on{background:var(--dsw-alias-state-business-primary,#3b6ef6);border-color:transparent;color:#fff}
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
.pc-star{position:absolute;top:3px;right:3px;border:0;background:rgba(0,0,0,.35);color:#fff;border-radius:6px;font-size:12px;line-height:1;padding:3px 5px;cursor:pointer}
.pc-star.on{color:#f5c518}
.pc-card .pc-btn{align-self:flex-start}
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
        templates: [],
        selected: null,
        favorites: [],
        query: "",
        filter: "all",
        busyId: null
      });
      const alive = useRef(true);

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

      const shown = useMemo(() => {
        const q = state.query.trim().toLowerCase();
        return state.templates.filter((t) => {
          if (state.filter !== "all" && t.status !== state.filter) return false;
          if (q === "") return true;
          return (
            String(t.id).toLowerCase().includes(q) ||
            String(t.name).toLowerCase().includes(q) ||
            String(t.category ?? "").toLowerCase().includes(q)
          );
        });
      }, [state.templates, state.query, state.filter]);

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

      const chips = [
        ["all", `全部 ${state.templates.length}`],
        ["implemented", "implemented"],
        ["spec-only", "spec-only"]
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
                onClick: () => setState((s) => ({ ...s, filter: key }))
              },
              label
            )
          )
        ]),
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
        state.loading
          ? jsx("div", { className: "pc-empty", key: "load" }, "读取模板库…")
          : shown.length === 0
            ? jsx("div", { className: "pc-empty", key: "none" }, "没有匹配的模板")
            : jsx(
                "div",
                { className: "pc-list", key: "list" },
                shown.map((t) =>
                  jsx(
                    "div",
                    { className: `pc-card${state.selected === t.id ? " sel" : ""}`, key: t.id, "data-template-id": t.id },
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
                          ? jsx("div", { className: "pc-none" }, "无实拍 / 仅规格，渲染未对接")
                          : jsx("img", { src: thumbUrl(t.id), alt: t.name, loading: "lazy" })
                      ),
                      jsx("div", { className: "pc-body", key: "body" }, [
                        jsx("span", { key: "n", className: "pc-name" }, t.name),
                        jsx(
                          "span",
                          { key: "s", className: `pc-tag ${t.status === "implemented" ? "impl" : "spec"}` },
                          t.status
                        ),
                        jsx("span", { key: "c", className: "pc-meta" }, t.category ?? ""),
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
                        )
                      ])
                    ]
                  )
                )
              ),
        jsx(
          "div",
          { className: "pc-foot", key: "foot" },
          `共 ${state.templates.length} 个系统模板 · 收藏 ${state.favorites.length}`
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
