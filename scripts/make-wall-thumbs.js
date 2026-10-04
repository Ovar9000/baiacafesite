#!/usr/bin/env node
/**
 * Generate small WebP thumbnails for the coffee-cup photowall and point the
 * static wall tiles in index.html at them.
 *
 *   npm run thumbs:wall
 *
 * - Thumbs every photo used by a `.mosaic-photo-img` tile in index.html, plus
 *   everything in public/images/community (so runtime-hydrated cards find one).
 * - Skips thumbs that already exist and are newer than their source.
 * - Rewrites only tile `<img src>`; `data-photo` (lightbox) stays full-size.
 * - Safe to re-run.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { thumbPathFor, THUMB_WIDTH } from '../src/utils/wallThumbs.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const INDEX = path.join(ROOT, 'index.html');

const toDiskPath = (urlPath) => path.join(PUBLIC, decodeURIComponent(urlPath).replace(/^\//, ''));

/** Create the thumb for one local /images/... URL. Returns the thumb URL or null. */
export async function makeWallThumb(photoUrl) {
  const thumbUrl = thumbPathFor(photoUrl);
  if (!thumbUrl) return null;
  const src = toDiskPath(photoUrl.replace(/^\.\//, '/'));
  const dest = toDiskPath(thumbUrl);
  if (!fs.existsSync(src)) return null;
  if (fs.existsSync(dest) && fs.statSync(dest).mtimeMs >= fs.statSync(src).mtimeMs) {
    return thumbUrl;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await sharp(src)
    .rotate() // respect EXIF orientation from phone photos
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: 70 })
    .toFile(dest);
  return thumbUrl;
}

const TILE_IMG = /(<img\s+src=")([^"]+)("[^>]*class="mosaic-photo-img")/g;

async function main() {
  let html = fs.readFileSync(INDEX, 'utf-8');

  const sources = new Set();
  for (const m of html.matchAll(TILE_IMG)) sources.add(m[2]);
  const communityDir = path.join(PUBLIC, 'images', 'community');
  if (fs.existsSync(communityDir)) {
    for (const f of fs.readdirSync(communityDir)) {
      if (/\.(jpe?g|png|webp)$/i.test(f)) sources.add(`/images/community/${f}`);
    }
  }

  const made = new Map();
  let srcBytes = 0;
  let thumbBytes = 0;
  for (const url of sources) {
    if (url.startsWith('/images/thumbs/')) continue;
    const thumb = await makeWallThumb(url);
    if (!thumb) continue;
    made.set(url, thumb);
    srcBytes += fs.statSync(toDiskPath(url)).size;
    thumbBytes += fs.statSync(toDiskPath(thumb)).size;
  }

  let rewritten = 0;
  html = html.replace(TILE_IMG, (all, pre, url, post) => {
    const thumb = made.get(url);
    if (!thumb) return all;
    rewritten++;
    return `${pre}${thumb}${post}`;
  });
  fs.writeFileSync(INDEX, html, 'utf-8');

  const kb = (n) => `${Math.round(n / 1024)} KB`;
  console.log(`Thumbs ready: ${made.size} (${kb(srcBytes)} of originals -> ${kb(thumbBytes)})`);
  console.log(`index.html tiles pointed at thumbs: ${rewritten}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
