#!/usr/bin/env node
/**
 * Minimal dev server for ETF Portfolio Optimizer.
 * - Serves index.html and static files from the project root.
 * - Proxies GET /api/yf/{ticker}?... → query1.finance.yahoo.com, bypassing browser CORS.
 *
 * Usage: node server.js   (or: npm start)
 */

import http  from 'http';
import https from 'https';
import { createReadStream, existsSync } from 'fs';
import { join, extname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.txt':  'text/plain',
  '.csv':  'text/csv',
};

function proxyYahooFinance(req, res) {
  const url    = new URL(req.url, `http://localhost:${PORT}`);
  const ticker = url.pathname.replace('/api/yf/', '');
  if (!ticker || ticker.includes('/')) { res.writeHead(400); res.end(); return; }

  const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?${url.searchParams}`;

  const yfReq = https.get(yfUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (yfRes) => {
    res.writeHead(yfRes.statusCode ?? 502, { 'Content-Type': 'application/json' });
    yfRes.pipe(res);
  });
  yfReq.on('error', (err) => {
    res.writeHead(502);
    res.end(JSON.stringify({ error: err.message }));
  });
}

function serveStatic(req, res) {
  const url      = new URL(req.url, `http://localhost:${PORT}`);
  const rel      = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = resolve(join(__dirname, rel));

  if (!filePath.startsWith(__dirname) || !existsSync(filePath)) {
    res.writeHead(404); res.end(); return;
  }

  res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
}

http.createServer((req, res) => {
  if (req.method === 'GET' && req.url.startsWith('/api/yf/')) {
    proxyYahooFinance(req, res);
  } else if (req.method === 'GET') {
    serveStatic(req, res);
  } else {
    res.writeHead(405); res.end();
  }
}).listen(PORT, () => {
  console.log(`ETF Portfolio Optimizer → http://localhost:${PORT}`);
});
