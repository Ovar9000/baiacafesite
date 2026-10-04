/**
 * BAIA Cafe — Community Photowall (coffee-cup mosaic)
 *
 * The cup shape lives in src/utils/wallLayout.js: a fixed list of slots that
 * cards fill in DOM order. This module:
 *   1. lays out the static cards from index.html immediately, then
 *   2. once the wall is near the viewport, fetches fresh photos
 *      (Supabase `community_wall` first, `public/data/community-reviews.json`
 *      as fallback), prepends the new ones and re-lays out. The newest photos
 *      take the central slots; the oldest drop off the end, so the cup never
 *      changes shape and cards never stack.
 *
 * Card markup contract MUST stay in sync with
 * `scripts/fb-post-utils.js` `buildCommunityCardHTML` (tests enforce it).
 */

import { escapeHtml, sanitizeUrl } from '../utils/sanitize.js';
import { thumbPathFor } from '../utils/wallThumbs.js';
import { applyWallLayout } from '../utils/wallLayout.js';
import { whenNear } from '../utils/whenNear.js';

const COMMUNITY_JSON_URL = '/data/community-reviews.json';
const MAX_HYDRATED_CARDS = 8;

export function buildCommunityCardHTML(item) {
  const photo = String(item.photo_url || '');
  // Tile shows a small local WebP when one exists; the lightbox keeps the full photo.
  const tile = thumbPathFor(photo) || photo;
  // Show only what was actually posted; no placeholder praise or names.
  const quote = String(item.caption || '');
  const author = String(item.guest_name || 'Shared on Facebook');
  const meta = `${item.date || 'Recently'} • ${item.tagline || 'Shared on Facebook'}`;
  const permalink = item.permalink || 'https://www.facebook.com/thebaiacafe';

  // Position/rotation are applied by applyWallLayout() from the card's index.
  // data-wall-id lets hydration dedupe by stable id across sources
  // (Supabase bucket URLs vs local /images paths for the same photo).
  return (
    `<button type="button" class="mosaic-photo-card"` +
    ` data-wall-id="${escapeHtml(item.id || '')}" data-photo="${escapeHtml(photo)}" data-quote="${escapeHtml(quote)}" data-author="${escapeHtml(author)}" data-meta="${escapeHtml(meta)}"` +
    ` data-permalink="${escapeHtml(sanitizeUrl(permalink, 'https://www.facebook.com/thebaiacafe'))}"` +
    ` data-community-hydrated="1" aria-label="View photo by ${escapeHtml(author)}">` +
    `<div class="mosaic-photo-frame">` +
    `<img src="${escapeHtml(tile)}" alt="BAIA Family guest photo" class="mosaic-photo-img" loading="lazy" />` +
    `</div></button>`
  );
}

function isUsablePhoto(url) {
  if (typeof url !== 'string') return false;
  const t = url.trim();
  return t.startsWith('/') || t.startsWith('./') || t.startsWith('https://');
}

// Live source: Supabase rows carry the same field shape as the JSON fallback.
// Null = fall through to JSON.
async function fetchWallFromSupabase() {
  try {
    const { supabase } = await import('../lib/supabaseClient.js');
    const { data, error } = await supabase
      .from('community_wall')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(16);
    if (!error && Array.isArray(data) && data.length > 0) return data;
  } catch {
    // Offline / missing env / table not migrated yet → JSON fallback below.
  }
  return null;
}

async function fetchWallFromJson(fetchImpl) {
  try {
    const res = await fetchImpl(COMMUNITY_JSON_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    const items = await res.json();
    return Array.isArray(items) && items.length > 0 ? items : null;
  } catch {
    return null;
  }
}

export async function hydrateCommunityWall(fetchImpl = fetch) {
  const cup = document.querySelector('.baia-coffee-cup');
  if (!cup) return { added: 0, reason: 'no-wall' };

  const fromDb = await fetchWallFromSupabase();
  const items = fromDb || (await fetchWallFromJson(fetchImpl));
  const source = fromDb ? 'hydrated-supabase' : 'hydrated-json';
  if (!items) return { added: 0, reason: 'empty' };

  // Match on data-photo, tile src and data-wall-id, so the same photo under
  // another URL form (bucket vs local) isn't duplicated across sources.
  const existingPhotos = new Set();
  const existingIds = new Set();
  cup.querySelectorAll('.mosaic-photo-card').forEach((card) => {
    if (card.dataset.photo) existingPhotos.add(card.dataset.photo);
    if (card.dataset.wallId) existingIds.add(card.dataset.wallId);
    const src = card.querySelector('img')?.getAttribute('src');
    if (src) existingPhotos.add(src);
  });

  const fresh = items
    .filter(
      (item) =>
        item &&
        isUsablePhoto(item.photo_url) &&
        !existingPhotos.has(item.photo_url) &&
        !(item.id != null && existingIds.has(String(item.id)))
    )
    .slice(0, MAX_HYDRATED_CARDS);

  if (fresh.length === 0) return { added: 0, reason: 'up-to-date' };

  const frag = document.createElement('div');
  frag.innerHTML = fresh.map((item) => buildCommunityCardHTML(item)).join('');
  // A thumb not generated yet (photo synced but `npm run thumbs:wall` not
  // run) falls back to the full photo instead of showing a broken tile.
  frag.querySelectorAll('.mosaic-photo-img').forEach((img) => {
    img.addEventListener('error', () => {
      const full = img.closest('.mosaic-photo-card')?.dataset.photo;
      if (full && img.getAttribute('src') !== full) img.src = full;
    }, { once: true });
  });
  // Prepend newest-first so fresh moments take the central slots.
  const cards = Array.from(frag.children);
  for (let i = cards.length - 1; i >= 0; i--) {
    cup.insertBefore(cards[i], cup.firstChild);
  }
  applyWallLayout(cup);
  return { added: fresh.length, reason: source };
}

export function initCommunityWall() {
  const cup = document.querySelector('.baia-coffee-cup');
  if (!cup) return Promise.resolve({ added: 0, reason: 'no-wall' });
  applyWallLayout(cup);

  // Fetching pulls in the Supabase client, so wait until the wall is near.
  // Fire-and-forget: the static wall works even when offline.
  // The promise is exposed for tests / debugging.
  const done = new Promise((resolve) => {
    whenNear(cup, () => {
      hydrateCommunityWall().catch(() => ({ added: 0, reason: 'error' })).then(resolve);
    });
  });
  if (typeof window !== 'undefined') window.__BAIA_COMMUNITY_HYDRATED = done;
  return done;
}
