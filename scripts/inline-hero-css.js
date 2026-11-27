#!/usr/bin/env node
/**
 * Copy src/styles/hero.css, minified, into index.html's critical <style>
 * (after the "Hero (copy of src/styles/hero.css ...)" marker), so the hero
 * paints before main.css loads.
 *
 *   npm run hero:inline
 *
 * Run it after every change to hero.css. Safe to re-run.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = path.join(ROOT, 'index.html');
const MARKER = '/* Hero (copy of src/styles/hero.css, minified; keep them in step) */';

const css = fs
  .readFileSync(path.join(ROOT, 'src/styles/hero.css'), 'utf-8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s*\n\s*/g, ' ')
  .replace(/\s*([{};,])\s*/g, '$1')
  .replace(/;}/g, '}')
  .trim();

const html = fs.readFileSync(INDEX, 'utf-8');
const nl = html.includes('\r\n') ? '\r\n' : '\n';
const start = html.indexOf(MARKER);
const end = start === -1 ? -1 : html.indexOf('</style>', start);
if (start === -1 || end === -1) {
  console.error('inline-hero-css: marker not found in index.html');
  process.exit(1);
}

fs.writeFileSync(INDEX, html.slice(0, start) + MARKER + nl + css + nl + html.slice(end), 'utf-8');
console.log(`Hero critical CSS inlined (${css.length} chars)`);
