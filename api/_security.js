import crypto from 'crypto';

// ---- Env (fail-closed, no hardcoded fallbacks) ----
export function getRequiredEnv(name) {
  const v = process.env[name];
  if (!v || typeof v !== 'string' || v.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export function getDailyQrSecret() {
  return getRequiredEnv('DAILY_QR_SECRET');
}

export function getSupabaseConfig() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    '';
  if (!url) throw new Error('Missing SUPABASE_URL');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  return { url, serviceKey };
}

// ---- CORS ----
const ALLOWED_ORIGINS = ['https://www.baia.cafe', 'https://baia.cafe'];
export function setCorsHeaders(req, res, methods = 'GET,OPTIONS,POST') {
  const origin = req.headers.origin;
  const isAllowed =
    origin &&
    (ALLOWED_ORIGINS.includes(origin) ||
      /^https:\/\/[a-zA-Z0-9-]+\.vercel\.app$/.test(origin) ||
      /^http:\/\/localhost(:\d+)?$/.test(origin) ||
      /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin));
  res.setHeader('Access-Control-Allow-Origin', isAllowed ? origin : 'https://www.baia.cafe');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Session');
  // Never cache authenticated API responses
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
}

// ---- Rate limiting (in-memory per serverless instance; use Upstash for distributed) ----
const buckets = new Map(); // key -> number[] timestamps
export function isRateLimited(req, scope, limit = 20, windowMs = 60_000) {
  const ip =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  const key = `${scope}:${ip}`;
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    buckets.set(key, arr);
    const retryAfter = Math.ceil((arr[0] + windowMs - now) / 1000);
    return { limited: true, retryAfter: Math.max(1, retryAfter) };
  }
  arr.push(now);
  // Bound memory
  if (buckets.size > 5000) buckets.clear();
  buckets.set(key, arr);
  return { limited: false, retryAfter: 0 };
}

// ---- Admin password + short-lived signed session ----
export function safeVerifyAdminPassword(provided) {
  if (!provided || typeof provided !== 'string') return false;
  let expected;
  try {
    expected = getRequiredEnv('ADMIN_PASSWORD');
  } catch {
    return false;
  }
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8h

function sessionHmacKey() {
  // Bind session signatures to both secrets so rotation invalidates sessions
  return getRequiredEnv('ADMIN_PASSWORD') + '::' + getRequiredEnv('DAILY_QR_SECRET');
}

export function issueAdminSession() {
  const ts = Date.now().toString();
  const sig = crypto.createHmac('sha256', sessionHmacKey()).update(ts).digest('hex');
  return `${ts}.${sig}`;
}

export function verifyAdminSession(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [tsStr, sig] = token.split('.');
  if (!/^\d+$/.test(tsStr || '') || !/^[a-f0-9]{64}$/.test(sig || '')) return false;
  const ts = parseInt(tsStr, 10);
  if (Date.now() - ts > ADMIN_SESSION_TTL_MS || ts > Date.now() + 60_000) return false;
  let expected;
  try {
    expected = crypto.createHmac('sha256', sessionHmacKey()).update(tsStr).digest('hex');
  } catch {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}

// Accepts either fresh password OR valid session token (so frontend never stores password)
export function isAdminAuthenticated(req) {
  const body = req.body || {};
  if (body.password && safeVerifyAdminPassword(body.password)) return { ok: true, via: 'password' };
  const sessionToken =
    body.adminSession || req.headers['x-admin-session'] || req.headers['X-Admin-Session'];
  if (sessionToken && verifyAdminSession(String(sessionToken))) return { ok: true, via: 'session' };
  return { ok: false, via: null };
}

// ---- Safe claim URL (no X-Forwarded-Host reflection) ----
const CANONICAL_CLAIM_BASE = 'https://baia.cafe/claim/';
const PREVIEW_HOST_RE = /^[a-zA-Z0-9-]+\.vercel\.app$/;
export function buildClaimUrls(token) {
  const productionUrl = `${CANONICAL_CLAIM_BASE}?t=${token}`;
  // Only echo back a preview host when it is an allowlisted vercel preview; otherwise canonical
  // Callers should prefer productionUrl for the printed standee.
  return { productionUrl, claimUrl: productionUrl };
}

export function isPreviewHostAllowed(host) {
  if (!host) return false;
  return PREVIEW_HOST_RE.test(host);
}
