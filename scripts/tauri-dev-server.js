// Serves the copied static frontend for `tauri dev`.
const fs = require('fs');
const http = require('http');
const path = require('path');

require('./build-tauri-assets');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist-tauri');
const host = '127.0.0.1';
const port = Number(process.env.TAURI_DEV_PORT || 1450);

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function resolveAssetPath(requestUrl) {
  const parsed = new URL(requestUrl, `http://${host}:${port}`);
  const pathname = decodeURIComponent(parsed.pathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const target = path.resolve(distDir, relativePath);
  const relativeToDist = path.relative(distDir, target);

  if (relativeToDist.startsWith('..') || path.isAbsolute(relativeToDist)) {
    return null;
  }

  return target;
}

const server = http.createServer((req, res) => {
  if (!req.url || req.method !== 'GET') {
    res.writeHead(405).end('Method Not Allowed');
    return;
  }

  const target = resolveAssetPath(req.url);
  if (!target) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(target, (statError, stats) => {
    if (statError || !stats.isFile()) {
      res.writeHead(404).end('Not Found');
      return;
    }

    const contentType = mimeTypes[path.extname(target).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(target).pipe(res);
  });
});

server.listen(port, host, () => {
  console.log(`Tauri dev assets serving at http://${host}:${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
