/**
 * BAIA Cafe — Facebook Community Wall of Supporters Sync Script
 *
 * Fetches Facebook Page posts (/posts) + tagged posts (/tagged), guest
 * check-ins, and shared customer photos. Share-wrappers carry photos in
 * `subattachments` / `full_picture` (see scripts/fb-post-utils.js).
 * Skips notice/hiring posts with deterministic text rules (no LLM).
 * Photos are stored in Supabase (`community_wall` + `community-cache` bucket)
 * as WebP with tile thumbs; the page reads them live. The 30 photos built into
 * index.html are the offline fallback.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { THUMB_SIDE, fetchImage, isCachedWebp, safeName, storageName, toWebp, uploadWebp } from './image-cache.js';
import { failInCi, requireCiSecrets } from './ci-guard.js';
import {
  buildCommunityEntries,
  buildPostsUrl,
  buildTaggedUrl,
  dedupeByContentHash,
  extractImageUrls,
  isShareWrapper,
  markSource,
  mergePostEdges,
  isWallNoticePost,
} from './fb-post-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT_DIR, '.env');

function loadEnv() {
  if (fs.existsSync(ENV_FILE)) {
    const content = fs.readFileSync(ENV_FILE, 'utf-8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...rest] = trimmed.split('=');
        const val = rest.join('=').trim().replace(/^["']|["']$/g, '');
        if (!process.env[key.trim()]) {
          process.env[key.trim()] = val;
        }
      }
    });
  }
}

loadEnv();

const FB_PAGE_ID = process.env.FB_PAGE_ID || process.env.FACEBOOK_PAGE_ID || 'thebaiacafe';
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FB_ACCESS_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Curated baseline community guest moments from Laurentte beach
// No placeholder "guest" entries: every wall item must come from a real
// Facebook post. When a run finds nothing new, the existing wall is kept.

async function queryFacebookForGuestPhotos(pageId, token) {
  if (!token) {
    console.log('ℹ️ No Facebook token available. Using curated photo collage.');
    return [];
  }

  let effectiveToken = token;
  // NOTE: `full_picture` + expanded subattachments are mandatory for shares;
  // `/tagged` covers customer posts that tag BAIA (invisible on `/posts`).
  const postsEndpoint = (t) => buildPostsUrl(pageId, t, 60);
  const taggedEndpoint = (t) => buildTaggedUrl(pageId, t, 60);
  
  try {
    let res = await fetch(postsEndpoint(effectiveToken));
    let data = await res.json();

    // Auto-resolve page token if user token provided
    if (data.error && (data.error.error_subcode === 2069032 || data.error.message?.includes('Page access token'))) {
      const directRes = await fetch(`https://graph.facebook.com/v19.0/${encodeURIComponent(pageId)}?fields=id,name,access_token&access_token=${encodeURIComponent(token)}`);
      const directData = await directRes.json();
      if (directData?.access_token) {
        effectiveToken = directData.access_token;
        res = await fetch(postsEndpoint(effectiveToken));
        data = await res.json();
      }
    }

    let taggedData = { data: [] };
    try {
      const taggedRes = await fetch(taggedEndpoint(effectiveToken));
      if (taggedRes.ok) {
        taggedData = await taggedRes.json();
        if (taggedData?.data?.length) {
          console.log(`📥 [Wall] Also retrieved ${taggedData.data.length} tagged post(s) via /tagged edge.`);
        }
      }
    } catch (taggedErr) {
      console.warn('⚠️ [/tagged] Wall fetch failed, continuing with /posts only:', taggedErr.message);
    }

    const merged = mergePostEdges(markSource(data.data || [], 'posts'), markSource(taggedData.data || [], 'tagged'));
    if (merged.length === 0) {
      failInCi(`Graph API returned no post data (token expired or invalid?): ${JSON.stringify(data.error || data).slice(0, 300)}`);
      return [];
    }

    const candidatePosts = [];
    let tiltIndex = 0;

    for (const post of merged) {
      const message = post.message || post.story || '';

      // Skip operational or business announcements (keep the wall for guest moments)
      const isAnnouncement = /source locally|now online|bulk order|advisory|hiring|schedule|we are open today|closed|loyalty|stamp|free coffee|merch|cycle 0/i.test(message);
      if (isAnnouncement) continue;

      // One entry PER IMAGE so shared carousels fan out to p1..pn cards.
      // Uses shared extractor (wrapper media → all subattachments → full_picture).
      const entries = buildCommunityEntries(post, { tiltIndex });
      for (const entry of entries) {
        candidatePosts.push(entry);
        tiltIndex++;
      }
    }

    return candidatePosts;
  } catch (err) {
    failInCi(`Error querying Facebook Graph API: ${err.message}`);
    return [];
  }
}

const WALL_BATCH = 8;
const BUCKET = 'community-cache';

async function main() {
  console.log('📸 [BAIA Community Wall] Collecting photos from Facebook posts...');
  requireCiSecrets({ FB_PAGE_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY });

  const fbPosts = await queryFacebookForGuestPhotos(FB_PAGE_ID, FB_PAGE_ACCESS_TOKEN);
  console.log(`📥 Retrieved ${fbPosts.length} candidate photo(s) from Facebook.`);

  // Deterministic screen: notice/hiring posts are text graphics, not moments.
  const candidates = fbPosts.filter((item) => !isWallNoticePost({ message: item.caption }));
  if (candidates.length < fbPosts.length) {
    console.log(`⏭️ Skipped ${fbPosts.length - candidates.length} notice/hiring photo(s).`);
  }

  // Download newest-first until the batch has WALL_BATCH distinct photos.
  // Facebook often serves one photo under several URLs, so repeats are
  // detected by content hash, not URL.
  const downloaded = [];
  const seen = new Set();
  for (const item of candidates) {
    if (downloaded.length >= WALL_BATCH) break;
    const buffer = await fetchImage(item.photo_url);
    if (!buffer) continue;
    const hash = 'sha1:' + createHash('sha1').update(buffer).digest('hex');
    if (seen.has(hash)) continue;
    seen.add(hash);
    downloaded.push({ ...item, _buffer: buffer, _hash: hash });
  }
  const finalItems = dedupeByContentHash(downloaded, (it) => it._hash, new Set()).items;

  // Never wipe the wall: if nothing usable came back, leave Supabase as is.
  if (finalItems.length === 0) {
    console.log('⚠️ [Wall Guard] No usable photos this run; existing wall kept.');
    return;
  }

  await syncWallToSupabase(finalItems);
}

/** Upload a photo as `${name}.webp` plus a small `thumb_${name}.webp` tile. */
async function storeWallImage(supabase, name, buffer) {
  const url = await uploadWebp(supabase, BUCKET, name, await toWebp(buffer));
  if (url) await uploadWebp(supabase, BUCKET, `thumb_${name}`, await toWebp(buffer, THUMB_SIDE, 70));
  return url;
}

