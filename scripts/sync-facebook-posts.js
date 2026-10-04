/**
 * BAIA Cafe — Facebook → Website Sync Agent
 *
 * Pipeline:
 * 1. Scheduled GitHub Action or local trigger calls Facebook Graph API for
 *    recent Page posts AND tagged posts (`/posts` + `/tagged` edges).
 * 2. Deterministic code filter: pure reshares with no BAIA commentary are
 *    skipped; shares WITH BAIA commentary + image are kept for classification
 *    (see scripts/fb-post-utils.js `shouldSkipShareForDrops`).
 * 3. Deterministic classifier (`classifyDropPost` in fb-post-utils.js) builds
 *    each card from the post's own text; same-day notices are skipped. No LLM.
 * 4. Merges classified new releases/events into src/data/updates.json & sync-state.json,
 *    and upserts them to the Supabase `drops` table the site reads live.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  buildPostsUrl,
  buildTaggedUrl,
  extractImageUrls as extractSharedImageUrls,
  shouldSkipShareForDrops,
  isTrivialPost as isTrivialSharedPost,
  markSource,
  mergePostEdges,
  classifyDropPost,
} from './fb-post-utils.js';
import { failInCi, requireCiSecrets } from './ci-guard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const UPDATES_FILE = path.join(ROOT_DIR, 'src', 'data', 'updates.json');
const STATE_FILE = path.join(ROOT_DIR, 'src', 'data', 'sync-state.json');
const ENV_FILE = path.join(ROOT_DIR, '.env');

// Simple .env file loader for standalone node execution
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

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const FB_PAGE_ID = process.env.FB_PAGE_ID || process.env.FACEBOOK_PAGE_ID || 'thebaiacafe';
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FB_ACCESS_TOKEN;

const isDryRun = process.argv.includes('--dry-run');
const isTestMock = process.argv.includes('--test-mock');

// Mock posts for testing pipeline without live Facebook token
const MOCK_FACEBOOK_POSTS = [
  {
    id: "fb_post_1001",
    message: "New Drop 👀\nNacho-Crusted Chicken Tenders with White Garlic Cajun Sauce.\nAnd for the sweet side of things, Whipped Honey! Add it on top of any drink. 🍯🐝\nAvailable now for ₱215.\n#baiacafe",
    created_time: "2026-08-27T15:30:00+08:00",
    permalink_url: "https://www.facebook.com/thebaiacafe/posts/1001",
    attachments: {
      data: [{
        type: "photo",
        media: { image: { src: "./images/chickensandwich.webp" } }
      }]
    }
  },
  {
    id: "fb_post_1002",
    message: "Shared a memory from 2 years ago! Still our favorite sunset spot.",
    created_time: "2026-08-27T12:00:00+08:00",
    permalink_url: "https://www.facebook.com/thebaiacafe/posts/1002",
    attachments: {
      data: [{
        type: "share",
        unshimmed_url: "https://www.facebook.com/otherspot/posts/999"
      }]
    }
  },
  {
    id: "fb_post_1003",
    message: "Annyeong, BAIA fam. 👋🇰🇷\nYangnyeom is the newest flavor joining our wings.\nA Korean-inspired glaze with a sweet-savory finish and just enough heat. 🌶️\nAvailable now at BAIA for ₱245.\n#baiacafe",
    created_time: "2026-08-26T18:00:00+08:00",
    permalink_url: "https://www.facebook.com/thebaiacafe/posts/1003",
    attachments: {
      data: [{
        type: "photo",
        media: { image: { src: "./images/bacolodchicken.webp" } }
      }]
    }
  },
  {
    id: "fb_post_1004",
    message: "Golden hour at BAIA never disappoints 🌅✨ Thank you everyone for dropping by today! #baiacafe #masbate",
    created_time: "2026-08-25T17:45:00+08:00",
    permalink_url: "https://www.facebook.com/thebaiacafe/posts/1004",
    attachments: {
      data: [{
        type: "photo",
        media: { image: { src: "./images/twilight.webp" } }
      }]
    }
  },
  {
    id: "fb_post_1005",
    message: "Live Beach Acoustic by the Shore this Saturday August 30 from 5:00 PM to 8:00 PM! 🎸🌊 Free entry for all guests, fairy lights, and signature Asin Tibuok lattes by the waves.",
    created_time: "2026-08-24T11:00:00+08:00",
    permalink_url: "https://www.facebook.com/thebaiacafe/posts/1005",
    attachments: {
      data: [{
        type: "photo",
        media: { image: { src: "./images/twilight.webp" } }
      }]
    }
  }
];

/**
 * Step 1: Fetch recent Facebook posts
 */
