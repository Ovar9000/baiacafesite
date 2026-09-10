import crypto from 'crypto';
import { getDailyQrSecret, setCorsHeaders, isRateLimited, isAdminAuthenticated, issueAdminSession, buildClaimUrls, getRequiredEnv } from './_security.js';

const CAFE_TIMEZONE = process.env.CAFE_TIMEZONE || 'Asia/Manila';

function getManilaDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CAFE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rl = isRateLimited(req, 'admin-token', 10, 60_000);
  if (rl.limited) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({ error: 'Too many login attempts. Please wait a minute and try again.' });
  }

  try {
    getRequiredEnv('ADMIN_PASSWORD');
  } catch {
    console.error('Server configuration error: ADMIN_PASSWORD environment variable is missing.');
    return res.status(500).json({ error: 'Server authentication configuration error. ADMIN_PASSWORD is not set.' });
  }

  let dailySecret;
  try {
    dailySecret = getDailyQrSecret();
  } catch {
    console.error('Server configuration error: DAILY_QR_SECRET is missing.');
    return res.status(500).json({ error: 'Server configuration error. DAILY_QR_SECRET is not set.' });
  }

  try {
    const auth = isAdminAuthenticated(req);
    if (!auth.ok) {
      // Generic message + same timing to deter user enumeration
      await new Promise((r) => setTimeout(r, 300));
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }

    const todayDateStr = getManilaDateString();
    const token = crypto.createHmac('sha256', dailySecret).update(todayDateStr).digest('hex');

    const formattedDate = new Intl.DateTimeFormat('en-US', {
      timeZone: CAFE_TIMEZONE,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(new Date());

    // Canonical URLs only — never reflect X-Forwarded-Host (prevents cache poisoning/phishing)
    const { productionUrl } = buildClaimUrls(token);

    // Short-lived signed session so the frontend never stores the raw password
    const adminSession = issueAdminSession();

    return res.status(200).json({
      success: true,
      token,
      dateString: todayDateStr,
      formattedDate,
      claimUrl: productionUrl,
      productionUrl,
      adminSession,
      sessionExpiresInHours: 8
    });
  } catch (err) {
    console.error('Error generating admin token:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
