import crypto from 'crypto';

const DAILY_QR_SECRET = process.env.DAILY_QR_SECRET;
if (!DAILY_QR_SECRET) {
  console.error('Missing DAILY_QR_SECRET env var. Refusing to use hardcoded fallback.');
  process.exit(1);
}
const CAFE_LAT = 13.6218;
const CAFE_LNG = 123.1948;
const CAFE_TIMEZONE = 'Asia/Manila';

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

const today = getManilaDateString();
const token = crypto.createHmac('sha256', DAILY_QR_SECRET).update(today).digest('hex');

console.log('--------------------------------------------------');
console.log('1. TODAY MANILA DATE:', today);
console.log('2. GENERATED DAILY QR TOKEN:', token);
console.log('3. FULL SCANNER URL:');
console.log(`   http://localhost:5173/claim?t=${token}`);
console.log(`   https://baia.cafe/claim?t=${token}`);
console.log('4. ADMIN PORTAL:');
console.log('   URL: http://localhost:5173/admin/');
console.log('   Password: <use ADMIN_PASSWORD from .env — never hardcode>');
console.log('--------------------------------------------------');
