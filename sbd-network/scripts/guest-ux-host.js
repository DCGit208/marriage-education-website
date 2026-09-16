/**
 * Local Hosting stand-in for guest UX verification.
 * Mirrors sbd-network/firebase.json cleanUrls + redirects for the public tree.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PUBLIC = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT || 4177);

const REDIRECTS = {
  '/': { dest: '/dashboard', status: 302 },
  '/index': { dest: '/dashboard', status: 302 },
  '/index.html': { dest: '/dashboard', status: 302 },
  '/paywall-demo': { dest: '/dashboard', status: 301 },
  '/paywall-demo.html': { dest: '/dashboard', status: 301 },
  '/video-preview-demo': { dest: '/dashboard', status: 301 },
  '/video-preview-demo.html': { dest: '/dashboard', status: 301 },
  '/dashboard-old': { dest: '/dashboard', status: 301 },
  '/dashboard-old.html': { dest: '/dashboard', status: 301 },
  '/mv-house-OLD-BACKUP': { dest: '/dashboard', status: 301 },
  '/mv-house-OLD-BACKUP.html': { dest: '/dashboard', status: 301 },
};

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);

  const redirect = REDIRECTS[pathname];
  if (redirect) {
    send(res, redirect.status, { Location: redirect.dest, 'Cache-Control': 'no-store' });
    return;
  }

  if (!path.extname(pathname)) {
    const htmlPath = path.join(PUBLIC, pathname.replace(/\/+$/, '') + '.html');
    if (fs.existsSync(htmlPath) && fs.statSync(htmlPath).isFile()) {
      pathname += '.html';
    }
  }

  const filePath = path.normalize(path.join(PUBLIC, pathname));
  if (!filePath.startsWith(PUBLIC)) {
    send(res, 403, { 'Content-Type': 'text/plain' }, 'Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    send(res, 404, { 'Content-Type': 'text/html; charset=utf-8' }, '<h1>Page Not Found</h1>');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  send(res, 200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' }, fs.readFileSync(filePath));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Guest UX host http://127.0.0.1:${PORT}`);
});