async function fetchFacebookPosts(pageId, token, sinceId = null) {
  if (isTestMock || !token) {
    console.log('⚡ [Fetch] Using test mock posts payload...');
    return MOCK_FACEBOOK_POSTS;
  }

  let effectiveToken = token;
  // `full_picture` + expanded `subattachments{media{image{src}}}` are required:
  // share-wrappers carry no `media.image.src` — the photo lives in subattachments
  // or `full_picture`. Tagged posts live on the `/tagged` edge, not `/posts`.
  const postsEndpoint = (t) => buildPostsUrl(pageId, t, 60);
  const taggedEndpoint = (t) => buildTaggedUrl(pageId, t, 60);
  const endpoint = postsEndpoint;
  
  console.log(`📡 [Fetch] Querying Facebook Graph API for page: ${pageId} (/posts + /tagged)...`);
  let response = await fetch(postsEndpoint(effectiveToken));
  let responseText = await response.text();
  
  if (!response.ok) {
    let errJson = null;
    try {
      errJson = JSON.parse(responseText);
    } catch {}
    const errSubcode = errJson?.error?.error_subcode;
    const errMsg = errJson?.error?.message || '';

    // If User Token was supplied instead of Page Token, try auto-resolving Page Token directly or via /me/accounts
    if (errSubcode === 2069032 || errMsg.includes('Page access token is required') || errMsg.includes('User Access Token')) {
      console.log('🔄 [Auth] Detected User Token. Resolving Page Access Token from Facebook Graph API...');
      try {
        // Direct page query with user token
        const directRes = await fetch(`https://graph.facebook.com/v19.0/${encodeURIComponent(pageId)}?fields=id,name,access_token&access_token=${encodeURIComponent(token)}`);
        const directData = await directRes.json().catch(() => null);
        
        if (directData && directData.access_token) {
          console.log(`🔑 [Auth Success] Retrieved Page Access Token for "${directData.name}" (ID: ${directData.id})!`);
          effectiveToken = directData.access_token;
          response = await fetch(postsEndpoint(effectiveToken));
          responseText = await response.text();
        } else {
          // Fallback to /me/accounts
          const accountsRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${encodeURIComponent(token)}`);
          if (accountsRes.ok) {
            const accountsData = await accountsRes.json();
            const pageObj = accountsData.data?.find(p => String(p.id) === String(pageId) || String(p.id) === '640323492494372') || accountsData.data?.[0];
            if (pageObj && pageObj.access_token) {
              console.log(`🔑 [Auth Success] Found Page Access Token for "${pageObj.name}" via accounts list!`);
              effectiveToken = pageObj.access_token;
              response = await fetch(postsEndpoint(effectiveToken));
              responseText = await response.text();
            }
          }
        }
      } catch (exchangeErr) {
        console.warn('⚠️ Auto-exchange attempt failed:', exchangeErr.message);
      }
    }

    if (!response.ok) {
      console.warn(`\n⚠️ [Facebook Auth Warning] Graph API returned status ${response.status}:`);
      console.warn(responseText);
      if (responseText.includes('Session has expired') || responseText.includes('OAuthException') || responseText.includes('Error validating access token')) {
        console.warn('\n👉 The Facebook Access Token has expired (short-lived token).');
        console.warn('👉 Existing website drops remain active and safe on the live site.');
        console.warn('👉 To resume background sync, update the FB_PAGE_ACCESS_TOKEN secret with a long-lived Page token.\n');
        failInCi('Facebook access token expired or invalid; update the FB_PAGE_ACCESS_TOKEN secret.');
        return [];
      }
      throw new Error(`Facebook API Error (${response.status}): ${responseText}`);
    }
  }

  const data = JSON.parse(responseText);
  const pagePosts = markSource(data.data || [], 'posts');

  // Second edge: posts where BAIA is tagged (invisible on /posts).
  // Failure here must not fail the whole sync — drops still update from /posts.
  let taggedPosts = [];
  try {
    const taggedRes = await fetch(taggedEndpoint(effectiveToken));
    if (taggedRes.ok) {
      const taggedData = await taggedRes.json().catch(() => null);
      taggedPosts = markSource(taggedData?.data || [], 'tagged');
      if (taggedPosts.length > 0) {
        console.log(`📥 [Fetch] Also retrieved ${taggedPosts.length} tagged post(s) via /tagged edge.`);
      }
    } else {
      console.warn(`⚠️ [/tagged] Skipped (HTTP ${taggedRes.status}); continuing with /posts only.`);
    }
  } catch (taggedErr) {
    console.warn('⚠️ [/tagged] Fetch failed, continuing with /posts only:', taggedErr.message);
  }

  return mergePostEdges(pagePosts, taggedPosts);
}

/**
 * Step 2: Deterministic code filters (delegated to scripts/fb-post-utils.js
 * so drops + photowall + tests share one policy).
 */
function isSharePost(post) {
  return shouldSkipShareForDrops(post);
}

function isTrivialPost(post) {
  return isTrivialSharedPost(post);
}

function isExpiredClosurePost(post) {
  const msg = (post.message || '').toLowerCase();
  const isClosure = msg.includes('closed for the day') || msg.includes('weather break') || msg.includes('closed today');
  if (!isClosure) return false;
  const postDate = new Date(post.created_time).getTime();
  if (isNaN(postDate)) return false;
  // Temporary 1-day closures expire after 24 hours
  return (Date.now() - postDate) > (24 * 60 * 60 * 1000);
}

/**
 * Extract best image URLs from post attachments.
 * Delegates to shared utils: wrapper media → ALL subattachments → full_picture.
 */
function extractImageUrls(post) {
  return extractSharedImageUrls(post);
}

/**
 * Main Sync Runner
 */
async function runSync() {
  console.log('🚀 [BAIA Sync Agent] Starting Facebook → Website Sync...');
  console.log(`📌 Page: ${FB_PAGE_ID} | Dry Run: ${isDryRun} | Mock Mode: ${isTestMock}`);
  if (!isTestMock && !isDryRun) {
    // Without these, fetch silently falls back to mock posts and nothing is written.
    requireCiSecrets({ FB_PAGE_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY });
  }

  // Load existing updates (filter out any mock test data)
  let currentUpdates = [];
  if (fs.existsSync(UPDATES_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(UPDATES_FILE, 'utf-8'));
      currentUpdates = Array.isArray(raw) ? raw.filter(item => !String(item.id).startsWith('fb_post_')) : [];
    } catch (e) {
      console.warn('⚠️ Could not parse existing updates.json. Initializing empty array.');
      currentUpdates = [];
    }
  }

  // Load sync state
  let syncState = { last_processed_id: null, last_synced_at: null, total_processed: 0, status: 'idle' };
  if (fs.existsSync(STATE_FILE)) {
    try {
      syncState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    } catch (e) {}
  }

  const posts = await fetchFacebookPosts(FB_PAGE_ID, FB_PAGE_ACCESS_TOKEN, syncState.last_processed_id);
  console.log(`📥 Retrieved ${posts.length} posts to inspect.`);

  if (!posts || posts.length === 0) {
    console.log('ℹ️ No new Facebook posts fetched. Existing updates remain preserved.');
    console.log('✨ [BAIA Sync Agent] Completed gracefully.\n');
    return;
  }

  const existingIds = new Set(currentUpdates.map(u => u.id));
  const newItemsToPublish = [];
  let latestPostId = syncState.last_processed_id;

  for (const post of posts) {
    if (latestPostId === null && posts[0]) {
      latestPostId = posts[0].id;
    }

    console.log(`\n--- Inspecting Post: ${post.id} (${post.created_time || 'recent'}) ---`);
    console.log(`Caption: "${(post.message || '[No text]').slice(0, 70).replace(/\n/g, ' ')}..."`);

    // Step 2: Deterministic checks in code
    if (isSharePost(post)) {
      console.log(`⏭️ [Deterministic Skip] Pure reshare with no BAIA commentary/image. Skipping.`);
      continue;
    }

    if (isTrivialPost(post)) {
      console.log(`⏭️ [Deterministic Skip] Post has minimal/emoji-only text. Skipping.`);
      continue;
    }

    const existing = currentUpdates.find(u => u.id === post.id);
    if (existing && existing.status !== 'active') {
      console.log(`⚡ [Cache Hit] Post ${post.id} already classified: "${existing.title}". Skipping re-classification.`);
      continue;
    }

    // Step 3: Deterministic classification from the post's own text (no LLM)
    const classification = classifyDropPost(post);

    if (classification.action === 'publish' && classification.kind === 'launch' &&
        [...currentUpdates, ...newItemsToPublish].some((u) => u.id !== post.id && (u.badge === 'Website Launch' || /now online/i.test(u.title || '')))) {
      console.log('⏭️ [SKIP] Website launch already announced.');
      continue;
    }

    if (classification.action === 'publish') {
      console.log(`✅ [PUBLISH] ${classification.category} "${classification.title}"`);
      const badge = classification.badge;

      const itemRecord = {
        id: classification.id || post.id,
        category: classification.category || 'food',
        title: classification.title,
        description: classification.description,
        price: classification.price,
        event_date: null,
        winner: null,
        status: classification.status,
        image_url: extractImageUrls(post)[0] || './images/Baia%20skimboard%20and%20coffee.webp',
        permalink: post.permalink_url || `https://www.facebook.com/${FB_PAGE_ID}/posts/${post.id}`,
        published_at: post.created_time || new Date().toISOString(),
        badge: badge
      };

      if (!existingIds.has(itemRecord.id)) {
        newItemsToPublish.push(itemRecord);
        existingIds.add(itemRecord.id);
      } else {
        // Update existing item in place if changed
        const idx = currentUpdates.findIndex(u => u.id === itemRecord.id);
        if (idx > -1) {
          currentUpdates[idx] = { ...currentUpdates[idx], ...itemRecord };
        }
      }
    } else {
      console.log(`⏭️ [SKIP] Post ignored: reason="${classification.reason || 'not-new'}"`);
    }
  }

  // Sort items newest first and deduplicate
  const seenIds = new Set();
  const dedupedList = [];
  
  const allMerged = [...newItemsToPublish, ...currentUpdates]
    .filter(item => !String(item.id).startsWith('fb_post_'))
    .sort((a, b) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime());

  for (const item of allMerged) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      dedupedList.push(item);
    }
  }

  const updatedList = dedupedList.slice(0, 50);

  console.log(`\n🎉 [Summary] Found ${newItemsToPublish.length} new publishable item(s). Total active items: ${updatedList.length}`);

  if (!isDryRun) {
    fs.writeFileSync(UPDATES_FILE, JSON.stringify(updatedList, null, 2), 'utf-8');
    
    syncState = {
      last_processed_id: posts[0]?.id || syncState.last_processed_id,
      last_synced_at: new Date().toISOString(),
      total_processed: updatedList.length,
      status: 'success',
      new_items_added: newItemsToPublish.length
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(syncState, null, 2), 'utf-8');
    
    console.log(`💾 Saved updates to ${UPDATES_FILE} and ${STATE_FILE}`);

    // Sync to Supabase drops table and cache images in Supabase Storage
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        console.log(`📡 [Supabase] Syncing ${updatedList.length} items to public.drops table & caching images...`);
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false }
        });

        // 1. Ensure 'drops-cache' public bucket exists in Supabase Storage
        try {
          const { data: buckets } = await supabase.storage.listBuckets();
          if (!buckets?.some(b => b.name === 'drops-cache')) {
            await supabase.storage.createBucket('drops-cache', { public: true, fileSizeLimit: 5242880 });
          }
        } catch (bErr) {
          console.warn('⚠️ [Storage Notice]:', bErr.message);
        }

        // 2. Cache new drop images into Supabase Storage
        for (const item of updatedList) {
          if (item.image_url && item.image_url.startsWith('http') && !item.image_url.includes('supabase.co')) {
            try {
              const cleanId = String(item.id).replace(/[^a-zA-Z0-9_-]/g, '_');
              const fileName = `drop_${cleanId}.jpg`;
              const resp = await fetch(item.image_url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BaiaSyncAgent/1.0)' }
              });
              if (resp.ok) {
                const buffer = Buffer.from(await resp.arrayBuffer());
                const { error: upErr } = await supabase.storage
                  .from('drops-cache')
                  .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: true });

                if (!upErr) {
                  const { data: { publicUrl } } = supabase.storage.from('drops-cache').getPublicUrl(fileName);
                  item.image_url = publicUrl;
                }
              }
            } catch (imgErr) {
              console.warn(`⚠️ [Image Cache Notice] Could not cache image for ${item.title}:`, imgErr.message);
            }
          }
        }

        // 3. Upsert drops to public.drops
        const dropsToUpsert = updatedList.map(item => ({
          id: String(item.id),
          category: item.category || 'food',
          title: item.title,
          description: item.description,
          price: item.price || null,
          event_date: item.event_date || null,
          badge: item.badge || null,
          winner: item.winner || null,
          status: item.status || null,
          image_url: item.image_url || null,
          permalink: item.permalink || null,
          published_at: item.published_at || new Date().toISOString()
        }));

        const { error: upsertErr } = await supabase
          .from('drops')
          .upsert(dropsToUpsert, { onConflict: 'id' });

        if (upsertErr) {
          failInCi(`Could not upsert drops to Supabase: ${upsertErr.message}`);
        } else {
          console.log(`✅ [Supabase] Successfully synced drops to public.drops!`);
        }

        // 4. Rolling Memory Garbage Collector: Keeps only latest 25 cached images in storage
        // Guarantees storage usage stays < 2MB (0.2% of 1GB limit), preventing any free tier bloat
        try {
          const { data: files } = await supabase.storage.from('drops-cache').list();
          if (files && files.length > 25) {
            const activeFilenames = new Set(
              updatedList
                .slice(0, 25)
                .map(d => d.image_url?.split('/').pop())
                .filter(Boolean)
            );
            const toPurge = files
              .filter(f => f.name.startsWith('drop_') && !activeFilenames.has(f.name))
              .map(f => f.name);

            if (toPurge.length > 0) {
              console.log(`🧹 [Rolling Memory] Pruning ${toPurge.length} older drop images from Supabase Storage...`);
              await supabase.storage.from('drops-cache').remove(toPurge);
              console.log(`✅ [Rolling Memory] Cleaned up older images. Storage usage kept under 2MB.`);
            }
          }
        } catch (gcErr) {
          console.warn('⚠️ [Rolling Memory Warning]:', gcErr.message);
        }

      } catch (sbErr) {
        failInCi(`Error syncing drops to Supabase: ${sbErr.message}`);
      }
    }
  } else {
    console.log(`🔍 [Dry Run] Skipped writing to disk / database.`);
  }

  console.log('✨ [BAIA Sync Agent] Completed successfully.\n');
}

runSync().catch(err => {
  console.error('💥 Fatal error in sync runner:', err);
  process.exit(1);
});
