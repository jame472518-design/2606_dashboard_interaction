import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listTenants } from './tenants.js';
import { answer } from './orchestrator.js';
import { loadGlobal } from './config.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'content-type': type });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { return {}; }
}

async function serveStatic(res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/') rel = '/web/home/index.html';
  if (rel.startsWith('/chat')) rel = '/web/chat/index.html';
  const full = path.normalize(path.join(REPO, rel));
  if (!full.startsWith(path.join(REPO, 'web')) && !full.startsWith(path.join(REPO, 'tenants'))) {
    return send(res, 403, { error: 'forbidden' });
  }
  try {
    if ((await stat(full)).isDirectory()) return send(res, 404, { error: 'not found' });
    const buf = await readFile(full);
    return send(res, 200, buf, MIME[path.extname(full)] || 'application/octet-stream');
  } catch { return send(res, 404, { error: 'not found' }); }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (req.method === 'GET' && url.pathname === '/api/tenants') {
        const g = await loadGlobal();
        let tenants = await listTenants();
        if (g.mode === 'single' && g.active_tenant) {
          tenants = tenants.filter(t => t.name === g.active_tenant);
        }
        return send(res, 200, { mode: g.mode, active_tenant: g.active_tenant || null, tenants });
      }
      if (req.method === 'POST' && url.pathname === '/api/chat') {
        const { tenant, message, history, lang } = await readBody(req);
        if (!tenant || !message) return send(res, 400, { error: 'tenant 與 message 為必填' });
        const result = await answer({ tenantName: tenant, message, history, lang });
        return send(res, 200, result);
      }
      return serveStatic(res, url.pathname);
    } catch (e) {
      return send(res, 500, { error: String(e?.message || e) });
    }
  });
}

// Cross-platform CLI guard (works on Windows where file:// URI != process.argv[1] path)
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const g = await loadGlobal();
  const port = g.server?.port || 8080;
  createServer().listen(port, () =>
    console.log(`Kiosk 平台啟動 → http://localhost:${port}  (mode=${g.mode})`),
  );
}
