/**
 * Shared image pipeline for the Facebook syncs (drops + community wall).
 *
 * Facebook CDN links expire after a few weeks, so every image the site shows
 * is copied into a public Supabase bucket as a compact WebP. Rules:
 *   - an image already cached as WebP is reused, never re-downloaded
 *   - a working cached image is never replaced by a dead link
 *   - a missing image is re-fetched from the post itself (fresh CDN link)
 */

import sharp from 'sharp';
import { FB_GRAPH_VERSION } from './fb-post-utils.js';

sharp.cache(false);

export const MAX_SIDE = 960; // site shows these at ≤ ~480 CSS px (2x screens)
export const THUMB_SIDE = 200; // wall tiles render at ~56–120 CSS px

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; BaiaSync/2.0)' };

/** True when `url` already points at a WebP in this bucket. */
export function isCachedWebp(url, bucket) {
  return typeof url === 'string' && url.includes(`/${bucket}/`) && /\.webp(\?|$)/.test(url);
}

/** Download an image; null on any failure (expired link, non-image, network). */
export async function fetchImage(url) {
  if (typeof url !== 'string' || !url.startsWith('http')) return null;
  try {
    const res = await fetch(url, { headers: UA });
    if (!res.ok || !/^image\//.test(res.headers.get('content-type') || 'image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

/** First source that downloads successfully. */
export async function firstImage(urls) {
  for (const url of urls) {
    const buf = await fetchImage(url);
    if (buf) return buf;
  }
  return null;
}

export function toWebp(buffer, maxSide = MAX_SIDE, quality = 76) {
  return sharp(buffer)
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .webp({ quality, effort: 5 })
    .toBuffer();
}

/** Upload a WebP buffer as `${name}.webp`; returns its public URL or null. */
export async function uploadWebp(supabase, bucket, name, webp) {
  const fileName = `${name}.webp`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(fileName, webp, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' });
  if (error) return null;
  return supabase.storage.from(bucket).getPublicUrl(fileName).data.publicUrl;
}

export const safeName = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, '_');

// --- Fresh image straight from the post (repairs expired links) -------------

const pageTokens = new Map();

async function pageTokenFor(pageId, token) {
  if (!pageTokens.has(pageId)) {
    let resolved = token;
    try {
      const res = await fetch(`https://graph.facebook.com/${FB_GRAPH_VERSION}/${encodeURIComponent(pageId)}?fields=access_token&access_token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (data?.access_token) resolved = data.access_token;
    } catch {
      // keep the original token
    }
    pageTokens.set(pageId, resolved);
  }
  return pageTokens.get(pageId);
}

/** Current image URL for a post (its first photo), or null. */
export async function freshPostImageUrl(postId, pageId, token) {
  if (!token || !postId) return null;
  try {
    const pageToken = await pageTokenFor(pageId, token);
    const fields = 'full_picture,attachments{media{image{src}},subattachments{media{image{src}}}}';
    const res = await fetch(`https://graph.facebook.com/${FB_GRAPH_VERSION}/${encodeURIComponent(postId)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(pageToken)}`);
    const data = await res.json();
    const att = data?.attachments?.data?.[0];
    return att?.subattachments?.data?.[0]?.media?.image?.src || att?.media?.image?.src || data?.full_picture || null;
  } catch {
    return null;
  }
}

/** Basename of a storage URL ("…/drops-cache/drop_1.webp?x" → "drop_1.webp"). */
export const storageName = (url) => (typeof url === 'string' ? url.split('?')[0].split('/').pop() : null);
