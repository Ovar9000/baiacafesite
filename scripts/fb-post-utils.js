/**
 * BAIA Cafe — Shared Facebook post/tagged-post utilities.
 *
 * Single source of truth for Graph API image extraction + share policy,
 * shared by `scripts/sync-facebook-posts.js` (drops/events) and
 * `scripts/sync-guest-photos.js` (coffee photowall).
 *
 * Why this exists:
 * - Shared posts (`attachments.data[0].type === 'share'`) usually have NO
 *   `media.image.src` on the wrapper. The real photo lives in
 *   `subattachments.data[].media.image.src` or top-level `full_picture`.
 * - The old `fields=` never requested `full_picture`, so the fallback was dead.
 * - `/posts` never returns posts where BAIA is merely tagged — those live on
 *   the `/tagged` edge and need a second fetch.
 *
 * Pure functions only (no network / fs side effects) so `node --test` can
 * import this file safely.
 */

export const FB_GRAPH_VERSION = 'v19.0';

// Requested on BOTH /posts and /tagged. `full_picture` is the critical
// fallback for share-wrappers; expanded `subattachments{...}` is required
// for carousels (p1..pn) on v19.0.
export const FB_POST_FIELDS =
  'id,message,story,created_time,permalink_url,from,full_picture,' +
  'attachments{media_type,type,media{image{src}},subattachments{media{image{src}},type,target{url}},target{url},title,description,unshimmed_url},' +
  'comments.limit(25){message,from,created_time}';

export const FB_WALL_FIELDS =
  'id,message,story,created_time,permalink_url,from,full_picture,' +
  'attachments{media_type,type,media{image{src}},subattachments{media{image{src}},type,target{url}},target{url},title,description,unshimmed_url}';

export function buildPostsUrl(pageId, token, limit = 60) {
  return (
    `https://graph.facebook.com/${FB_GRAPH_VERSION}/${encodeURIComponent(pageId)}/posts` +
    `?fields=${encodeURIComponent(FB_POST_FIELDS)}&limit=${limit}&access_token=${encodeURIComponent(token)}`
  );
}

export function buildTaggedUrl(pageId, token, limit = 60) {
  return (
    `https://graph.facebook.com/${FB_GRAPH_VERSION}/${encodeURIComponent(pageId)}/tagged` +
    `?fields=${encodeURIComponent(FB_WALL_FIELDS)}&limit=${limit}&access_token=${encodeURIComponent(token)}`
  );
}

/**
 * Collect EVERY usable image URL from a Graph post, de-duplicated.
 * Order: wrapper media → each subattachment → full_picture fallback.
 */
export function extractImageUrls(post) {
  const images = [];
  const seen = new Set();
  const push = (u) => {
    if (typeof u !== 'string') return;
    const t = u.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    images.push(t);
  };

  const attachments = post?.attachments?.data || [];
  for (const att of attachments) {
    if (att?.media?.image?.src) push(att.media.image.src);
    const subs = att?.subattachments?.data || [];
    for (const sub of subs) {
      if (sub?.media?.image?.src) push(sub.media.image.src);
    }
  }

  // Share-wrappers almost always need this fallback.
  if (post?.full_picture) push(post.full_picture);

  return images;
}

export function extractPrimaryImage(post) {
  return extractImageUrls(post)[0] || null;
}

export function isShareWrapper(post) {
  const first = post?.attachments?.data?.[0];
  if (!first) return false;
  if (first.type === 'share') return true;
  if (first.unshimmed_url) return true;
  return false;
}

export function isTrivialPost(post) {
  const msg = (post?.message || '').trim();
  if (!msg) return true;
  const stripped = msg.replace(/[\p{Emoji}\s\p{P}]/gu, '');
  if (stripped.length < 6) return true;
  return false;
}

export function hasBAIACommentary(post) {
  const msg = (post?.message || '').trim();
  if (!msg) return false;
  const stripped = msg.replace(/[\p{Emoji}\s\p{P}]/gu, '');
  // Real commentary, not just "#baiacafe" / emoji.
  return stripped.length >= 12;
}

/**
 * Drops/events policy (replaces blanket `type === 'share'` skip):
 * - Non-share → never skipped here.
 * - Share WITH BAIA commentary (+ image when available) → KEEP for classifier.
 * - Pure reshare (no/trivial message, link-type with no message) → SKIP.
 */
export function shouldSkipShareForDrops(post) {
  if (!isShareWrapper(post)) {
    const first = post?.attachments?.data?.[0];
    if (first?.media_type === 'link' && !post?.message) return true;
    return false;
  }
  // It IS a share wrapper.
  if (hasBAIACommentary(post)) return false;
  if (isTrivialPost(post)) return true;
  // Share with some text but we can't tell — be conservative for drops
  // UNLESS it carries an image (then let the classifier decide).
  return extractImageUrls(post).length === 0;
}

/** Back-compat: old name meant "skip every share". Now delegates. */
export function isSharePost(post) {
  return shouldSkipShareForDrops(post);
}

/** Tag `_source` so downstream logs/UI can distinguish posts vs tagged. */
export function markSource(posts, source) {
  return (posts || []).map((p) => ({ ...p, _source: source }));
}

