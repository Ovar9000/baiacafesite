import crypto from 'crypto';

const DAILY_QR_SECRET = process.env.DAILY_QR_SECRET || 'baia-cafe-secret-key-2026';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'baia-admin-2026';
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
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { password } = req.body || {};
    if (!password || password !== ADMIN_PASSWORD) {
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

    return res.status(200).json({
      success: true,
      token,
      dateString: todayDateStr,
      formattedDate,
      claimUrl: `https://baia.cafe/claim?t=${token}`
    });
  } catch (err) {
    console.error('Error generating admin token:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
