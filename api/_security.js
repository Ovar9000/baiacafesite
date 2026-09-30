import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

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
  // Vercel previews call /api same-origin, so no *.vercel.app wildcard is needed
  // (a wildcard would trust any stranger's Vercel deployment).
  const isAllowed =
    origin &&
    (ALLOWED_ORIGINS.includes(origin) ||
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

export function getClientIp(req) {
  return (
    req.headers['x-real-ip'] ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

// One-way, keyed hash so we can count per-network activity without storing raw IPs
export function hashIp(ip) {
  let key = 'baia-ip';
  try {
    key = getRequiredEnv('DAILY_QR_SECRET');
  } catch {
    // fall back to static key; only used for counting, never for auth
  }
  return crypto.createHmac('sha256', key).update(String(ip)).digest('hex').slice(0, 32);
}

export function isRateLimited(req, scope, limit = 20, windowMs = 60_000) {
  const ip = getClientIp(req);
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

// ---- Admin login throttling (shared across serverless instances via Supabase) ----
// Only FAILED password attempts count, so the owner is never locked out by their own use.
const LOGIN_FAIL_LIMIT_PER_IP = 10;
const LOGIN_FAIL_LIMIT_GLOBAL = 100;
const LOGIN_FAIL_WINDOW_SECONDS = 15 * 60;

function getServiceClient() {
  try {
    const { url, serviceKey } = getSupabaseConfig();
    return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  } catch {
    return null;
  }
}

async function isAdminLoginLocked(req) {
  const ipHash = hashIp(getClientIp(req));
  const db = getServiceClient();
  if (db) {
    const { data, error } = await db.rpc('admin_login_locked', {
      p_ip_hash: ipHash,
      p_ip_limit: LOGIN_FAIL_LIMIT_PER_IP,
      p_global_limit: LOGIN_FAIL_LIMIT_GLOBAL,
      p_window_seconds: LOGIN_FAIL_WINDOW_SECONDS
    });
    if (!error) return data === true;
  }
  // Migration not applied yet: per-instance fallback
  return isRateLimited(req, 'admin-login', LOGIN_FAIL_LIMIT_PER_IP, LOGIN_FAIL_WINDOW_SECONDS * 1000).limited;
}

async function recordAdminLoginFailure(req) {
  const db = getServiceClient();
  if (!db) return;
  await db.rpc('record_admin_login_failure', { p_ip_hash: hashIp(getClientIp(req)) });
}

// Accepts either a valid session token or the password (so frontend never stores password).
// Returns { ok, via, locked }.
export async function authenticateAdmin(req) {
  const body = req.body || {};
  const sessionToken =
    body.adminSession || req.headers['x-admin-session'] || req.headers['X-Admin-Session'];
  if (sessionToken && verifyAdminSession(String(sessionToken))) return { ok: true, via: 'session', locked: false };

  if (body.password) {
    if (await isAdminLoginLocked(req)) return { ok: false, via: null, locked: true };
    if (safeVerifyAdminPassword(body.password)) return { ok: true, via: 'password', locked: false };
    await recordAdminLoginFailure(req);
  }
  return { ok: false, via: null, locked: false };
}

// Shared 401/429 response for admin endpoints. Returns true when the request was rejected.
export async function rejectUnlessAdmin(req, res) {
  const auth = await authenticateAdmin(req);
  if (auth.ok) return false;
  if (auth.locked) {
    res.setHeader('Retry-After', String(LOGIN_FAIL_WINDOW_SECONDS));
    res.status(429).json({ error: 'Too many failed login attempts. Please wait 15 minutes and try again.' });
    return true;
  }
  await new Promise((r) => setTimeout(r, 300));
  res.status(401).json({ error: 'Invalid admin credentials.' });
  return true;
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
