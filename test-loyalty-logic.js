import crypto from 'crypto';

console.log('=== TESTING BAIA LOYALTY CARD BUSINESS LOGIC ===');

// 1. Test Milestone Logic
function calculateMilestones(totalStamps, redemptionsCount) {
  const milestoneNumber = Math.floor(totalStamps / 10);
  const pendingRewards = Math.max(0, milestoneNumber - redemptionsCount);
  const nextRewardMilestone = redemptionsCount + 1;
  const nextRewardType = (nextRewardMilestone % 2 !== 0) ? 'coffee' : 'totebag';

  return {
    milestoneNumber,
    pendingRewards,
    nextRewardMilestone,
    nextRewardType
  };
}

console.log('Stamps: 0, Redemptions: 0 ->', calculateMilestones(0, 0));
console.log('Stamps: 9, Redemptions: 0 ->', calculateMilestones(9, 0));
console.log('Stamps: 10, Redemptions: 0 ->', calculateMilestones(10, 0)); // Expect milestone 1, pending 1, coffee
console.log('Stamps: 10, Redemptions: 1 ->', calculateMilestones(10, 1)); // Expect milestone 1, pending 0
console.log('Stamps: 20, Redemptions: 1 ->', calculateMilestones(20, 1)); // Expect milestone 2, pending 1, totebag
console.log('Stamps: 20, Redemptions: 2 ->', calculateMilestones(20, 2)); // Expect milestone 2, pending 0
console.log('Stamps: 30, Redemptions: 2 ->', calculateMilestones(30, 2)); // Expect milestone 3, pending 1, coffee

// 2. Test Manila Date & Token Generation
const DAILY_QR_SECRET = 'baia-cafe-secret-key-2026';
function getManilaDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

const dateStr = getManilaDateString();
const token = crypto.createHmac('sha256', DAILY_QR_SECRET).update(dateStr).digest('hex');
console.log('Today (Asia/Manila):', dateStr);
console.log('Generated Daily Token:', token.substring(0, 16) + '...');

// 3. Test Haversine Distance
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const CAFE_LAT = 13.6218;
const CAFE_LNG = 123.1948;

// Exact cafe coordinate
const d1 = haversineDistance(CAFE_LAT, CAFE_LNG, CAFE_LAT, CAFE_LNG);
console.log('Distance at exact cafe location:', d1, 'meters');

// ~30 meters away
const d2 = haversineDistance(13.6218, 123.1948, 13.6220, 123.1949);
console.log('Distance 30m away:', Math.round(d2), 'meters (within 75m radius)');

// 500 meters away
const d3 = haversineDistance(13.6218, 123.1948, 13.6260, 123.1948);
console.log('Distance 500m away:', Math.round(d3), 'meters (should be rejected)');

console.log('=== ALL LOGIC TESTS COMPLETED ===');