/**
 * Drop content-duplicate wall items. Facebook serves the same photo bytes
 * under different subattachment URLs, so URL-dedupe is not enough.
 * `hashOf(item)` returns a content key (or null when unhashable — those are
 * always kept, never destroy data on error). `known` preloads history hashes
 * and accumulates batch hashes, so repeats die within and across runs.
 */
export function dedupeByContentHash(items, hashOf, known = new Set()) {
  const out = [];
  let removed = 0;
  for (const item of items || []) {
    let key = null;
    try {
      key = hashOf(item);
    } catch {
      key = null;
    }
    if (key == null || !known.has(key)) {
      if (key != null) known.add(key);
      out.push(item);
    } else {
      removed++;
    }
  }
  return { items: out, removed };
}

/** Merge /posts + /tagged, de-duplicated by id (posts win). */
export function mergePostEdges(posts, tagged) {
  const seen = new Set();
  const out = [];
  for (const p of [...(posts || []), ...(tagged || [])]) {
    if (!p || !p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

/**
 * Community-wall candidacy: a post qualifies when it has at least one
 * extractable photo AND (is a share/tagged OR guest-context caption OR
 * very short caption). Returns one entry PER IMAGE so carousels fan out
 * to p1..pn cards like the existing static wall.
 */
export function buildCommunityEntries(post, opts = {}) {
  const images = extractImageUrls(post);
  if (images.length === 0) return [];
  const message = post?.message || post?.story || '';
  const isShare = isShareWrapper(post) || post?._source === 'tagged';
  const hasHeart = /💙|🫶|❤️|✨|🥰|☕/.test(message);
  const isGuestCtx =
    hasHeart || isShare || /guest|visitor|thank you|salamat|visit|support|crew|shoutout|bestie/i.test(message);
  if (!(isShare || isGuestCtx || message.length < 30)) return [];

  const date = (() => {
    try {
      return new Date(post.created_time).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    } catch {
      return 'Recently';
    }
  })();
  const tilts = opts.tilts || ['-2.5deg', '1.8deg', '-1.5deg', '2.2deg', '-2deg', '1.5deg'];
  const baseIdx = opts.tiltIndex || 0;

  return images.slice(0, 5).map((photoUrl, i) => ({
    id: images.length > 1 ? `${post.id}_p${i + 1}` : String(post.id),
    photo_url: photoUrl,
    caption: message || 'A warm beachside moment with our friends & supporters at BAIA Cafe.',
    guest_name: post?.from?.name || post?.attachments?.data?.[0]?.title || 'BAIA Guest & Friend',
    tagline: post?._source === 'tagged' ? 'Tagged Community Moment' : isShare ? 'Shared Community Moment' : 'Beach Supporter',
    date,
    rating: 5,
    source: post?._source === 'tagged' ? 'Facebook Tagged Post' : 'Facebook Community Post',
    permalink: post?.permalink_url || `https://www.facebook.com/${post?.id || ''}`,
    tilt: tilts[(baseIdx + i) % tilts.length],
  }));
}

function escapeHtmlAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Spread slots so runtime cards land on DIFFERENT cells instead of stacking.
 * Desktop cup is 14 cols × 8 rows; mobile cup is 7 cols × 6 rows.
 * MUST stay in sync with `src/components/communityWall.js` `wallSlot`.
 */
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

/**
 * Card markup contract — MUST stay in sync with
 * `src/components/communityWall.js` `buildCommunityCardHTML`.
 * Tests assert this contract (data-photo / data-permalink / img src).
 */
export function buildCommunityCardHTML(item, index = 0) {
  const slot = wallSlot(index);
  const asGridNum = (v, fb) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : fb;
  };
  const gc = asGridNum(item.gc, slot.gc);
  const gr = asGridNum(item.gr, slot.gr);
  const mgc = asGridNum(item.mgc, slot.mgc);
  const mgr = asGridNum(item.mgr, slot.mgr);
  const z = asGridNum(item.z, slot.z);
  const photo = escapeHtmlAttr(item.photo_url);
  const quote = escapeHtmlAttr(item.caption);
  const author = escapeHtmlAttr(item.guest_name || 'BAIA Cafe Guest');
  const meta = escapeHtmlAttr(`${item.date || 'Recently'} • ${item.tagline || 'Shared Community Moment'}`);
  const permalink = escapeHtmlAttr(item.permalink || 'https://www.facebook.com/thebaiacafe');
  const rot = escapeHtmlAttr(item.tilt || slot.rot);
  return (
    `<button type="button" class="mosaic-photo-card" style="--gc: ${gc}; --gr: ${gr}; --mgc: ${mgc}; --mgr: ${mgr}; --rot: ${rot}; --z: ${z};"` +
    ` data-wall-id="${escapeHtmlAttr(item.id || '')}" data-photo="${photo}" data-quote="${quote}" data-author="${author}" data-meta="${meta}"` +
    ` data-permalink="${permalink}" data-community-hydrated="1" aria-label="View photo by ${author}">` +
    `<div class="mosaic-photo-frame">` +
    `<img src="${photo}" alt="BAIA Family guest photo" class="mosaic-photo-img" loading="lazy" />` +
    `</div></button>`
  );
}
