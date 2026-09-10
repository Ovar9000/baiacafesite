/**
 * BAIA Cafe — Community Photowall Hydration
 *
 * Fresh shared/tagged guest photos reach the coffee-cup mosaic at runtime:
 *   1. Supabase `community_wall` table first (updated by the scheduled cron
 *      with zero redeploys — same pattern as drops).
 *   2. `public/data/community-reviews.json` fallback (offline / no backend).
 * New photos are prepended as `.mosaic-photo-card` cards with spread grid
 * slots so they join the collage instead of stacking.
 *
 * Card markup contract MUST stay in sync with
 * `scripts/fb-post-utils.js` `buildCommunityCardHTML` (tests enforce it).
 */

import { escapeHtml, sanitizeUrl } from '../utils/sanitize.js';

const COMMUNITY_JSON_URL = '/data/community-reviews.json';
const MAX_HYDRATED_CARDS = 8;

// Spread slots so runtime cards land on DIFFERENT cells instead of stacking.
// Desktop cup is 14 cols × 8 rows; mobile cup is 7 cols × 6 rows, so each card
// carries both coordinates (--gc/--gr + --mgc/--mgr). Rows with explicit
// gc/gr (e.g. future Supabase rows) keep their stored layout for stability.
const DESKTOP_SLOTS = [[3,2],[11,2],[6,3],[10,4],[4,5],[12,5],[7,6],[2,4]];
const MOBILE_SLOTS = [[2,2],[6,2],[4,3],[3,4],[5,4],[2,5],[6,5],[4,5]];
const SLOT_ROTS = ['-3deg','2.5deg','-2deg','3deg','-1.5deg','2deg','-2.5deg','1.5deg'];

export function wallSlot(index = 0) {
  const i = ((index % DESKTOP_SLOTS.length) + DESKTOP_SLOTS.length) % DESKTOP_SLOTS.length;
  return {
    gc: DESKTOP_SLOTS[i][0],
    gr: DESKTOP_SLOTS[i][1],
    mgc: MOBILE_SLOTS[i][0],
    mgr: MOBILE_SLOTS[i][1],
    rot: SLOT_ROTS[i],
    z: 4 + (i % 3),
  };
}

// --- Collision-free runtime placement --------------------------------------
// Magic coordinate lists can never stay in sync with the hand-placed static
// mosaic (any overlap = a "double stack"). Instead, hydration reads the
// occupied cells from the live DOM and only uses FREE cells, nearest the
// existing mass first so the mug silhouette grows organically.

export const DESKTOP_GRID = { cols: 14, rows: 8 };
export const MOBILE_GRID = { cols: 7, rows: 6 };

export function parseGridCoord(v) {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// entries: [{ gc, gr }] (already parsed or raw style values) → Set("gc,gr")
export function collectOccupiedCells(entries) {
  const occ = new Set();
  for (const e of entries || []) {
    const gc = parseGridCoord(e && e.gc);
    const gr = parseGridCoord(e && e.gr);
    if (gc && gr) occ.add(`${gc},${gr}`);
  }
  return occ;
}

// Free cells ordered by Manhattan distance to the nearest occupied cell
// (row-major tiebreak). Never returns an occupied cell — when the grid is
// full it returns fewer cells, and callers must render fewer, not stack.
export function rankFreeCells(cols, rows, occupied, count) {
  const scored = [];
  for (let gr = 1; gr <= rows; gr++) {
    for (let gc = 1; gc <= cols; gc++) {
      if (occupied.has(`${gc},${gr}`)) continue;
      let dist = gr * cols + gc;
      if (occupied.size > 0) {
        dist = Infinity;
        for (const key of occupied) {
          const sep = key.indexOf(',');
          const d =
            Math.abs(gc - Number(key.slice(0, sep))) +
            Math.abs(gr - Number(key.slice(sep + 1)));
          if (d < dist) dist = d;
        }
      }
      scored.push({ gc, gr, dist, order: gr * cols + gc });
    }
  }
  scored.sort((a, b) => a.dist - b.dist || a.order - b.order);
  return scored.slice(0, Math.max(0, count)).map((c) => [c.gc, c.gr]);
}

// Read effective coords from a wall container's current cards.
// Mobile cards use --mgc/--mgr when present, else fall back to --gc/--gr.
export function readContainerCells(container, mobile) {
  const entries = [];
  container.querySelectorAll('.mosaic-photo-card').forEach((card) => {
    const s = card.style;
    const gc = mobile
      ? s.getPropertyValue('--mgc') || s.getPropertyValue('--gc')
      : s.getPropertyValue('--gc');
    const gr = mobile
      ? s.getPropertyValue('--mgr') || s.getPropertyValue('--gr')
      : s.getPropertyValue('--gr');
    entries.push({ gc, gr });
  });
  return collectOccupiedCells(entries);
}

export function buildCommunityCardHTML(item, index = 0) {
  const photo = String(item.photo_url || '');
  const quote = String(item.caption || 'A warm beachside moment at BAIA Cafe.');
  const author = String(item.guest_name || 'BAIA Cafe Guest');
  const meta = `${item.date || 'Recently'} • ${item.tagline || 'Shared Community Moment'}`;
  const permalink = item.permalink || 'https://www.facebook.com/thebaiacafe';
  const slot = wallSlot(index);
  // Stored per-item layout (if any) wins — keeps Supabase-driven walls stable.
  const asGridNum = (v, fb) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : fb;
  };
  const gc = asGridNum(item.gc, slot.gc);
  const gr = asGridNum(item.gr, slot.gr);
  const mgc = asGridNum(item.mgc, slot.mgc);
  const mgr = asGridNum(item.mgr, slot.mgr);
  const rot = item.tilt || slot.rot;
  const z = asGridNum(item.z, slot.z);

  // Reuse the app's XSS-safe helpers for title/quote/meta text.
  // photo/permalink go through sanitizeUrl-equivalent logic for images below.
  // data-wall-id lets hydration dedupe by stable id across sources
  // (Supabase bucket URLs vs local /images paths for the same photo).
  return (
    `<button type="button" class="mosaic-photo-card" style="--gc: ${gc}; --gr: ${gr}; --mgc: ${mgc}; --mgr: ${mgr}; --rot: ${escapeHtml(rot)}; --z: ${z};"` +
    ` data-wall-id="${escapeHtml(item.id || '')}" data-photo="${escapeHtml(photo)}" data-quote="${escapeHtml(quote)}" data-author="${escapeHtml(author)}" data-meta="${escapeHtml(meta)}"` +
    ` data-permalink="${escapeHtml(sanitizeUrl(permalink, 'https://www.facebook.com/thebaiacafe'))}"` +
    ` data-community-hydrated="1" aria-label="View photo by ${escapeHtml(author)}">` +
    `<div class="mosaic-photo-frame">` +
    `<img src="${escapeHtml(photo)}" alt="BAIA Family guest photo" class="mosaic-photo-img" loading="lazy" />` +
    `</div></button>`
  );
}

