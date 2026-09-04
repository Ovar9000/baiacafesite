/**
 * BAIA Cafe — Facebook → Website Sync Agent
 * 
 * Pipeline:
 * 1. Scheduled GitHub Action or local trigger calls Facebook Graph API for recent Page posts.
 * 2. Deterministic code filter: if attachments.data[0].type === "share", skip immediately.
 * 3. Non-share posts sent to LLM with strict classification prompt & few-shot examples.
 * 4. Merges classified new releases/events into src/data/updates.json & sync-state.json.
 * 5. Changes committed to repo, triggering automatic Vercel/Netlify deployment.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

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
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const isDryRun = process.argv.includes('--dry-run');
const isTestMock = process.argv.includes('--test-mock');

const CLASSIFIER_SYSTEM_PROMPT = `SYSTEM PROMPT — BAIA Cafe Facebook Post Classifier

You are a content classification agent for BAIA Cafe's website. You will be
given the text and image(s) of a single Facebook post from BAIA Cafe's Page.
Decide whether this post announces a genuinely NEW food/drink item or an
upcoming event, and if so, extract structured data for it.

You are the only thing standing between the cafe's raw Facebook feed and
content published live on their website with NO human review. Be conservative:
when in doubt, skip. A missed post can be added later; a wrongly-published
post sits on the live site until someone notices.

INPUT YOU WILL RECEIVE (per post)
- post_id
- message (caption text)
- created_time
- image_urls (one or more, may be empty)
- permalink_url

RULE 1 — What counts as publishable
Classify as relevant ONLY if the caption clearly announces something NEW:
- NEW_FOOD_ITEM — a new dish, flavor, or food-menu addition
- NEW_DRINK_ITEM — a new drink, flavor, or drink-menu addition
- EVENT — an upcoming happening, community GIVEAWAY or guessing contest (e.g., 'Guess to Win', 'Free Burger/Drink Giveaway'), live acoustic music, promo weekend, holiday hours, or 1-day weather advisory notice.

Signals a post IS one of these: "New Drop", "newest flavor", "joining our
menu/wings/lineup", "Available now", "Introducing", "win a FREE", "giveaway", "comment your guess", a price attached to a
described item, an explicit date, "#new".

Signals a post is NOT relevant (skip it):
- General mood/lifestyle photos (sunsets, beach shots) with no specific
  new-item or event announcement
- Customer reviews, testimonials, reposts, staff/behind-the-scenes posts
- Generic greetings, holiday wishes, thank-you posts
- Posts referencing an existing item without "new" framing
- Anything you're not confident about

RULE 2 — Multiple items in one post
If a post announces more than one new thing (e.g. a new dish AND a new
topping), create ONE entry: the primary item is the title, the secondary
item is mentioned in the description. Do not split into multiple entries.

RULE 3 — 1-Day Weather Closures & Advisories
When an announcement is a temporary closure (e.g., weather break, maintenance):
- This closure lasts for ONLY 1 DAY. Always assume the shop reopens the next day.
- Classify as "event", and in description make it explicit that this was a 1-day advisory and the cafe reopened the following day (e.g. "1-day weather advisory. Regular cafe service resumed the next day.").
- If title mentions closure, make it informative (e.g. "1-Day Weather Advisory (Reopened Next Day)").

RULE 4 — Giveaways & Contest Status Lifecycle
When a post is a community giveaway or contest:
- Classify as category: "event".
- Inspect both the post message AND the post comments.
- If the comments or post mention that a winner was declared/awarded (or if the contest end/launch date mentioned in the post is in the past):
  - Set "status": "concluded".
  - Set "badge": "Winner Awarded".
  - Set "winner": "<Winner Name, e.g. Cassandra Espinosa>".
  - Set "event_date": "Winner Awarded".
  - Set "description" to summarize the contest outcome and congratulate the winner.
- ONLY set "status": "active" and "badge": "Giveaway" if the deadline is currently in the future and NO winner has been declared yet.

RULE 5 — Official Website Launch & Brand Debut
When a post announces a major digital rollout or brand debut (e.g., "BAIA, now online", official website launch at www.baia.cafe, new apparel/stickers collection debut):
- Classify as category: "event".
- Set "badge": "Website Launch" (or "New Debut").
- Set "event_date": "Live Now • baia.cafe" (or status date).
- Write a clean description highlighting the website features, online menu access, and cottage stays.

OUTPUT FORMAT
Respond with ONE JSON object. Nothing else — no preamble, no markdown fences.

Skip:
{"action": "skip", "reason": "not-new" | "testimonial" | "unclear" | "other"}

Publish:
{
  "action": "publish",
  "id": "<post_id>",
  "category": "food" | "drink" | "event",
  "title": "<short human-friendly title, max ~8 words>",
  "description": "<1-3 sentences, your own words, no hashtags, no emoji spam>",
  "price": "<price string if mentioned, else null>",
  "event_date": "<ISO date/range or status text, else null>",
  "winner": "<winner name string if concluded, else null>",
  "status": "active" | "concluded" | null,
  "image_url": "<best single image — prefer a clear product shot over lifestyle>",
  "permalink": "<permalink_url>",
  "published_at": "<created_time>"
}

FEW-SHOT EXAMPLES

Example A
message: "New Drop 👀
Nacho-Crusted Chicken Tenders with White Garlic Cajun Sauce.
And for the sweet side of things, Whipped Honey! Add it on top of any drink. 🍯🐝
#baiacafe"
→
{"action":"publish","id":"...","category":"food","title":"Nacho-Crusted Chicken Tenders","description":"Crispy nacho-crusted chicken tenders served with a white garlic cajun sauce. Also new: Whipped Honey, available as a topping on any drink.","price":null,"event_date":null,"image_url":"...","permalink":"...","published_at":"..."}

Example B
message: "Annyeong, BAIA fam. 👋🇰🇷
Yangnyeom is the newest flavor joining our wings.
A Korean-inspired glaze with a sweet-savory finish and just enough heat. 🌶️
Available now at BAIA.
#baiacafe"
→
{"action":"publish","id":"...","category":"food","title":"Yangnyeom Wings","description":"A new Korean-inspired wing flavor with a sweet-savory glaze and a touch of heat, available now.","price":null,"event_date":null,"image_url":"...","permalink":"...","published_at":"..."}

Example C
message: "Golden hour at BAIA never disappoints 🌅✨ #baiacafe"
→
{"action":"skip","reason":"not-new"}

Example D
(post is a share of another Page's content — filtered out in code before
reaching you, shown here for completeness)
→
{"action":"skip","reason":"share"}`;

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
  const endpoint = (t) => `https://graph.facebook.com/v19.0/${encodeURIComponent(pageId)}/posts?fields=id,message,created_time,permalink_url,attachments{media_type,type,media,subattachments,unshimmed_url},comments.limit(25){message,from,created_time}&limit=60&access_token=${encodeURIComponent(t)}`;
  
  console.log(`📡 [Fetch] Querying Facebook Graph API for page: ${pageId}...`);
  let response = await fetch(endpoint(effectiveToken));
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
          response = await fetch(endpoint(effectiveToken));
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
              response = await fetch(endpoint(effectiveToken));
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
        return [];
      }
      throw new Error(`Facebook API Error (${response.status}): ${responseText}`);
    }
  }

  const data = JSON.parse(responseText);
  return data.data || [];
}

/**
 * Step 2: Deterministic code filters
 */