/**
 * Mirror wall items to Supabase (`community_wall` table + `community-cache`
 * bucket). Gracefully skips when credentials are absent (local runs).
 */
async function syncWallToSupabase(wallItems) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log('ℹ️ [Supabase] No credentials: nothing to store (local dry run).');
    return;
  }
  try {
    console.log(`📡 [Supabase] Syncing ${wallItems.length} wall photo(s) to public.community_wall...`);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      if (!buckets?.some((b) => b.name === BUCKET)) {
        await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 5242880 });
      }
    } catch (bErr) {
      console.warn('⚠️ [Storage Notice]:', bErr.message);
    }

    // 1. Images: reuse cached WebPs, upload the rest (photo + tile thumb).
    const { data: existingRows } = await supabase.from('community_wall').select('id,photo_url');
    const existingPhoto = new Map((existingRows || []).map((r) => [r.id, r.photo_url]));
    let uploaded = 0;
    for (const item of wallItems) {
      const id = String(item.id);
      const cached = existingPhoto.get(id);
      if (isCachedWebp(cached, BUCKET)) {
        item.photo_url = cached;
        continue;
      }
      const url = await storeWallImage(supabase, `wall_${safeName(id)}`, item._buffer);
      if (url) {
        item.photo_url = url;
        uploaded++;
      } else if (cached) {
        item.photo_url = cached;
      }
    }

    // 2. Upsert rows
    const rows = wallItems.map((item) => ({
      id: String(item.id),
      photo_url: item.photo_url,
      caption: item.caption || null,
      guest_name: item.guest_name || null,
      tagline: item.tagline || null,
      date: item.date || null,
      source: item.source || null,
      permalink: item.permalink || null,
      tilt: item.tilt || null,
    }));
    const { error: upsertErr } = await supabase.from('community_wall').upsert(rows, { onConflict: 'id' });
    if (upsertErr) failInCi(`Could not upsert community wall: ${upsertErr.message}`);

    // 3. Older rows the site still shows (latest 16): convert legacy .jpg copies.
    const { data: latest } = await supabase
      .from('community_wall').select('id,photo_url').order('created_at', { ascending: false }).limit(16);
    for (const r of latest || []) {
      if (isCachedWebp(r.photo_url, BUCKET)) continue;
      const buffer = await fetchImage(r.photo_url);
      const url = buffer && await storeWallImage(supabase, `wall_${safeName(r.id)}`, buffer);
      if (url) {
        await supabase.from('community_wall').update({ photo_url: url }).eq('id', r.id);
        uploaded++;
      }
    }
    console.log(`🖼️ [Images] Stored ${uploaded} wall photo(s) as WebP (+ tile thumbs).`);

    // 4. Storage cleanup: delete only files that NO row uses.
    try {
      const [{ data: files }, { data: allRows }] = await Promise.all([
        supabase.storage.from(BUCKET).list(undefined, { limit: 1000 }),
        supabase.from('community_wall').select('photo_url'),
      ]);
      const inUse = new Set();
      for (const r of allRows || []) {
        const name = storageName(r.photo_url);
        if (name) inUse.add(name).add(`thumb_${name}`);
      }
      const toPurge = (files || [])
        .filter((f) => /^(thumb_)?wall_/.test(f.name) && !inUse.has(f.name))
        .map((f) => f.name);
      if (toPurge.length > 0) {
        await supabase.storage.from(BUCKET).remove(toPurge);
        console.log(`🧹 [Storage] Removed ${toPurge.length} unused wall image(s).`);
      }
    } catch (gcErr) {
      console.warn('⚠️ [Storage cleanup]:', gcErr.message);
    }
    console.log('✅ [Supabase] Wall photos live in public.community_wall!');
  } catch (sbErr) {
    failInCi(`Error syncing wall to Supabase: ${sbErr.message}`);
  }
}

// Only run when executed directly (`npm run sync:community`), never on import:
// importing this file used to start a real sync with live API calls.
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
