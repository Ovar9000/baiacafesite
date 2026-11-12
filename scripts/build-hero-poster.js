#!/usr/bin/env node
/**
 * The 3D page's poster (/3d/): the scene's first frame, as a still.
 *
 *   npm run hero:poster        (after `npm run hero:models`; needs Chrome)
 *
 * Starts the dev server, opens /3d/ with `?hero-poster` (heroScene.js
 * then renders the first frame at 2x on a transparent canvas, still, and
 * marks it ready) at a desktop and a phone size, and saves the canvas:
 *
 *   public/images/hero-3d/drinks-lg.webp   wide stage (side by side)
 *   public/images/hero-3d/drinks-sm.webp   phone stage (close together)
 *
 * The poster is what paints first, and what reduced data or no WebGL keep.
 * The stage's shape fixes the framing, so the poster lines up with the live
 * scene at any screen size. If the sizes printed change, update the <picture>
 * width/height in 3d/index.html.
 *
 * Chrome: CHROME_PATH, or the usual Windows / macOS / Linux install.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'images', 'hero-3d');

const SHOTS = [
  { name: 'lg', viewport: { width: 1440, height: 860, deviceScaleFactor: 1 }, maxWidth: 1600, quality: 82 },
  { name: 'sm', viewport: { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, maxWidth: 900, quality: 80 },
];

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error('Chrome not found: set CHROME_PATH');
  return found;
}

async function main() {
  const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5199, strictPort: false } });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: ['--enable-gpu', '--ignore-gpu-blocklist'],
  });
  try {
    fs.mkdirSync(OUT, { recursive: true });
    for (const shot of SHOTS) {
      const page = await browser.newPage();
      page.on('pageerror', (e) => console.warn(shot.name, e.message));
      await page.setViewport(shot.viewport);
      await page.goto(`${url}3d/?hero-poster`, { waitUntil: 'load' });
      await page.waitForSelector('canvas.hero-scene[data-ready]', { timeout: 120000 });
      const png = await page.$eval('canvas.hero-scene', (c) => c.toDataURL('image/png'));
      const file = path.join(OUT, `drinks-${shot.name}.webp`);
      const info = await sharp(Buffer.from(png.split(',')[1], 'base64'))
        .resize({ width: shot.maxWidth, withoutEnlargement: true })
        .webp({ quality: shot.quality, alphaQuality: 90, effort: 6 })
        .toFile(file);
      console.log(`drinks-${shot.name}.webp  ${info.width}×${info.height}  ${(info.size / 1024).toFixed(0)} KB`);
      await page.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