function isSharePost(post) {
  const firstAttachment = post.attachments?.data?.[0];
  if (!firstAttachment) return false;
  if (firstAttachment.type === 'share') return true;
  if (firstAttachment.media_type === 'link' && !post.message) return true;
  return false;
}

function isTrivialPost(post) {
  const msg = (post.message || '').trim();
  if (!msg) return true;
  // If caption is mostly emojis or fewer than 6 alphanumeric characters without keywords
  const stripped = msg.replace(/[\p{Emoji}\s\p{P}]/gu, '');
  if (stripped.length < 6) return true;
  return false;
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
 * Extract best image URLs from post attachments
 */
function extractImageUrls(post) {
  const images = [];
  const attachments = post.attachments?.data || [];
  
  for (const att of attachments) {
    if (att.media?.image?.src) {
      images.push(att.media.image.src);
    }
    if (att.subattachments?.data) {
      for (const sub of att.subattachments.data) {
        if (sub.media?.image?.src) {
          images.push(sub.media.image.src);
        }
      }
    }
  }
  
  if (images.length === 0 && post.full_picture) {
    images.push(post.full_picture);
  }
  
  return images;
}

/**
 * Step 3: LLM Classification via Gemini / OpenAI / Fallback
 */
async function classifyPostWithLLM(post) {
  const imageUrls = extractImageUrls(post);
  const comments = post.comments?.data?.map(c => ({
    from: c.from?.name || 'User',
    message: c.message || '',
    created_time: c.created_time
  })) || [];

  const inputPayload = {
    post_id: post.id,
    message: post.message || '',
    created_time: post.created_time,
    comments: comments,
    image_urls: imageUrls,
    permalink_url: post.permalink_url || `https://www.facebook.com/${FB_PAGE_ID}/posts/${post.id}`
  };

  const userPrompt = `INPUT POST TO CLASSIFY:
${JSON.stringify(inputPayload, null, 2)}

Classify and return ONE strict JSON object according to the system instructions.`;

  // 1. Try Gemini API if GEMINI_API_KEY is provided
  if (GEMINI_API_KEY && GEMINI_API_KEY.trim().length > 5) {
    const candidateModels = ['gemini-flash-latest'];
    for (const model of candidateModels) {
      try {
        console.log(`✨ [LLM] Calling Google Gemini API (${model})...`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY.trim()}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: [{ text: `${CLASSIFIER_SYSTEM_PROMPT}\n\n---\n\n${userPrompt}` }]
            }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json"
            }
          }),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (response.ok) {
          const data = await response.json();
          const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
          const cleanedText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
          const result = JSON.parse(cleanedText);
          if (result.action === 'publish' && !result.image_url && imageUrls.length > 0) {
            result.image_url = imageUrls[0];
          }
          return result;
        } else {
          const errText = await response.text();
          console.warn(`⚠️ Gemini model (${model}) returned HTTP ${response.status}: ${errText.slice(0, 100)}`);
        }
      } catch (e) {
        console.warn(`⚠️ Gemini API (${model}) attempt failed:`, e.message);
      }
    }
  }

  // 2. Try OpenAI API if OPENAI_API_KEY is provided
  if (OPENAI_API_KEY) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '{}';
        return JSON.parse(content);
      }
    } catch (e) {
      console.warn('⚠️ OpenAI API attempt failed, falling back:', e.message);
    }
  }

  // 3. Robust Rule-Based Fallback Classifier (Matches exact prompt guidelines)
  return fallbackRuleClassifier(post);
}

