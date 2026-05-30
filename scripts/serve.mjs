// Tiny static server over web/ — reused by `npm run serve`, the Playwright config,
// and the screenshot generator. No deps.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";

const web = fileURLToPath(new URL("../web/", import.meta.url));
const CT = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };

export function serveWeb(port = 3000) {
  const server = createServer((req, res) => {
    const path = req.url.split("?")[0];
    const file = web + (path === "/" ? "index.html" : path.replace(/^\//, ""));
    if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end("404"); }
    res.writeHead(200, { "content-type": CT[extname(file)] || "text/plain" });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.PORT || 3000;
  serveWeb(port).then(() => console.log(`serving web/ at http://127.0.0.1:${port}`));
}
