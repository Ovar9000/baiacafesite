import crypto from 'crypto';
import os from 'os';

const DAILY_QR_SECRET = process.env.DAILY_QR_SECRET || '***REMOVED_DAILY_QR_SECRET***';
const CAFE_TIMEZONE = process.env.CAFE_TIMEZONE || 'Asia/Manila';

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '192.168.0.50';
}

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

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  const allowedOrigins = ['https://www.baia.cafe', 'https://baia.cafe'];
  const isAllowed = origin && (
    allowedOrigins.includes(origin) ||
    /^https:\/\/[a-zA-Z0-9-]+\.vercel\.app$/.test(origin) ||
    /^http:\/\/localhost(:\d+)?$/.test(origin) ||
    /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)
  );

  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://www.baia.cafe');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function safeVerifyAdminPassword(providedPassword) {
  if (!providedPassword || typeof providedPassword !== 'string') return false;
  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedPassword || typeof expectedPassword !== 'string') return false;
  const providedBuf = Buffer.from(providedPassword, 'utf8');
  const expectedBuf = Buffer.from(expectedPassword, 'utf8');
  if (providedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.ADMIN_PASSWORD) {
    console.error('Server configuration error: ADMIN_PASSWORD environment variable is missing.');
    return res.status(500).json({ error: 'Server authentication configuration error. ADMIN_PASSWORD is not set.' });
  }

  if (!process.env.DAILY_QR_SECRET && process.env.NODE_ENV === 'production') {
    console.error('Server configuration error: DAILY_QR_SECRET is missing.');
    return res.status(500).json({ error: 'Server configuration error. DAILY_QR_SECRET is not set.' });
  }

  try {
    const { password } = req.body || {};
    if (!safeVerifyAdminPassword(password)) {
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }

    const todayDateStr = getManilaDateString();
    const token = crypto.createHmac('sha256', DAILY_QR_SECRET).update(todayDateStr).digest('hex');

    const formattedDate = new Intl.DateTimeFormat('en-US', {
      timeZone: CAFE_TIMEZONE,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(new Date());

    const reqHost = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5173';
    const reqProto = req.headers['x-forwarded-proto'] || 'http';
    const claimUrl = `${reqProto}://${reqHost}/claim/?t=${token}`;
    const productionUrl = `https://baia.cafe/claim/?t=${token}`;

    return res.status(200).json({
      success: true,
      token,
      dateString: todayDateStr,
      formattedDate,
      claimUrl,
      productionUrl
    });
  } catch (err) {
    console.error('Error generating admin token:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
