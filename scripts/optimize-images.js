#!/usr/bin/env node
/**
 * Re-encode the site's own photos to the size they are actually displayed at.
 *
 *   npm run images:optimize
 *
 * Every content photo is shown at ≤ ~480 CSS px, so a 960px box covers 2x
 * screens. When a higher-quality original (.jpg/.png) sits next to the .webp,
 * it is used as the source so photos are never re-compressed from a lossy
 * copy. Safe to re-run: files already within limits are left alone.
 * To add a new photo: drop it in public/images (any size/format sharp reads),
 * run this, and reference the .webp it produces.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Read inputs into memory and disable sharp's file cache: on Windows a cached
// handle on the source blocks overwriting it in place.
sharp.cache(false);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'public', 'images');

const MAX_SIDE = 960;
const QUALITY = 76;
// Wide banners shown larger than a card.
const SIDE_OVERRIDES = { 'Cottage rental': 1200 };
// Logos, icons and brand glyphs are already tiny; never touch them.
const SKIP = /^(baia-|Logo|favicon)/i;
const INPUT = /\.(webp|jpe?g|png)$/i;

const ORIGINAL_EXT = ['.jpg', '.jpeg', '.png'];

async function optimize(base, files) {
  const out = path.join(DIR, `${base}.webp`);
  const maxSide = SIDE_OVERRIDES[base] || MAX_SIDE;
  const original = ORIGINAL_EXT.map((ext) => `${base}${ext}`).find((f) => files.has(f));
  const hasWebp = files.has(`${base}.webp`);

  if (!original) {
    // Only a webp exists: resize it only if it is larger than needed.
    // (Re-encoding an already-sized lossy webp would just lose quality.)
    if (!hasWebp) return null;
    const input = fs.readFileSync(out);
    const meta = await sharp(input).metadata();
    if (Math.max(meta.width, meta.height) <= maxSide) return null;
    return encode(base, input, out, maxSide, input.length);
  }
  const input = fs.readFileSync(path.join(DIR, original));
  const before = hasWebp ? fs.statSync(out).size : input.length;
  return encode(base, input, out, maxSide, before);
}

async function encode(base, input, out, maxSide, beforeBytes) {
  const buffer = await sharp(input)
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: 6 })
    .toBuffer();
  fs.writeFileSync(out, buffer);
  const after = await sharp(buffer).metadata();
  return { file: `${base}.webp`, before: Math.round(beforeBytes / 1024), after: Math.round(buffer.length / 1024), dims: `${after.width}x${after.height}` };
}

const results = [];
const files = new Set(fs.readdirSync(DIR));
const bases = [...new Set([...files].filter((f) => INPUT.test(f) && !SKIP.test(f)).map((f) => f.replace(INPUT, '')))].sort();
for (const base of bases) {
  const r = await optimize(base, files);
  if (r) results.push(r);
}
let saved = 0;
for (const r of results) {
  saved += r.before - r.after;
  console.log(`${String(r.before).padStart(4)} KB -> ${String(r.after).padStart(4)} KB  ${r.dims.padEnd(9)} ${r.file}`);
}
console.log(results.length ? `Optimized ${results.length} image(s), saved ${saved} KB.` : 'All images already optimized.');
