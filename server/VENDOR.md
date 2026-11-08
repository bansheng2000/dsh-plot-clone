# VENDOR — Origin MCP 源码来源

本目录是 `dsh-origin-plugin` 上游 Origin MCP 源码的**冻结快照**，随 `dsh-plot-clone` 一起分发，让「装插件即带 Origin MCP」成立：不联网下载、不注册 connector、不依赖 npm 上的另一份。

| 项 | 值 |
|---|---|
| 上游项目 | `Fantasality/dsh-origin-plugin`（https://github.com/Fantasality/dsh-origin-plugin） |
| 上游版本线 | 2.7.x（npm 最后发布版本 **2.7.4**；2.7.5 只存在于 fork） |
| 本 fork | `bansheng2000/dsh-origin-plugin` |
| fork commit | `03acc24181aae6c6ac3a8502aa6ae24a8d1708da`（feat: origin_new_project，2.7.5） |
| 许可 | MIT，`Copyright (c) 2026 Fantasality`（见同目录 `LICENSE`，版权行必须保留） |
| 快照时间 | 2026-11-07 |

**上游 commit 号未在本机 fetch 记录**：本仓库的 `server/` 取自上面那个 fork commit，它自身包含到 2.7.4 为止的上游历史；需要精确对齐上游 HEAD 时，用 `node scripts/vendor_sync.mjs --from <上游 checkout>` 逐文件 diff。

## 我们相对上游的改动

1. **`origin_new_project` 工具**（fork 2.7.5）：先 `origin_save_project` 存旧工程再 `doc -n` 新建，避免模态框卡 COM；每会话一个工程。
2. **版本号跟随插件**（本包改动）：`origin_mcp_server.py` 不再写死 `2.0.0` / `2.3.0`，按 `PLOT_CLONE_PACKAGE_JSON`（测试）→ 上级 `package.json`（仓库/开发态）→ 上级 `VERSION`（state 镜像，bootstrap 每次写入）的顺序取 `version`；镜像里没有 `package.json`，少了 `VERSION` 这一级生产握手会退回 `0.0.0-dev`。上游版本另记在 `_UPSTREAM`，由 `origin_status` 的 `upstream` 字段回报。
3. **stdio 入口委托**：`origin_mcp_stdio.py` 只做依赖预检并委托 `origin_mcp_server._sync_stdio_server()`，两种入口共用同一套 76 个工具。
4. **空闲自动释放**（本包新增 `origin_idle.py`）：MCP 进程随 DSH 常驻，首次 `origin_*` 调用后若一直不释放，Origin 会被自动化占用，用户手动打开会提示「另一个应用正在控制」。现由旁路线程按空闲阈值（默认 120s，`DSH_ORIGIN_IDLE_RELEASE` 覆盖，`0` 关闭）调用 `engine.release()`：只清 COM 引用并显示窗口，不杀进程、不改数据，下一次调用自动重连。`origin_engine.is_connected()` 是只读连接标志（不碰 COM、不触发连接），仅供该线程判定。

5. **弹窗识别与安全点击**（本包新增 `origin_dialogs.py`）：MCP 随 DSH 常驻、Origin 又是自动化的，一旦弹出模态框（保存确认、覆盖确认、错误提示），COM 调用就会卡到 90 秒超时。旧看门狗只会「见到白名单按钮就点第一个」，在中文 Windows 上既匹配不上 `是(Y)`/`否(N)`，又会把保存确认框的「是」点掉（= 替你覆盖工程文件）。新实现按弹窗文本分类：保存/覆盖一律点「否」或「取消」，错误/警告点「确定」，认不出的不点、只把标题与按钮回报给调用方；`origin_status` 的 `dialogs` 字段可随时看 Origin 正卡在哪个框上。

`origin_idle.py` 与 `origin_dialogs.py` 是**本插件新增**，`NOTICE.md` 亦为本包添加；其余 22 个文件仍为上游快照。

除以上四点，工具行为与上游一致。改动只发生在「我们这层」的入口/版本字段，上游 `LICENSE` 与版权行原样保留。

## 逐文件 sha256

