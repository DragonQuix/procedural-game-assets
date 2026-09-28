/**
 * tools/gallery/server.mjs — 画廊开发服务器（只绑回环，防目录穿越）
 *
 * 静态文件只服务本目录下的 index.html / app.js / style.css；
 * 资产数据只读 <dir> 下的 *.asset.json（文件名白名单字符）。
 */
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const STATIC_DIR = dirname(fileURLToPath(import.meta.url));
const STATIC = new Set(['/', '/index.html', '/app.js', '/style.css']);
const ASSET_NAME = /^[\w.-]+\.asset\.json$/;

export async function startGalleryServer({ dir, port = 47840, host = '127.0.0.1' }) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${host}:${port}`);
      const path = url.pathname; // URL 路径不做 OS 规范化；路由全部为精确匹配
      if (path.includes('..')) {
        res.writeHead(404).end('not found');
        return;
      }
      if (path === '/assets') {
        const files = (await readdir(dir)).filter((f) => ASSET_NAME.test(f));
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify(files.map((f) => f.replace(/\.asset\.json$/, ''))));
        return;
      }
      const assetMatch = path.match(/^\/asset\/([\w.-]+)$/);
      if (assetMatch) {
        const file = `${assetMatch[1]}.asset.json`;
        if (!ASSET_NAME.test(file)) {
          res.writeHead(400).end('bad asset name');
          return;
        }
        try {
          const data = await readFile(join(dir, file));
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
          res.end(data);
        } catch {
          res.writeHead(404).end('not found');
        }
        return;
      }
      if (STATIC.has(path)) {
        const file = path === '/' ? 'index.html' : path.slice(1);
        const ext = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : 'text/css';
        const data = await readFile(join(STATIC_DIR, file));
        res.writeHead(200, { 'content-type': `${ext}; charset=utf-8`, 'cache-control': 'no-store' });
        res.end(data);
        return;
      }
      res.writeHead(404).end('not found');
    } catch (e) {
      res.writeHead(500).end(String(e.message ?? e));
    }
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, host, resolveListen);
  });
  return server;
}
