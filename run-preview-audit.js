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
  console.log('Optimized production server listening on http://127.0.0.1:4173');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = await chromeLauncher.launch({
    chromePath: chromePath,
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu']
  });

  const url = 'http://127.0.0.1:4173/';

  // 1. Mobile Audit (Standard Moto G Power emulation with 4G throttling)
  console.log('\n========================================');
  console.log('       RUNNING MOBILE AUDIT (390px)     ');
  console.log('========================================');
  const mobileResult = await lighthouse(url, {
    port: chrome.port,
    output: 'json',
    logLevel: 'error',
    formFactor: 'mobile',
    screenEmulation: {
      mobile: true,
      width: 390,
      height: 844,
      deviceScaleFactor: 2
    }
  });

  const mCat = mobileResult.lhr.categories;
  console.log(`  Performance:    ${Math.round(mCat.performance.score * 100)} / 100`);
  console.log(`  Accessibility:  ${Math.round(mCat.accessibility.score * 100)} / 100`);
  console.log(`  Best Practices: ${Math.round(mCat['best-practices'].score * 100)} / 100`);
  console.log(`  SEO:            ${Math.round(mCat.seo.score * 100)} / 100`);

  // 2. Desktop Audit (Standard Desktop preset with Cable/Desktop profile)
  console.log('\n========================================');
  console.log('      RUNNING DESKTOP AUDIT (1350px)    ');
  console.log('========================================');
  const desktopResult = await lighthouse(url, {
    port: chrome.port,
    output: 'json',
    logLevel: 'error',
    formFactor: 'desktop',
    screenEmulation: {
      mobile: false,
      width: 1350,
      height: 940,
      deviceScaleFactor: 1
    },
    throttling: {
      rttMs: 40,
      throughputKbps: 10240,
      cpuSlowdownMultiplier: 1,
      requestLatencyMs: 0,
      downloadThroughputKbps: 0,
      uploadThroughputKbps: 0
    }
  });

  const dCat = desktopResult.lhr.categories;
  console.log(`  Performance:    ${Math.round(dCat.performance.score * 100)} / 100`);
  console.log(`  Accessibility:  ${Math.round(dCat.accessibility.score * 100)} / 100`);
  console.log(`  Best Practices: ${Math.round(dCat['best-practices'].score * 100)} / 100`);
  console.log(`  SEO:            ${Math.round(dCat.seo.score * 100)} / 100`);

  await chrome.kill();
  server.close(() => {
    console.log('\nAudit complete! Server closed.');
  });
});
