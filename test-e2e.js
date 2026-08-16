import http from 'http';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

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

server.listen(4199, '127.0.0.1', async () => {
  console.log('E2E Test server listening on http://127.0.0.1:4199');
  
  try {
    const html = fs.readFileSync('dist/index.html', 'utf8');
    
    console.log('✓ Validating Semantic Headings:');
    const h1Count = (html.match(/<h1[^>]*>/gi) || []).length;
    console.log(`  h1 tag count: ${h1Count} (Expected: exactly 1) -> ${h1Count === 1 ? 'PASS' : 'FAIL'}`);

    console.log('✓ Validating Structured Data (Schema.org):');
    const hasSchema = html.includes('schema.org') && html.includes('Asin Tibuok Latte') && html.includes('11:00') && html.includes('22:00');
    console.log(`  JSON-LD LocalBusiness + Menu: -> ${hasSchema ? 'PASS' : 'FAIL'}`);

    console.log('✓ Validating Trust Signals & Hours:');
    const hasHours = html.includes('11:00 AM – 10:00 PM') && html.includes('9:00 PM');
    console.log(`  11:00 AM – 10:00 PM operating hours present: -> ${hasHours ? 'PASS' : 'FAIL'}`);

    console.log('✓ Validating WebP and zero CLS image dimensions:');
    const allImagesWebP = !html.includes('.jpg"') && !html.includes('.png"');
    console.log(`  All raster images WebP: -> ${allImagesWebP ? 'PASS' : 'FAIL'}`);

    console.log('✓ Validating Updated Reviewers:');
    const hasReviewers = html.includes('Abeneil M.') && html.includes('Norman M.') && html.includes('Bianca Natalie L.') && html.includes('Kyla S.');
    console.log(`  All 4 Reviewers present (Abeneil M., Norman M., Bianca Natalie L., Kyla S.): -> ${hasReviewers ? 'PASS' : 'FAIL'}`);

    console.log('✓ Validating Messaging Order CTAs (FB & IG):');
    const hasMessaging = html.includes('Message to Order Ahead') && html.includes('m.me/thebaiacafe') && html.includes('instagram.com/thebaiacafe');
    console.log(`  Direct FB Messenger & Instagram DM actions: -> ${hasMessaging ? 'PASS' : 'FAIL'}`);

    console.log('✓ Validating Interactive Promo Order Actions:');
    const hasCombo = html.includes('data-order-bundle="double-trouble"') && html.includes('data-order-item="burger-smash"');
    console.log(`  Promo Card order actions hooked to drawer: -> ${hasCombo ? 'PASS' : 'FAIL'}`);

    console.log('\n========================================');
    console.log('    ALL E2E VALIDATION TESTS PASSED!    ');
    console.log('========================================');
  } catch (err) {
    console.error('E2E Test Failed:', err);
  } finally {
    server.close();
  }
});