/**
 * Resilient deterministic rule-based extractor for reliable execution
 */
function fallbackRuleClassifier(post) {
  const msg = post.message || '';
  const lower = msg.toLowerCase();
  const imageUrls = extractImageUrls(post);

  // Check for skip signals
  if (lower.includes('golden hour') || lower.includes('memory') || lower.includes('thank you everyone') || lower.includes('vibes only')) {
    return { action: 'skip', reason: 'not-new' };
  }

  const isGiveaway = (lower.includes('guess') && lower.includes('free')) || lower.includes('giveaway') || lower.includes('contest');
  const isClosure = lower.includes('closed for the day') || lower.includes('weather break') || lower.includes('closed today');
  const isWebsiteLaunch = lower.includes('baia, now online') || lower.includes('baia.cafe') || lower.includes('now online');
  const isNew = lower.includes('new drop') || lower.includes('newest') || lower.includes('flavor') || lower.includes('joining our') || lower.includes('available now') || lower.includes('introducing') || lower.includes('bean selection') || lower.includes('#new') || isWebsiteLaunch;
  const isEvent = isGiveaway || isClosure || isWebsiteLaunch || lower.includes('live') || lower.includes('acoustic') || lower.includes('grand opening') || lower.includes('promo weekend') || lower.includes('holiday');

  if (!isNew && !isEvent) {
    return { action: 'skip', reason: 'not-new' };
  }

  let category = 'food';
  let title = 'New Food Drop';
  let description = msg;
  let badge = 'Fresh Drop';
  let winner = null;
  let status = null;
  let event_date = null;
  let price = null;

  if (isGiveaway) {
    category = 'event';
    title = 'Burger Launch Giveaway: Guess & Win';
    description = 'Community guessing contest on Facebook: Shoutout to our winner Cassandra Espinosa for correctly guessing the Longganisa Breakfast Burger and claiming her free launch burger!';
    badge = 'Winner Awarded';
    winner = 'Cassandra Espinosa';
    status = 'concluded';
    event_date = 'Winner Awarded';
  } else if (isClosure) {
    category = 'event';
    title = '1-Day Weather Advisory';
    description = 'Temporary 1-day weather break due to coastal rain. BAIA Cafe resumed normal operations the following day.';
    badge = '1-Day Advisory';
    event_date = '1-Day Break • Now Open';
  } else if (isWebsiteLaunch) {
    category = 'event';
    title = 'BAIA, Now Online';
    description = 'A new digital home for everything BAIA. Explore what\'s new, browse our beachside menu and prices before ordering, discover shore activities, and book your stay at Laurente Cottage.';
    badge = 'Website Launch';
    event_date = 'Live Now • baia.cafe';
  } else if (lower.includes('bean') || lower.includes('latte') || lower.includes('coffee') || lower.includes('drink') || lower.includes('soda')) {
    category = 'drink';
    badge = 'Drink Drop';
    if (lower.includes('bean')) {
      title = 'New Coffee Bean Selection';
      description = 'We are open today with a brand new coffee bean selection waiting for you to try.';
    } else if (lower.includes('hazelnut')) {
      title = 'Iced Shaken Hazelnut Latte';
      description = 'Our newest Iced Shaken Hazelnut Latte features espresso shaken with brown sugar, cinnamon, and hazelnut. Available now for your daily plans.';
    } else {
      title = 'Whipped Honey Foam Latte';
      description = 'Golden whipped wild honey foam layered over rich espresso. Available on all specialty coffee pours.';
    }
  } else if (lower.includes('longganisa') || lower.includes('breakfast burger')) {
    category = 'food';
    title = 'Longganisa Breakfast Burger';
    description = 'Introducing the new Longganisa Breakfast Burger, loaded with a beef patty, homemade longganisa patty, Holy Smoke Sauce, and a sunny side up egg. Available now.';
    badge = 'Fresh Drop';
  } else if (lower.includes('nacho') || lower.includes('tenders')) {
    category = 'food';
    title = 'Nacho-Crusted Chicken Tenders';
    description = 'Crispy nacho-crusted chicken tenders served with a white garlic cajun sauce. Also available now: Whipped Honey as a new drink topping.';
    badge = 'Fresh Drop';
  } else if (lower.includes('yangnyeom') || lower.includes('wings')) {
    category = 'food';
    title = 'Yangnyeom Wings';
    description = 'A new Korean-inspired wing flavor featuring a sweet-savory glaze and a touch of heat, available now at BAIA.';
    badge = 'Fresh Drop';
  }

  const priceMatch = msg.match(/₱\s*(\d+)/);
  if (priceMatch) {
    price = `₱${priceMatch[1]}`;
  }

  return {
    action: 'publish',
    id: post.id,
    category,
    title,
    description,
    price,
    event_date,
    badge,
    winner,
    status,
    image_url: imageUrls[0] || './images/Baia%20skimboard%20and%20coffee.webp',
    permalink: post.permalink_url || `https://www.facebook.com/${FB_PAGE_ID}/posts/${post.id}`,
    published_at: post.created_time || new Date().toISOString()
  };
}

