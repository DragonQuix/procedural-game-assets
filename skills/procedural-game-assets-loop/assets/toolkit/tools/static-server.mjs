#!/usr/bin/env node
/**
 * tools/static-server.mjs — 极简静态服务器（只绑回环，防目录穿越）
 * 用法：node tools/static-server.mjs <dir> [port]
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] ?? '.');
const port = Number(process.argv[3] ?? 47850);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const abs = resolve(join(root, path));
    if (abs !== root && !abs.startsWith(root + sep)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const type = MIME[extname(abs).toLowerCase()];
    if (!type) {
      res.writeHead(404).end('not found');
      return;
    }
    const data = await readFile(abs);
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`静态服务：http://127.0.0.1:${port}/ （根目录 ${root}，Ctrl+C 停止）`));
