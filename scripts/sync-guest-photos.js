/**
 * BAIA Cafe — Facebook Community Wall of Supporters Sync Script
 *
 * Fetches Facebook Page posts (/posts) + tagged posts (/tagged), guest
 * check-ins, and shared customer photos. Share-wrappers carry photos in
 * `subattachments` / `full_picture` (see scripts/fb-post-utils.js).
 * Screens candidates using Gemini 1.5 Flash (free tier) to verify cute aesthetics.
 * Outputs curated data to src/data/community-reviews.json AND
 * public/data/community-reviews.json (runtime fetch for the live photowall).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  buildCommunityEntries,
  buildPostsUrl,
  buildTaggedUrl,
  dedupeByContentHash,
  extractImageUrls,
  isShareWrapper,
  markSource,
  mergePostEdges,
} from './fb-post-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const COMMUNITY_FILE = path.join(ROOT_DIR, 'src', 'data', 'community-reviews.json');
// Public copy so src/components/communityWall.js can fetch() it at runtime
// without a rebuild — this is what actually updates the live coffee photowall.
const COMMUNITY_PUBLIC_FILE = path.join(ROOT_DIR, 'public', 'data', 'community-reviews.json');
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
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Curated baseline community guest moments from Laurentte beach
const FALLBACK_COMMUNITY_POSTS = [
  {
    id: "guest_beach_chill_1",
    photo_url: "/images/beachandchill.webp",
    caption: "Sunsets and cold brew right by the water. Hands down the most relaxing spot on Masbate shore.",
    guest_name: "Abeneil M. & Friends",
    tagline: "Golden Hour Regulars",
    date: "February 2026",
    rating: 5,
    source: "Facebook Community Check-in",
    permalink: "https://www.facebook.com/thebaiacafe",
    tilt: "-2deg"
  },
  {
    id: "guest_afternoon_2",
    photo_url: "/images/afternoonchill.webp",
    caption: "Finally tried the Asin Tibuok Latte with double smash burgers. Pure coastal magic!",
    guest_name: "Bianca & Mark",
    tagline: "Weekend Explorers",
    date: "February 2026",
    rating: 5,
    source: "Shared Facebook Story",
    permalink: "https://www.facebook.com/thebaiacafe",
    tilt: "2.5deg"
  },
  {
    id: "guest_skimboard_3",
    photo_url: "/images/skimboard.webp",
    caption: "Free skimboard rides right outside while waiting for croffles. Kids and friends loved every minute.",
    guest_name: "Kyla S.",
    tagline: "Beach Adventurer",
    date: "January 2026",
    rating: 5,
    source: "Facebook Guest Review",
    permalink: "https://www.facebook.com/thebaiacafe",
    tilt: "-1.5deg"
  },
  {
    id: "guest_dusk_4",
    photo_url: "/images/afterdusk.webp",
    caption: "The evening bistro lights on the sand with the sound of the waves... best coffee vibe anywhere.",
    guest_name: "Norman M.",
    tagline: "Sunset Regular",
    date: "January 2026",
    rating: 5,
    source: "Facebook Recommendation",
    permalink: "https://www.facebook.com/thebaiacafe",
    tilt: "1.8deg"
  },
  {
    id: "guest_evening_5",
    photo_url: "/images/eveningmood.webp",
    caption: "Night sessions under the palms with sea breeze and hot brew. Thank you for accommodating our group!",
    guest_name: "The San Pascual Crew",
    tagline: "Night Chillers",
    date: "February 2026",
    rating: 5,
    source: "Facebook Community Post",
    permalink: "https://www.facebook.com/thebaiacafe",
    tilt: "-2.2deg"
  },
  {
    id: "guest_cottage_6",
    photo_url: "/images/Cottage.webp",
    caption: "Rented the floating cottage for the afternoon and BAIA delivered iced drinks right to our boat!",
    guest_name: "Dave & Family",
    tagline: "Island Hoppers",
    date: "December 2025",
    rating: 5,
    source: "Facebook Review",
    permalink: "https://www.facebook.com/thebaiacafe",
    tilt: "2deg"
  }
];

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
      console.warn('⚠️ Graph API response did not contain data array');
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
    console.warn('⚠️ Error querying Facebook Graph API:', err.message);
    return [];
  }
}

async function verifyCutePhotosWithGemini(photos) {
  if (!GEMINI_API_KEY || photos.length === 0) {
    return photos;
  }

  console.log(`🤖 Screening ${photos.length} candidate photo(s) with Gemini Vision...`);
  const approved = [];
  for (const item of photos.slice(0, 8)) {
    try {
      const prompt = `You are an aesthetic curator for BAIA Cafe, a beachside coffee shop in Masbate, Philippines.
The cafe has a photo wall of supporters and guests.
Examine this image caption: "${item.caption}".
Is this a cute, welcoming moment (e.g. happy people, coffee moments, friends on the beach, pleasant coastal vibe)?
Respond with JSON only: {"is_cute": true, "clean_caption": "short warm 1-sentence caption", "guest_tag": "short title like Beach Regular / Coffee Explorer"}`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      if (res.ok) {
        const geminiData = await res.json();
        const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        const parsed = JSON.parse(text);
        if (parsed.is_cute !== false) {
          if (parsed.clean_caption) item.caption = parsed.clean_caption;
          if (parsed.guest_tag) item.tagline = parsed.guest_tag;
          approved.push(item);
        }
      } else {
        approved.push(item);
      }
    } catch {
      approved.push(item);
    }
  }

  return approved.length >= 3 ? approved : photos;
}

async function downloadAndCachePhoto(url, id) {
  if (!url || !url.startsWith('http')) return url;
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `guest_${safeId}.jpg`;
  const filePath = path.join(ROOT_DIR, 'public', 'images', 'community', fileName);
  if (fs.existsSync(filePath)) {
    return `/images/community/${fileName}`;
  }
  try {
    const res = await fetch(url);
    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(filePath, buffer);
      console.log(`💾 Cached community photo: ${fileName}`);
      return `/images/community/${fileName}`;
    }
  } catch (err) {
    console.warn(`Failed to cache image for ${id}:`, err.message);
  }
  return url;
}

async function main() {
  console.log('📸 [BAIA Community Wall] Curating Guest & Supporter Collage...');
  
  let fbPosts = await queryFacebookForGuestPhotos(FB_PAGE_ID, FB_PAGE_ACCESS_TOKEN);
  console.log(`📥 Retrieved ${fbPosts.length} potential guest moment(s) from Facebook.`);

  let curated = [];
  if (fbPosts.length > 0) {
    curated = await verifyCutePhotosWithGemini(fbPosts);
  }

  // Cache photos locally to prevent expiration
  for (const item of curated) {
    if (item.photo_url?.startsWith('http')) {
      item.photo_url = await downloadAndCachePhoto(item.photo_url, item.id);
    }
  }

  // Ensure at least 6 entries for a lush photo wall
  if (curated.length < 6) {
    const existingIds = new Set(curated.map(c => c.id));
    for (const fb of FALLBACK_COMMUNITY_POSTS) {
      if (!existingIds.has(fb.id)) {
        curated.push(fb);
      }
      if (curated.length >= 6) break;
    }
  }

  const wallItems = curated.slice(0, 8);

  // Drop byte-identical repeats WITHIN this batch: Facebook often serves the
  // SAME photo under multiple subattachment URLs (or reposts it), and
  // URL-dedupe can't catch that. Never compare against the committed history —
  // the wall selection is rebuilt every run, so cached photos reappearing is
  // normal and must not empty the wall.
  const contentHashFor = (item) => {
    const u = item.photo_url;
    if (typeof u === 'string' && u.startsWith('/images/')) {
      const p = path.join(ROOT_DIR, 'public', u.replace(/^\//, ''));
      if (fs.existsSync(p)) {
        return 'sha1:' + createHash('sha1').update(fs.readFileSync(p)).digest('hex');
      }
    }
    return 'url:' + String(u);
  };
  const deduped = dedupeByContentHash(wallItems, contentHashFor, new Set());
  if (deduped.removed > 0) {
    console.log(`🧹 [Dedupe] Dropped ${deduped.removed} byte-identical repeat photo(s).`);
  }
  let finalItems = deduped.items;

  // Top up from the curated baseline when the batch runs thin.
  if (finalItems.length < 6) {
    const existingIds = new Set(finalItems.map((c) => c.id));
    for (const fb of FALLBACK_COMMUNITY_POSTS) {
      if (!existingIds.has(fb.id)) {
        finalItems.push(fb);
        existingIds.add(fb.id);
      }
      if (finalItems.length >= 6) break;
    }
  }
  finalItems = finalItems.slice(0, 8);

  // Never wipe the wall: if selection collapsed entirely, keep the previous file.
  if (finalItems.length === 0 && fs.existsSync(COMMUNITY_PUBLIC_FILE)) {
    try {
      finalItems = JSON.parse(fs.readFileSync(COMMUNITY_PUBLIC_FILE, 'utf-8'));
      console.log(`⚠️ [Wall Guard] Empty selection — kept previous ${finalItems.length} wall photo(s).`);
    } catch {
      finalItems = [];
    }
  }

  // No magic grid coordinates are stored: the browser computes collision-free
  // cells from the live DOM at runtime (see communityWall.js rankFreeCells).
  // Strip any stale slots so old magic cells can never stack again.
  for (const item of finalItems) {
    delete item.gc;
    delete item.gr;
    delete item.mgc;
    delete item.mgr;
  }

  fs.mkdirSync(path.dirname(COMMUNITY_FILE), { recursive: true });
  fs.writeFileSync(COMMUNITY_FILE, JSON.stringify(finalItems, null, 2), 'utf-8');
  console.log(`✅ Saved ${finalItems.length} cute supporter moments to ${COMMUNITY_FILE}`);

  // Public runtime copy — fetched by src/components/communityWall.js to
  // actually update the live coffee photowall without a rebuild.
  fs.mkdirSync(path.dirname(COMMUNITY_PUBLIC_FILE), { recursive: true });
  fs.writeFileSync(COMMUNITY_PUBLIC_FILE, JSON.stringify(finalItems, null, 2), 'utf-8');
  console.log(`✅ Mirrored wall data to ${COMMUNITY_PUBLIC_FILE} (live photowall hydration)`);

  // Live backend mirror — upserts wall rows + caches images in Supabase so the
  // scheduled cron updates the live photowall with zero git churn (same pattern
  // as the drops table). First run backfills existing entries automatically.
  await syncWallToSupabase(finalItems);
}

/**
 * Mirror wall items to Supabase (`community_wall` table + `community-cache`
 * bucket). Gracefully skips when credentials are absent — JSON files above
 * remain the offline fallback.
 */
