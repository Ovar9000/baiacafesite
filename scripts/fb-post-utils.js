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

import { thumbPathFor } from '../src/utils/wallThumbs.js';

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
    // Real post text and author only; never placeholder praise or names.
    caption: message || '',
    guest_name: post?.from?.name || null,
    tagline: post?._source === 'tagged' ? 'Tagged on Facebook' : isShare ? 'Shared on Facebook' : 'From our Facebook page',
    date,
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
 * Card markup contract — MUST stay in sync with
 * `src/components/communityWall.js` `buildCommunityCardHTML`.
 * Tests assert this contract (data-photo / data-permalink / img src).
 * Position comes from the card's index via src/utils/wallLayout.js
 * (applyWallLayout), so cards carry no grid coordinates of their own.
 */
export function buildCommunityCardHTML(item) {
  const photo = escapeHtmlAttr(item.photo_url);
  const tile = escapeHtmlAttr(thumbPathFor(item.photo_url) || item.photo_url);
  const quote = escapeHtmlAttr(item.caption);
  const author = escapeHtmlAttr(item.guest_name || 'Shared on Facebook');
  const meta = escapeHtmlAttr(`${item.date || 'Recently'} • ${item.tagline || 'Shared on Facebook'}`);
  const permalink = escapeHtmlAttr(item.permalink || 'https://www.facebook.com/thebaiacafe');
  return (
    `<button type="button" class="mosaic-photo-card"` +
    ` data-wall-id="${escapeHtmlAttr(item.id || '')}" data-photo="${photo}" data-quote="${quote}" data-author="${author}" data-meta="${meta}"` +
    ` data-permalink="${permalink}" data-community-hydrated="1" aria-label="View photo by ${author}">` +
    `<div class="mosaic-photo-frame">` +
    `<img src="${tile}" alt="BAIA Family guest photo" class="mosaic-photo-img" loading="lazy" />` +
    `</div></button>`
  );
}

// --- Drops classification (deterministic, no LLM) ----------------------------
//
// Decides whether a BAIA page post belongs in "New Drops & Events" and builds
// the card from the post's OWN text. Nothing is invented: no product copy,
// no winners, no dates that the post doesn't contain.

const RX = {
  // Same-day operational updates: useful on Facebook, not "drops".
  notice: /\b(full house|fully booked|deliver(?:y|ies)\b[^.\n]*\b(?:paused?|on hold|suspended|delayed|longer)|paus(?:e|ing) deliver(?:y|ies)|may take (?:a little )?longer|now hiring|we(?:'|’)?re hiring|hiring|job opening|looking for)\b/,
  closure: /\b(closed (?:today|for the day|tomorrow)|we(?:'|’)?(?:re| are) closed|weather (?:break|advisory)|temporar(?:y|ily) closed|closure)\b/,
  launch: /\b(now online|new website)\b/,
  giveaway: /\b(giveaway|contest|guess (?:the|our|what|which)|to win|win a|free .* for the first)\b/,
  winner: /\b(congrat(?:s|ulations)|winner|won)\b/,
  isNew: /\b(new|newest|introducing|now available|available now|just dropped|drop|launch(?:ing|ed)?|back on the menu|(?:is|are) back|joining (?:our|the) menu|now serving)\b/,
  event: /\b(live music|acoustic|gig|grand opening|promo|sale|happening|event|this (?:saturday|sunday|weekend)|holiday special)\b/,
  drink: /\b(latte|coffee|espresso|frapp[eé]|soda|refresher|tea|matcha|drink|brew|bean|einsp[aä]nner|americano|cappuccino|mocha|fizz|beer)\b/,
  food: /\b(burger|wings?|fries|sandwich|wrap|tenders|waffles?|pasta|rice|meal|chicken|longganisa|nachos?|croffles?|snack|bites?|flavou?r)\b/,
  greeting: /^(hi|hello|hey|annyeong|good (?:morning|afternoon|evening)|baia fam)\b/,
  // Header-only lines that make poor card titles ("New Drop 👀", "WE ARE OPEN TODAY!")
  headerOnly: /^(?:new drop|new|newest|introducing|available now|just dropped|we(?:'|’)?re open(?: today)?|we are open(?: today)?)[\s\p{P}\p{Extended_Pictographic}️]*$/u
};

/** Plain-text form of a post: fancy Unicode bold/italics → ASCII, no hashtags. */
export function normalizePostText(message) {
  return String(message || '')
    .normalize('NFKC')
    .replace(/#[\p{L}\p{N}_]+/gu, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** First meaningful line (not a greeting), trimmed to ~60 chars at a word break. */
export function titleFromPost(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => /[\p{L}\p{N}]/u.test(l));
  const pick = lines.find((l) => {
    const lower = l.toLowerCase();
    return !RX.greeting.test(lower) && !RX.headerOnly.test(lower) && l.split(/\s+/).length >= 2;
  }) || lines[0] || '';
  const clean = pick.replace(/\s*[\p{Extended_Pictographic}️‍]+\s*$/gu, '').trim();
  if (clean.length <= 60) return clean;
  const cut = clean.slice(0, 60);
  return cut.slice(0, cut.lastIndexOf(' ') > 30 ? cut.lastIndexOf(' ') : 60).trim() + '…';
}

/**
 * @returns {{action:'skip', reason:string} |
 *           {action:'publish', kind:string, category:string, title:string, description:string,
 *            badge:string, price:string|null, status:string|null}}
 */
export function classifyDropPost(post) {
  const text = normalizePostText(post?.message);
  const lower = text.toLowerCase();
  if (!text) return { action: 'skip', reason: 'no-text' };

  const base = (kind, category, badge, status = null) => {
    const price = text.match(/₱\s*([\d,]+)/);
    return {
      action: 'publish', kind, category, badge, status,
      title: titleFromPost(text),
      description: text,
      price: price ? `₱${price[1]}` : null
    };
  };

  if (RX.closure.test(lower)) return base('advisory', 'event', '1-Day Advisory');
  if (RX.notice.test(lower)) return { action: 'skip', reason: 'operational-notice' };
  if (RX.launch.test(lower)) return base('launch', 'event', 'Website Launch');
  if (RX.giveaway.test(lower)) {
    return RX.winner.test(lower)
      ? base('giveaway', 'event', 'Winner Awarded', 'concluded')
      : base('giveaway', 'event', 'Giveaway');
  }
  if (RX.isNew.test(lower)) {
    // Food vs drink by keyword count ("chicken tenders … top of any drink" is food).
    const count = (rx) => (lower.match(new RegExp(rx.source, 'g')) || []).length;
    const food = count(RX.food);
    const drink = count(RX.drink);
    if (food || drink) {
      return food >= drink ? base('drop', 'food', 'Fresh Drop') : base('drop', 'drink', 'Drink Drop');
    }
    return base('news', 'event', 'New at BAIA');
  }
  if (RX.event.test(lower)) return base('event', 'event', 'Live Event');
  return { action: 'skip', reason: 'not-a-drop' };
}

/** Wall: skip notice/hiring posts (their images are text graphics, not moments). */
export function isWallNoticePost(post) {
  const lower = normalizePostText(post?.message).toLowerCase();
  return RX.notice.test(lower) || RX.closure.test(lower);
}
