import crypto from 'crypto';

const DAILY_QR_SECRET = process.env.DAILY_QR_SECRET || 'baia_daily_secret_key_2026_x89a';
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
console.log('   Password: baia-admin-2026');
console.log('--------------------------------------------------');