async function syncWallToSupabase(wallItems) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log('ℹ️ [Supabase] No credentials — skipping live wall mirror (JSON fallback written).');
    return;
  }
  try {
    console.log(`📡 [Supabase] Syncing ${wallItems.length} wall photo(s) to public.community_wall...`);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 1. Ensure 'community-cache' public bucket exists
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      if (!buckets?.some((b) => b.name === 'community-cache')) {
        await supabase.storage.createBucket('community-cache', { public: true, fileSizeLimit: 5242880 });
      }
    } catch (bErr) {
      console.warn('⚠️ [Storage Notice]:', bErr.message);
    }

    // 2. Cache each wall image in the bucket (remote fetch, else local file)
    const rows = [];
    for (const item of wallItems) {
      let bucketUrl = null;
      try {
        const safeId = String(item.id).replace(/[^a-zA-Z0-9_-]/g, '_');
        const fileName = `wall_${safeId}.jpg`;
        let buffer = null;

        if (typeof item.photo_url === 'string' && item.photo_url.startsWith('http') && !item.photo_url.includes('supabase.co')) {
          const resp = await fetch(item.photo_url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BaiaWallSync/1.0)' },
          });
          if (resp.ok) buffer = Buffer.from(await resp.arrayBuffer());
        } else if (typeof item.photo_url === 'string' && item.photo_url.startsWith('/images/')) {
          const localPath = path.join(ROOT_DIR, 'public', item.photo_url.replace(/^\//, ''));
          if (fs.existsSync(localPath)) buffer = fs.readFileSync(localPath);
        }

        if (buffer) {
          const { error: upErr } = await supabase.storage
            .from('community-cache')
            .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: true });
          if (!upErr) {
            const { data: { publicUrl } } = supabase.storage.from('community-cache').getPublicUrl(fileName);
            bucketUrl = publicUrl;
          }
        }
      } catch (imgErr) {
        console.warn(`⚠️ [Image Cache Notice] Could not cache wall image for ${item.id}:`, imgErr.message);
      }

      rows.push({
        id: String(item.id),
        photo_url: bucketUrl || item.photo_url,
        caption: item.caption || null,
        guest_name: item.guest_name || null,
        tagline: item.tagline || null,
        date: item.date || null,
        rating: item.rating || 5,
        source: item.source || null,
        permalink: item.permalink || null,
        tilt: item.tilt || null,
        gc: item.gc ?? null,
        gr: item.gr ?? null,
        mgc: item.mgc ?? null,
        mgr: item.mgr ?? null,
        z: item.z ?? null,
      });
    }

    // 3. Upsert rows
    const { error: upsertErr } = await supabase.from('community_wall').upsert(rows, { onConflict: 'id' });
    if (upsertErr) {
      console.warn('⚠️ [Supabase Warning] Could not upsert community wall:', upsertErr.message);
    } else {
      console.log('✅ [Supabase] Wall photos live in public.community_wall!');
    }

    // 4. Rolling GC: keep only images referenced by the latest 16 rows
    // (~1–2 MB, same pattern as the drops-cache collector).
    try {
      const { data: files } = await supabase.storage.from('community-cache').list();
      if (files && files.length > 16) {
        const active = new Set(
          rows.map((r) => r.photo_url?.split('/').pop()).filter(Boolean)
        );
        const toPurge = files
          .filter((f) => f.name.startsWith('wall_') && !active.has(f.name))
          .map((f) => f.name);
        if (toPurge.length > 0) {
          console.log(`🧹 [Rolling Memory] Pruning ${toPurge.length} older wall image(s)...`);
          await supabase.storage.from('community-cache').remove(toPurge);
        }
      }
    } catch (gcErr) {
      console.warn('⚠️ [Rolling Memory Warning]:', gcErr.message);
    }
  } catch (sbErr) {
    console.warn('⚠️ [Supabase Warning] Error syncing wall to Supabase:', sbErr.message);
  }
}

main().catch(console.error);
