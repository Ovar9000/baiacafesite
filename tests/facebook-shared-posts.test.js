/**
 * Regression tests: shared/tagged Facebook posts → drops + coffee photowall.
 *
 * Covers the bug where BAIA's recent shared/tagged posts never updated the
 * site because:
 *  1. Graph `fields=` never requested `full_picture`, so share-wrapper images
 *     (which live in subattachments / full_picture) extracted to [].
 *  2. Drops skipped EVERY `type === 'share'` post unconditionally.
 *  3. Only `/posts` was queried — `/tagged` posts were invisible.
 *  4. The photowall JSON was never fetched by the page (static mosaic only).
 *
 * Run:  npm run test:fb   (node --test tests/)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FB_POST_FIELDS,
  FB_WALL_FIELDS,
  buildCommunityCardHTML,
  buildCommunityEntries,
  buildPostsUrl,
  buildTaggedUrl,
  dedupeByContentHash,
  extractImageUrls,
  extractPrimaryImage,
  isSharePost,
  markSource,
  mergePostEdges,
  shouldSkipShareForDrops,
} from '../scripts/fb-post-utils.js';

import {
  DESKTOP_GRID,
  DESKTOP_SLOTS,
  MOBILE_GRID,
  MOBILE_SLOTS,
  WALL_SIZE,
  wallSlot,
  wallSlotAttrs,
} from '../src/utils/wallLayout.js';
import { thumbPathFor } from '../src/utils/wallThumbs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

// --- Fixtures shaped like real Graph v19 responses ---------------------------

const SHARE_VIA_SUBATTACHMENTS = {
  id: '640323492494372_122183999999999999',
  message: 'Thank you to our weekend crew for the love! 💙 Fresh brews all day at BAIA.',
  created_time: '2026-09-06T10:00:00+0000',
  permalink_url: 'https://www.facebook.com/thebaiacafe/posts/999',
  full_picture: 'https://scontent-mnl3-1.xx.fbcdn.net/v/t39/full_fallback.jpg',
  attachments: {
    data: [
      {
        type: 'share',
        media_type: 'link',
        unshimmed_url: 'https://www.facebook.com/other/posts/1',
        // NOTE: wrapper has NO media.image.src — the old extractor returned [].
        subattachments: {
          data: [
            { type: 'photo', media: { image: { src: 'https://scontent-mnl3-1.xx.fbcdn.net/v/t39/share_p1.jpg' } } },
            { type: 'photo', media: { image: { src: 'https://scontent-mnl3-1.xx.fbcdn.net/v/t39/share_p2.jpg' } } },
          ],
        },
      },
    ],
  },
};

const SHARE_FULL_PICTURE_ONLY = {
  id: '640323492494372_122183888888888888',
  message: 'Reposting this golden sunset moment from our friends! See you by the shore.',
  created_time: '2026-09-07T10:00:00+0000',
  permalink_url: 'https://www.facebook.com/thebaiacafe/posts/888',
  full_picture: 'https://scontent-mnl1-1.xx.fbcdn.net/v/t39/only_full_picture.jpg',
  attachments: { data: [{ type: 'share', unshimmed_url: 'https://www.facebook.com/x/posts/2' }] },
};

const PURE_RESHARE_NO_COMMENTARY = {
  id: '640323492494372_122183777777777777',
  created_time: '2026-09-07T11:00:00+0000',
  permalink_url: 'https://www.facebook.com/thebaiacafe/posts/777',
  attachments: { data: [{ type: 'share', unshimmed_url: 'https://www.facebook.com/x/posts/3' }] },
};

const CAROUSEL_DIRECT_POST = {
  id: '640323492494372_122183666666666666',
  message: 'New weekend treats are here! Come try them all.',
  created_time: '2026-09-05T10:00:00+0000',
  permalink_url: 'https://www.facebook.com/thebaiacafe/posts/666',
  attachments: {
    data: [
      {
        type: 'album',
        media: { image: { src: 'https://scontent-mnl3-1.xx.fbcdn.net/v/t39/cover.jpg' } },
        subattachments: {
          data: [
            { type: 'photo', media: { image: { src: 'https://scontent-mnl3-1.xx.fbcdn.net/v/t39/c_p1.jpg' } } },
            { type: 'photo', media: { image: { src: 'https://scontent-mnl3-1.xx.fbcdn.net/v/t39/c_p2.jpg' } } },
            { type: 'photo', media: { image: { src: 'https://scontent-mnl3-1.xx.fbcdn.net/v/t39/c_p3.jpg' } } },
            { type: 'photo', media: { image: { src: 'https://scontent-mnl3-1.xx.fbcdn.net/v/t39/c_p1.jpg' } } }, // dup
          ],
        },
      },
    ],
  },
};

const TAGGED_GUEST_POST = {
  id: '640323492494372_122183555555555555',
  message: 'Best coffee date with my bestie! Thank you BAIA! 💙',
  story: 'Guest tagged BAIA Cafe',
  created_time: '2026-09-08T10:00:00+0000',
  permalink_url: 'https://www.facebook.com/thebaiacafe/posts/555',
  from: { name: 'Maria Santos' },
  full_picture: 'https://scontent-mnl3-1.xx.fbcdn.net/v/t39/tagged.jpg',
  attachments: { data: [] },
};

// --- 1. Image extraction -----------------------------------------------------

describe('extractImageUrls — shared-post images', () => {
  it('reads share-wrapper photos from subattachments (old code returned [])', () => {
    const imgs = extractImageUrls(SHARE_VIA_SUBATTACHMENTS);
    assert.ok(imgs.includes('https://scontent-mnl3-1.xx.fbcdn.net/v/t39/share_p1.jpg'));
    assert.ok(imgs.includes('https://scontent-mnl3-1.xx.fbcdn.net/v/t39/share_p2.jpg'));
  });

  it('falls back to full_picture when the share wrapper has no media', () => {
    const imgs = extractImageUrls(SHARE_FULL_PICTURE_ONLY);
    assert.deepEqual(imgs, ['https://scontent-mnl1-1.xx.fbcdn.net/v/t39/only_full_picture.jpg']);
    assert.equal(extractPrimaryImage(SHARE_FULL_PICTURE_ONLY), 'https://scontent-mnl1-1.xx.fbcdn.net/v/t39/only_full_picture.jpg');
  });

  it('collects ALL carousel images and dedupes', () => {
    const imgs = extractImageUrls(CAROUSEL_DIRECT_POST);
    assert.ok(imgs.includes('https://scontent-mnl3-1.xx.fbcdn.net/v/t39/cover.jpg'));
    assert.ok(imgs.includes('https://scontent-mnl3-1.xx.fbcdn.net/v/t39/c_p1.jpg'));
    assert.ok(imgs.includes('https://scontent-mnl3-1.xx.fbcdn.net/v/t39/c_p2.jpg'));
    assert.ok(imgs.includes('https://scontent-mnl3-1.xx.fbcdn.net/v/t39/c_p3.jpg'));
    assert.equal(new Set(imgs).size, imgs.length, 'duplicate URLs must be removed');
  });

  it('returns [] (not crash) for imageless reshares', () => {
    assert.deepEqual(extractImageUrls(PURE_RESHARE_NO_COMMENTARY), []);
    assert.equal(extractPrimaryImage(PURE_RESHARE_NO_COMMENTARY), null);
  });
});

// --- 2. Drops/events share policy --------------------------------------------

describe('shouldSkipShareForDrops — no more blanket share-skip', () => {
  it('KEEPS shares with BAIA commentary + image (the reported bug)', () => {
    assert.equal(shouldSkipShareForDrops(SHARE_VIA_SUBATTACHMENTS), false);
    assert.equal(isSharePost(SHARE_VIA_SUBATTACHMENTS), false);
  });

  it('KEEPS full_picture-only shares with commentary', () => {
    assert.equal(shouldSkipShareForDrops(SHARE_FULL_PICTURE_ONLY), false);
  });

  it('still SKIPS pure reshares with no commentary (spam guard)', () => {
    assert.equal(shouldSkipShareForDrops(PURE_RESHARE_NO_COMMENTARY), true);
  });

  it('never skips ordinary non-share posts here', () => {
    assert.equal(shouldSkipShareForDrops(CAROUSEL_DIRECT_POST), false);
  });

  it('skips bare link attachments with no message', () => {
    assert.equal(shouldSkipShareForDrops({ id: 'x', attachments: { data: [{ media_type: 'link' }] } }), true);
  });
});

// --- 3. API request shape -----------------------------------------------------

describe('Graph API request — fields + tagged edge', () => {
  it('posts fields include full_picture + expanded subattachments', () => {
    assert.match(FB_POST_FIELDS, /full_picture/);
    assert.match(FB_POST_FIELDS, /subattachments\{[^}]*media\{image\{src\}\}/);
    assert.match(FB_WALL_FIELDS, /full_picture/);
  });

  it('buildPostsUrl hits /posts and buildTaggedUrl hits /tagged', () => {
    const posts = buildPostsUrl('thebaiacafe', 'TOK');
    const tagged = buildTaggedUrl('thebaiacafe', 'TOK');
    assert.match(posts, /\/thebaiacafe\/posts\?/);
    assert.match(tagged, /\/thebaiacafe\/tagged\?/);
    assert.match(tagged, /full_picture/);
  });

  it('sync-facebook-posts.js queries BOTH edges via shared utils', () => {
    const src = read('scripts/sync-facebook-posts.js');
    assert.match(src, /fb-post-utils\.js/);
    assert.match(src, /buildTaggedUrl/);
    assert.match(src, /mergePostEdges/);
    assert.doesNotMatch(src, /attachments\{media_type,type,media,subattachments,unshimmed_url\}/);
  });

  it('mergePostEdges dedupes by id (posts win over tagged)', () => {
    const dup = { ...TAGGED_GUEST_POST };
    const merged = mergePostEdges(markSource([dup], 'posts'), markSource([dup], 'tagged'));
    assert.equal(merged.length, 1);
    assert.equal(merged[0]._source, 'posts');
  });
});

// --- 4. Photowall entries -----------------------------------------------------

describe('buildCommunityEntries — shared/tagged photos reach the wall', () => {
  it('fans a shared carousel out to one entry per image (_pN ids)', () => {
    const entries = buildCommunityEntries({ ...SHARE_VIA_SUBATTACHMENTS, _source: 'posts' });
    // 2 subattachments + full_picture fallback = 3 images
    assert.equal(entries.length, 3);
    assert.match(entries[0].id, /_p1$/);
    assert.equal(entries[0].permalink, SHARE_VIA_SUBATTACHMENTS.permalink_url);
  });

  it('accepts tagged guest posts with full_picture-only images', () => {
    const entries = buildCommunityEntries({ ...TAGGED_GUEST_POST, _source: 'tagged' });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].photo_url, 'https://scontent-mnl3-1.xx.fbcdn.net/v/t39/tagged.jpg');
    assert.equal(entries[0].tagline, 'Tagged Community Moment');
    assert.equal(entries[0].guest_name, 'Maria Santos');
  });

  it('returns [] when no image is extractable (nothing to show)', () => {
    assert.deepEqual(buildCommunityEntries(PURE_RESHARE_NO_COMMENTARY), []);
  });
});

describe('buildCommunityCardHTML — page-update contract', () => {
  it('emits mosaic card markup the lightbox can open', () => {
    const html = buildCommunityCardHTML({
      photo_url: 'https://scontent-mnl3-1.xx.fbcdn.net/v/t39/share_p1.jpg',
      caption: 'Weekend crew love!',
      guest_name: 'BAIA Guest',
      tagline: 'Shared Community Moment',
      date: 'Sep 2026',
      permalink: 'https://www.facebook.com/thebaiacafe/posts/999',
      tilt: '-2deg',
    });
    assert.match(html, /class="mosaic-photo-card"/);
    assert.match(html, /data-photo="https:\/\/scontent-mnl3-1/);
    assert.match(html, /data-permalink="https:\/\/www\.facebook\.com\/thebaiacafe\/posts\/999"/);
    assert.match(html, /<img src="https:\/\/scontent-mnl3-1[^"]*" alt="BAIA Family guest photo"/);
    assert.match(html, /data-community-hydrated="1"/);
  });

  it('escapes XSS payloads in captions/names', () => {
    const html = buildCommunityCardHTML({
      photo_url: '/images/community/guest_x.jpg',
      caption: '"><script>alert(1)</script>',
      guest_name: '" onmouseover="alert(1)',
      permalink: 'https://www.facebook.com/thebaiacafe',
    });
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /&quot;&gt;&lt;script&gt;/);
  });

  it('cards carry no grid coordinates; position comes from their index', () => {
    const html = buildCommunityCardHTML({ photo_url: '/x.jpg', gc: 5, gr: 6 });
    assert.doesNotMatch(html, /--gc|--gr|style=/);
  });

  it('main.css maps phone slots (--mgc/--mgr) in the cup', () => {
    const css = read('src/styles/main.css');
    assert.match(css, /\.baia-coffee-cup \.mosaic-photo-card \{\s*grid-column: var\(--mgc\);\s*grid-row: var\(--mgr\);/);
    assert.match(css, /\.is-mobile-hidden \{\s*display: none;/);
  });

  it('cards carry a stable data-wall-id for cross-source dedupe', () => {
    const html = buildCommunityCardHTML({ id: 'abc_123', photo_url: '/images/community/guest_x.jpg' }, 2);
    assert.match(html, /data-wall-id="abc_123"/);
  });
});

// --- 6. Supabase migration: wall reads/writes live backend --------------------

describe('supabase migration — community wall lives in the backend', () => {
  it('SQL migration creates table + bucket + public-read policy (idempotent)', () => {
    const sql = read('supabase/community-wall.sql');
    assert.match(sql, /create table if not exists public\.community_wall/);
    assert.match(sql, /photo_url text not null/);
    assert.match(sql, /\bgc integer,\s*\n\s*gr integer,\s*\n\s*mgc integer,\s*\n\s*mgr integer,/);
    assert.match(sql, /enable row level security/);
    assert.match(sql, /for select using \(true\)/);
    assert.match(sql, /community-cache/);
    assert.match(sql, /on conflict \(id\) do update/);
  });

  it('sync-guest-photos.js upserts rows + caches images in community-cache', () => {
    const src = read('scripts/sync-guest-photos.js');
    assert.match(src, /from\('community_wall'\)\.upsert\(rows, \{ onConflict: 'id' \}\)/);
    assert.match(src, /from\('community-cache'\)/);
    assert.match(src, /dedupeByContentHash/);
    assert.match(src, /syncWallToSupabase/);
  });

  it('sync stores NO magic grid slots (browser computes free cells at runtime)', () => {
    const src = read('scripts/sync-guest-photos.js');
    assert.doesNotMatch(src, /wallSlot/);
    assert.doesNotMatch(src, /item\.gc = /);
  });

  it('sync never wipes the wall on empty selections (keeps previous file)', () => {
    const src = read('scripts/sync-guest-photos.js');
    assert.match(src, /Wall Guard/);
    assert.match(src, /kept previous/);
  });

  it('communityWall.js hydrates Supabase-first with JSON fallback', () => {
    const src = read('src/components/communityWall.js');
    assert.match(src, /from\('community_wall'\)/);
    assert.match(src, /\/data\/community-reviews\.json/);
    assert.match(src, /hydrated-supabase/);
    assert.match(src, /hydrated-json/);
    assert.match(src, /dataset\.wallId/);
  });

  it('cron wall step carries Supabase credentials for scheduled auto-updates', () => {
    const yml = read('.github/workflows/sync-facebook-cron.yml');
    const wallStep = yml.slice(yml.indexOf('Community Wall Sync'));
    assert.match(wallStep, /SUPABASE_URL/);
    assert.match(wallStep, /SUPABASE_SERVICE_ROLE_KEY/);
  });
});

// --- 7. Collision-free placement + byte dedupe --------------------------------

describe('wall layout — one cup template, never stacks', () => {
  const cellsOk = (slots, grid) => {
    const keys = slots.map(([c, r]) => `${c},${r}`);
    assert.equal(new Set(keys).size, slots.length, 'every slot is a different cell');
    for (const [c, r] of slots) {
      assert.ok(c >= 1 && c <= grid.cols && r >= 1 && r <= grid.rows, `${c},${r} inside ${grid.cols}x${grid.rows}`);
    }
  };

  it('desktop and phone templates use unique cells inside their grids', () => {
    assert.equal(WALL_SIZE, 30);
    cellsOk(DESKTOP_SLOTS, DESKTOP_GRID);
    cellsOk(MOBILE_SLOTS, MOBILE_GRID);
    assert.ok(MOBILE_SLOTS.length < DESKTOP_SLOTS.length);
  });

  it('wallSlot maps index to slot; extra cards are hidden on phones', () => {
    assert.deepEqual([wallSlot(0).gc, wallSlot(0).gr], DESKTOP_SLOTS[0]);
    assert.deepEqual([wallSlot(0).mgc, wallSlot(0).mgr], MOBILE_SLOTS[0]);
    assert.equal(wallSlot(MOBILE_SLOTS.length).mobileHidden, true);
    assert.equal(wallSlot(WALL_SIZE - 1).steam, true);
    assert.equal(wallSlot(WALL_SIZE).hidden, true);
    assert.ok(wallSlotAttrs(MOBILE_SLOTS.length).classes.includes('is-mobile-hidden'));
  });

  it('static index.html cup matches the template card-for-card', () => {
    const html = read('index.html');
    const cup = html.slice(html.indexOf('<div class="baia-coffee-cup">'));
    const cards = [...cup.matchAll(/<button type="button" class="(mosaic-photo-card[^"]*)" style="([^"]*)"/g)];
    assert.equal(cards.length, WALL_SIZE);
    cards.forEach((m, i) => {
      const { style, classes } = wallSlotAttrs(i);
      assert.equal(m[2], style, `card ${i} style`);
      assert.equal(m[1], ['mosaic-photo-card', ...classes].join(' '), `card ${i} classes`);
    });
  });

  it('hydration prepends then re-lays out the whole cup (oldest drop off)', async () => {
    const { applyWallLayout } = await import('../src/utils/wallLayout.js');
    // Minimal fake container: 30 static cards + 5 fresh ones prepended.
    const made = [];
    const mkCard = (id) => {
      const card = {
        id, attrs: {}, cls: new Set(['mosaic-photo-card']), removed: false,
        setAttribute(k, v) { this.attrs[k] = v; },
        classList: null,
        remove() { this.removed = true; },
      };
      card.classList = {
        add: (...c) => c.forEach((x) => card.cls.add(x)),
        remove: (...c) => c.forEach((x) => card.cls.delete(x)),
      };
      made.push(card);
      return card;
    };
    const list = [
      ...Array.from({ length: 5 }, (_, i) => mkCard(`fresh${i}`)),
      ...Array.from({ length: WALL_SIZE }, (_, i) => mkCard(`static${i}`)),
    ];
    const container = { querySelectorAll: () => list };
    assert.equal(applyWallLayout(container), WALL_SIZE);
    assert.deepEqual(list.filter((c) => c.removed).map((c) => c.id),
      ['static25', 'static26', 'static27', 'static28', 'static29']);
    const cells = list.filter((c) => !c.removed).map((c) => c.attrs.style.match(/--gc: (\d+); --gr: (\d+)/).slice(1).join(','));
    assert.equal(new Set(cells).size, WALL_SIZE, 'no two cards share a cell');
    assert.match(list[0].attrs.style, new RegExp(`--gc: ${DESKTOP_SLOTS[0][0]}; --gr: ${DESKTOP_SLOTS[0][1]};`));
  });

  it('communityWall.js lays out with the shared template', () => {
    const src = read('src/components/communityWall.js');
    assert.match(src, /applyWallLayout\(cup\)/);
    assert.match(src, /insertBefore/);
    assert.doesNotMatch(src, /rankFreeCells|readContainerCells/);
  });

  it('dedupeByContentHash drops byte-identical repeats, keeps the rest', () => {
    const items = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
    const hashOf = (it) => (it.id === 'p2' ? 'sha1:SAME' : `sha1:${it.id}`);
    // p2-duplicate: same bytes as a "history" entry
    const r1 = dedupeByContentHash([{ id: 'p0' }, ...items], hashOf, new Set(['sha1:SAME']));
    assert.deepEqual(r1.items.map((i) => i.id), ['p0', 'p1', 'p3']);
    assert.equal(r1.removed, 1);
    // within-batch duplicate
    const r2 = dedupeByContentHash([{ id: 'a' }, { id: 'b' }], () => 'sha1:X');
    assert.equal(r2.items.length, 1);
    assert.equal(r2.removed, 1);
    // unhashable items are kept, never destroyed
    const r3 = dedupeByContentHash([{ id: 'u' }], () => { throw new Error('no fs'); });
    assert.equal(r3.items.length, 1);
    assert.equal(r3.removed, 0);
  });
});

// --- 5. Page wiring: JSON actually reaches the DOM ----------------------------

describe('page wiring — sync output is fetched + rendered', () => {
  it('sync-guest-photos.js mirrors JSON to public/ for runtime fetch', () => {
    const src = read('scripts/sync-guest-photos.js');
    assert.match(src, /COMMUNITY_PUBLIC_FILE/);
    assert.match(src, /public.*data.*community-reviews\.json/);
    assert.match(src, /buildCommunityEntries/);
    assert.match(src, /full_picture|FB_WALL_FIELDS|buildTaggedUrl/);
  });

  it('communityWall.js fetches the public JSON and prepends new cards', () => {
    const src = read('src/components/communityWall.js');
    assert.match(src, /\/data\/community-reviews\.json/);
    assert.match(src, /insertBefore/);
    assert.match(src, /mosaic-photo-card/);
    assert.match(src, /hydrateCommunityWall/);
  });

  it('main.js hydrates the wall BEFORE binding the polaroid lightbox', () => {
    const src = read('src/main.js');
    const wallPos = src.indexOf('initCommunityWall');
    const polaroidPos = src.indexOf('initPolaroidWall');
    assert.ok(wallPos !== -1, 'initCommunityWall must be referenced in main.js');
    assert.ok(polaroidPos !== -1, 'initPolaroidWall must be referenced in main.js');
    assert.ok(wallPos < polaroidPos, 'wall hydration must init before lightbox binding');
  });

  it('lightbox uses delegation so hydrated cards open too', () => {
    const src = read('src/main.js');
    assert.match(src, /\.closest\?\.\(\s*['"]\.mosaic-photo-card['"]\s*\)/);
  });

  it('end-to-end simulation: fresh shared photo not in DOM becomes a new card', () => {
    // Simulate: DOM already shows p1; sync delivers p1+p2+full_picture.
    const existingPhotos = new Set(['https://scontent-mnl3-1.xx.fbcdn.net/v/t39/share_p1.jpg']);
    const entries = buildCommunityEntries({ ...SHARE_VIA_SUBATTACHMENTS, _source: 'posts' });
    const fresh = entries.filter((e) => !existingPhotos.has(e.photo_url));
    assert.ok(fresh.length >= 2, 'shared carousel must yield NEW wall cards beyond what is shown');
    for (const item of fresh) {
      const html = buildCommunityCardHTML(item);
      assert.match(html, new RegExp(item.photo_url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 40)));
      assert.match(html, /data-permalink="https:\/\/www\.facebook\.com/);
    }
  });
});

// --- Photowall thumbnails: tiles load small WebPs, lightbox keeps full photo --

describe('wall thumbnails', () => {
  it('maps local photos to /images/thumbs/<name>.webp', () => {
    assert.equal(thumbPathFor('/images/community/guest_1.jpg'), '/images/thumbs/guest_1.webp');
    assert.equal(thumbPathFor('./images/skimboard.webp'), '/images/thumbs/skimboard.webp');
    assert.equal(thumbPathFor('/images/Baia%20refreshers.jpg'), '/images/thumbs/Baia%20refreshers.webp');
  });

  it('leaves remote and already-thumb URLs alone', () => {
    assert.equal(thumbPathFor('https://scontent-mnl3-1.xx.fbcdn.net/v/t39/a.jpg'), null);
    assert.equal(thumbPathFor('/images/thumbs/guest_1.webp'), null);
    assert.equal(thumbPathFor(undefined), null);
  });

  it('card tile uses the thumb while data-photo stays full-size', () => {
    const html = buildCommunityCardHTML({ photo_url: '/images/community/guest_x.jpg' }, 0);
    assert.match(html, /data-photo="\/images\/community\/guest_x\.jpg"/);
    assert.match(html, /<img src="\/images\/thumbs\/guest_x\.webp"/);
  });

  it('every static wall tile in index.html points at an existing thumb', () => {
    const html = read('index.html');
    const srcs = [...html.matchAll(/<img\s+src="([^"]+)"[^>]*class="mosaic-photo-img"/g)].map((m) => m[1]);
    assert.ok(srcs.length > 0);
    for (const src of srcs) {
      assert.ok(src.startsWith('/images/thumbs/'), `${src} should be a thumb`);
      assert.ok(fs.existsSync(path.join(ROOT, 'public', decodeURIComponent(src))), `${src} missing on disk`);
    }
  });
});

// --- Hours: one source (src/data/siteInfo.js) feeds the crawler-visible HTML --

describe('site info injection', async () => {
  const { injectSiteInfo } = await import('../src/utils/injectSiteInfo.js');
  const { HOURS, HOURS_TEXT } = await import('../src/data/siteInfo.js');

  it('fills meta, JSON-LD and fallback text in index.html from siteInfo', () => {
    const out = injectSiteInfo(read('index.html'));
    assert.doesNotMatch(out, /\{\{\w+\}\}/);
    assert.match(out, new RegExp(`"opens": "${HOURS.cafe.opens}"`));
    assert.match(out, new RegExp(`"closes": "${HOURS.cafe.closes}"`));
    for (const m of out.matchAll(/data-hours="(\w+)">([^<]*)</g)) {
      assert.equal(m[2], HOURS_TEXT[m[1]], `data-hours="${m[1]}" fallback text`);
    }
  });

  it('rejects unknown tokens instead of shipping them', () => {
    assert.throws(() => injectSiteInfo('<p>{{notAThing}}</p>'), /unknown token/);
  });
});
