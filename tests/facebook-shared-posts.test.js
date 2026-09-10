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
  wallSlot,
} from '../scripts/fb-post-utils.js';

import {
  collectOccupiedCells,
  parseGridCoord,
  rankFreeCells,
} from '../src/components/communityWall.js';

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

  it('spreads consecutive cards across DIFFERENT grid cells (no stacking)', () => {
    const cells = new Set();
    for (let i = 0; i < 8; i++) {
      const html = buildCommunityCardHTML({ photo_url: `/images/community/guest_new_${i}.jpg` }, i);
      const m = html.match(/--gc: (\d+); --gr: (\d+); --mgc: (\d+); --mgr: (\d+);/);
      assert.ok(m, 'card must carry desktop + mobile grid slots');
      const [, gc, gr, mgc, mgr] = m.map(Number);
      assert.ok(gc >= 1 && gc <= 14, `desktop gc ${gc} within 14-col cup`);
      assert.ok(gr >= 1 && gr <= 8, `desktop gr ${gr} within 8-row cup`);
      assert.ok(mgc >= 1 && mgc <= 7, `mobile mgc ${mgc} within 7-col cup`);
      assert.ok(mgr >= 1 && mgr <= 6, `mobile mgr ${mgr} within 6-row cup`);
      const key = `${gc}x${gr}`;
      assert.ok(!cells.has(key), `cell ${key} must not repeat (stacking bug)`);
      cells.add(key);
    }
    assert.equal(cells.size, 8);
  });

  it('wallSlot() mirrors the browser builder slots (shared layout contract)', () => {
    const a = wallSlot(0);
    const b = wallSlot(1);
    assert.notDeepEqual([a.gc, a.gr], [b.gc, b.gr]);
    const html = buildCommunityCardHTML({ photo_url: '/x.jpg' }, 0);
    assert.match(html, new RegExp(`--gc: ${a.gc}; --gr: ${a.gr};`));
  });

  it('stored per-item layout wins over slot rotation (stable Supabase rows)', () => {
    const html = buildCommunityCardHTML({ photo_url: '/x.jpg', gc: 5, gr: 6, mgc: 3, mgr: 4 }, 0);
    assert.match(html, /--gc: 5; --gr: 6; --mgc: 3; --mgr: 4;/);
  });

  it('main.css maps hydrated cards to mobile slots in the 7-col cup', () => {
    const css = read('src/styles/main.css');
    assert.match(css, /\[data-community-hydrated="1"\]/);
    assert.match(css, /grid-column: var\(--mgc, var\(--gc\)\)/);
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

describe('wall placement — free cells only, repeats removed', () => {
  it('parseGridCoord accepts positive ints, rejects junk', () => {
    assert.equal(parseGridCoord('3'), 3);
    assert.equal(parseGridCoord(5), 5);
    assert.equal(parseGridCoord('0'), null);
    assert.equal(parseGridCoord('-2'), null);
    assert.equal(parseGridCoord('abc'), null);
    assert.equal(parseGridCoord(undefined), null);
  });

  it('collectOccupiedCells dedupes and drops invalid coords', () => {
    const occ = collectOccupiedCells([
      { gc: '3', gr: '2' },
      { gc: '3', gr: '2' },
      { gc: 'x', gr: '2' },
      { gc: '4', gr: null },
    ]);
    assert.deepEqual([...occ], ['3,2']);
  });

  it('rankFreeCells never returns occupied cells (the double-stack bug)', () => {
    const occ = new Set(['3,2', '6,3', '4,5', '12,5', '7,6', '2,4']);
    const cells = rankFreeCells(14, 8, occ, 8);
    assert.equal(cells.length, 8);
    for (const [gc, gr] of cells) {
      assert.ok(!occ.has(`${gc},${gr}`), `cell ${gc},${gr} must be free`);
      assert.ok(gc >= 1 && gc <= 14 && gr >= 1 && gr <= 8);
    }
    assert.equal(new Set(cells.map((c) => c.join(','))).size, 8);
  });

  it('rankFreeCells grows from the existing mass (nearest first)', () => {
    const cells = rankFreeCells(5, 5, new Set(['3,3']), 4);
    // All four orthogonal neighbours (Manhattan distance 1) come first.
    for (const [gc, gr] of cells) {
      assert.equal(Math.abs(gc - 3) + Math.abs(gr - 3), 1);
    }
  });

  it('rankFreeCells returns fewer (never stacks) when the grid is full', () => {
    const occ = new Set(['1,1', '2,1', '1,2', '2,2']);
    assert.deepEqual(rankFreeCells(2, 2, occ, 5), []);
    assert.equal(rankFreeCells(2, 2, new Set(['1,1']), 9).length, 3);
  });

  it('communityWall.js places per-container from live DOM cells', () => {
    const src = read('src/components/communityWall.js');
    assert.match(src, /readContainerCells\(desktop, false\)/);
    assert.match(src, /readContainerCells\(mobile, true\)/);
    assert.match(src, /rankFreeCells\(/);
    assert.match(src, /grid-full/);
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