function isUsablePhoto(url) {
  if (typeof url !== 'string') return false;
  const t = url.trim();
  return t.startsWith('/') || t.startsWith('./') || t.startsWith('https://');
}

// Live source: Supabase rows carry the same field shape as the JSON fallback
// (plus stored gc/gr/mgc/mgr/z layout). Null = fall through to JSON.
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
  const desktop = document.querySelector('.baia-coffee-cup-desktop');
  const mobile = document.querySelector('.baia-coffee-cup-mobile');
  if (!desktop && !mobile) return { added: 0, reason: 'no-wall' };

  const fromDb = await fetchWallFromSupabase();
  const items = fromDb || (await fetchWallFromJson(fetchImpl));
  const source = fromDb ? 'hydrated-supabase' : 'hydrated-json';
  if (!items) return { added: 0, reason: 'empty' };

  const existingPhotos = new Set(
    Array.from(document.querySelectorAll('.mosaic-photo-card img'))
      .map((img) => img.getAttribute('src'))
      .filter(Boolean)
  );
  const existingIds = new Set();
  // Also account for data-photo / data-wall-id so the same photo under another
  // URL form (bucket vs local) isn't duplicated across sources.
  document.querySelectorAll('.mosaic-photo-card').forEach((card) => {
    if (card.dataset.photo) existingPhotos.add(card.dataset.photo);
    if (card.dataset.wallId) existingIds.add(card.dataset.wallId);
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

  // Collision-free placement per container: compute free cells from the live
  // DOM and stamp explicit coords onto copies (never mutate shared items
  // across containers). Items with no free cell are skipped, never stacked.
  const renderLists = [];
  if (desktop) {
    const cells = rankFreeCells(
      DESKTOP_GRID.cols, DESKTOP_GRID.rows,
      readContainerCells(desktop, false), fresh.length
    );
    renderLists.push([desktop, fresh.filter((_, i) => cells[i]).map((item, i) => ({
      ...item, gc: cells[i][0], gr: cells[i][1],
    }))]);
  }
  if (mobile) {
    const cells = rankFreeCells(
      MOBILE_GRID.cols, MOBILE_GRID.rows,
      readContainerCells(mobile, true), fresh.length
    );
    renderLists.push([mobile, fresh.filter((_, i) => cells[i]).map((item, i) => ({
      ...item, mgc: cells[i][0], mgr: cells[i][1],
    }))]);
  }

  let rendered = 0;
  for (const [target, list] of renderLists) {
    if (list.length === 0) continue;
    const frag = document.createElement('div');
    frag.innerHTML = list.map((item, i) => buildCommunityCardHTML(item, i)).join('');
    // Prepend so newest shared/tagged moments appear first in the cup.
    while (frag.firstChild) {
      target.insertBefore(frag.firstChild, target.firstChild);
    }
    rendered = Math.max(rendered, list.length);
  }

  if (rendered === 0) return { added: 0, reason: 'grid-full' };
  return { added: rendered, reason: source };
}

export function initCommunityWall() {
  // Fire-and-forget: wall must work even when JSON is missing/offline.
  // Expose the promise for tests / debugging.
  const done = hydrateCommunityWall().catch(() => ({ added: 0, reason: 'error' }));
  if (typeof window !== 'undefined') window.__BAIA_COMMUNITY_HYDRATED = done;
  return done;
}