| 文件 | 字节 | sha256 |
|---|---:|---|
| `LICENSE` | 1089 | `25b226215eee85a94b0428740196b81e8ceaf24ed8ce3d69c7173ea045d956de` |
| `NOTICE.md` | 2302 | `05e28e197283477d900dd3def85c9b90c1aa994402ee2cbd4dfdaeca8840b056` |
| `origin_analysis.py` | 10840 | `a0340aa72d9e6070243e6b6eaa3cf87f2e18b1b4b422883ff6a3d6a14b6745d8` |
| `origin_annotate.py` | 15823 | `df74072cd82c500e67911d2fad78cbe02c9d8aac1daab836c4a2b2f5def2ed20` |
| `origin_bridge.py` | 8310 | `d1ffeb82b4b3d0b056acdedac90fd86f17b62201ec1de85c92bc7d683774031b` |
| `origin_capabilities.py` | 15141 | `01d00a8c963224e7309385277ed8eeb86184a58c3758721149bd88700fd3b5b9` |
| `origin_edit.py` | 46512 | `4f162a79f1663899154f733cc1b8723aad4b8976d81755abe9ce3adde5f85464` |
| `origin_e2e.py` | 19140 | `b5149b8df5dbb4e6e35381b79f9b13cb1ba1abe90040fd5b2d1e6b0eb6433530` |
| `origin_engine.py` | 267466 | `66894bc58dbc14a53844d52ce60877113834f65757efea4744189b884567446f` |
| `origin_errors.py` | 20619 | `9215ef767ac80e4a87aaa46e3793002f926f6c55614432a4c98caea33b9a2605` |
| `origin_fileio.py` | 11652 | `95b454edb99353319d3a0c4dfd1687b829ca9d9af4ee02d6bd7352e7caf8c201` |
| `origin_gallery.py` | 3684 | `33803c0bccd6256297b39998222877cdf5ac2f63301066b1613493ac8aa2d339` |
| `origin_idle.py` | 6386 | `4f6afcab5d639a2ea57546ca24088d8a2ba0192f041fae8c47bec8cd0a1a8de2` |
| `origin_matrix.py` | 5789 | `ebd8a582e37dd3b415f45b4636a2f8b72637b4be34155de8634bde933e05139d` |
| `origin_mcp_http.py` | 15725 | `fed3c2ea96d8c59948aee9938f03620544c1c4c6a88287d55928447b51db4f61` |
| `origin_mcp_server.py` | 104658 | `f1b939a724d97f5301545980ed9973738e14aee2dbac736047f6cf8d8b6256bc` |
| `origin_mcp_stdio.py` | 4744 | `5feb225e958bfb6a8c8e09d3688bb586a942677843dfb9618dffb9f384b6ecf7` |
| `origin_plan.py` | 14338 | `e841c27531863e1621538bc727f29dacbbeb7fced4909e3fa31133d448ff51c3` |
| `origin_proof.py` | 8673 | `688e1db3f5acd0f763a47ee35687773ad9fcbaa78a9fe016aa71d91e3f8cd4e1` |
| `origin_spec.py` | 6434 | `b23067bafff308c6a66fe0759dff5667408a8a0c267407678be107e5bbf590d4` |
| `origin_template.py` | 24950 | `ecd2240b22d0b101da49a286e0f950cfa82fbcc0329e9041027d6d5c61e8978e` |
| `origin_verify.py` | 16151 | `ce87c0ca8c055f990d60982a03d014d64a78bf28c6fc6bc28be13498f1505140` |
| `plot_style.py` | 20233 | `6be5048f0a0cdc1ae5af60fae08c8f4dc651bd2a7cc95f483842d179f48b5c87` |
| `requirements.txt` | 137 | `2b35102440e9abccdecd01d33f57d45be900d635c63429190e5f5a5ba59337ac` |
| `origin_dialogs.py` | 8258 | `651cb9bcdaf9f6e63e4bf5e6b085577038519ee045ea28b246fb5cd050d88878` |

## 升级方式

随包 = **冻结快照**：原作者更新不会自动进来，也不会覆盖我们。要跟进：

```bash
node scripts/vendor_sync.mjs --from <新上游目录或 .tgz>
```

脚本只打印差异（新增/缺失/内容不同 + 各自 sha256），**不写盘、不联网**；确认要合并时再人工落文件，并同步更新本文件的哈希表与 fork commit。
