// 本地预览模板选择页：不装插件、不开 DSH 也能看页面与路由（开发/验收用，不进 npm 包）。
//   node test/preview.mjs            → 随机端口
//   PORT=7788 node test/preview.mjs  → 固定端口
import { createServer } from "node:http";

import { createRoutes, resolveTemplatesDir, selectionPath } from "../lib/templates.js";

const port = Number(process.env.PORT || 0);
const templatesDir = resolveTemplatesDir(process.env);
const handler = createRoutes({ env: process.env, log: (m) => console.error(`preview: ${m}`) });
const server = createServer((req, res) => {
  // 模拟宿主 seam：handler 返回 undefined = 不是我的路径，交给下一个 handler（这里就回 404）。
  Promise.resolve(handler(req, res))
    .then((out) => {
      if (out === undefined && !res.headersSent && !res.writableEnded) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("host-fallthrough");
      }
    })
    .catch(() => {});
});

server.listen(port, "127.0.0.1", () => {
  const actual = server.address().port;
  console.log(`templates_dir: ${templatesDir ?? "(not found)"}`);
  console.log(`selection:     ${selectionPath(process.env)}`);
  console.log(`page:          http://127.0.0.1:${actual}/plot-clone/`);
});
