import http from 'http';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2'
};

const distDir = path.resolve('dist');

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(distDir, reqPath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const acceptEncoding = req.headers['accept-encoding'] || '';

    const headers = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable'
    };

    const isCompressible = ['.html', '.css', '.js', '.json', '.svg', '.xml', '.txt'].includes(ext);

    if (isCompressible && acceptEncoding.includes('gzip')) {
      headers['Content-Encoding'] = 'gzip';
      res.writeHead(200, headers);
      const raw = fs.createReadStream(filePath);
      const gzip = zlib.createGzip({ level: 9 });
      raw.pipe(gzip).pipe(res);
    } else {
      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(res);
    }
  });
});

server.listen(4173, '127.0.0.1', async () => {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = await chromeLauncher.launch({
    chromePath: chromePath,
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu']
  });

  const url = 'http://127.0.0.1:4173/';
  const result = await lighthouse(url, {
    port: chrome.port,
    output: 'json',
    formFactor: 'desktop',
    screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1 }
  });

  console.log('--- Desktop Layout Shifts Details ---');
  for (const item of (result.lhr.audits['layout-shifts']?.details?.items || [])) {
    console.log(`Score: ${item.score}, node:`, item.node?.snippet || item.node?.selector);
  }

  console.log('\n--- Color Contrast Details ---');
  for (const item of (result.lhr.audits['color-contrast']?.details?.items || [])) {
    console.log(`Contrast issue: ${item.node?.snippet || item.node?.selector}`, item.explanation);
  }

  console.log('\n--- Label Name Mismatch Details ---');
  for (const item of (result.lhr.audits['label-content-name-mismatch']?.details?.items || [])) {
    console.log(`Label mismatch: ${item.node?.snippet || item.node?.selector}`, item.nodeLabel);
  }

  await chrome.kill();
  server.close();
});