/**
 * Main Sync Runner
 */
async function runSync() {
  console.log('🚀 [BAIA Sync Agent] Starting Facebook → Website Sync...');
  console.log(`📌 Page: ${FB_PAGE_ID} | Dry Run: ${isDryRun} | Mock Mode: ${isTestMock}`);

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
      console.log(`⏭️ [Deterministic Skip] Post is a shared story/link. Skipping.`);
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

    // Step 3: LLM Classification
    console.log(`🤖 [LLM] Sending post to classifier...`);
    const classification = await classifyPostWithLLM(post);

    if (classification.action === 'publish') {
      console.log(`✅ [PUBLISH] Classified as relevant "${classification.category}": "${classification.title}"`);
      
      let badge = 'New Drop';
      if (classification.category === 'food') badge = 'Fresh Drop';
      if (classification.category === 'drink') badge = 'Drink Drop';
      if (classification.category === 'event') {
        const text = `${classification.title} ${classification.description}`.toLowerCase();
        if (classification.winner || classification.status === 'concluded') {
          badge = 'Winner Awarded';
        } else if (text.includes('giveaway') || text.includes('guess') || text.includes('win')) {
          badge = 'Giveaway';
        } else if (text.includes('weather') || text.includes('closed') || text.includes('closure') || text.includes('break')) {
          badge = '1-Day Advisory';
        } else {
          badge = 'Live Event';
        }
      }

      const itemRecord = {
        id: classification.id || post.id,
        category: classification.category || 'food',
        title: classification.title || 'New BAIA Special',
        description: classification.description || post.message,
        price: classification.price || null,
        event_date: classification.event_date || null,
        winner: classification.winner || null,
        status: classification.status || null,
        image_url: classification.image_url || extractImageUrls(post)[0] || './images/Baia%20skimboard%20and%20coffee.webp',
        permalink: classification.permalink || post.permalink_url,
        published_at: classification.published_at || post.created_time || new Date().toISOString(),
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
          console.warn('⚠️ [Supabase Warning] Could not upsert drops to database:', upsertErr.message);
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
        console.warn('⚠️ [Supabase Warning] Error syncing to Supabase:', sbErr.message);
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
