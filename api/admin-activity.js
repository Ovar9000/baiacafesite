import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

function getEnvVar(key, defaultValue = '') {
  if (process.env[key]) return process.env[key];
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const regex = new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm');
      const match = content.match(regex);
      if (match) {
        const val = match[1].trim().replace(/^["']|["']$/g, '');
        process.env[key] = val;
        return val;
      }
    }
  } catch (e) {}
  return defaultValue;
}

function safeVerifyAdminPassword(providedPassword) {
  if (!providedPassword || typeof providedPassword !== 'string') return false;
  const expectedPassword = getEnvVar('ADMIN_PASSWORD', 'baia-admin-2026');
  const providedBuf = Buffer.from(providedPassword, 'utf8');
  const expectedBuf = Buffer.from(expectedPassword, 'utf8');
  if (providedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

function getSupabaseAdmin() {
  const supabaseUrl = getEnvVar('SUPABASE_URL') || getEnvVar('NEXT_PUBLIC_SUPABASE_URL') || getEnvVar('VITE_SUPABASE_URL') || 'https://cqtcmrqlafgtcrcfaojz.supabase.co';
  const serviceKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function getManilaHour(dateString) {
  try {
    const d = new Date(dateString);
    const hourStr = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      hour12: false
    }).format(d);
    return parseInt(hourStr, 10);
  } catch (e) {
    return new Date(dateString).getHours();
  }
}

function getManilaDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
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
    if (!safeVerifyAdminPassword(password)) {
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Server database configuration error.' });
    }

    const [profilesRes, stampsRes, redemptionsRes] = await Promise.all([
      supabaseAdmin.from('profiles').select('id, email, display_name, avatar_url, created_at').order('created_at', { ascending: false }),
      supabaseAdmin.from('stamps').select('id, user_id, awarded_at, distance_meters, staff_note').order('awarded_at', { ascending: false }),
      supabaseAdmin.from('redemptions').select('id, user_id, redeemed_at, reward_type, milestone_number').order('redeemed_at', { ascending: false })
    ]);

    if (profilesRes.error) throw profilesRes.error;
    if (stampsRes.error) throw stampsRes.error;
    if (redemptionsRes.error) throw redemptionsRes.error;

    const profiles = profilesRes.data || [];
    const stamps = stampsRes.data || [];
    const redemptions = redemptionsRes.data || [];

    const profileMap = new Map();
    profiles.forEach(p => profileMap.set(p.id, p));

    const todayStr = getManilaDateString(new Date());
    const nowMs = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const sevenDaysAgoMs = nowMs - (7 * oneDayMs);
    const thirtyDaysAgoMs = nowMs - (30 * oneDayMs);

    let todayVisits = 0;
    let weekVisits = 0;
    let monthVisits = 0;
    let totalDistance = 0;
    let distanceCount = 0;

    const hourlyCounts = Array(24).fill(0);

    stamps.forEach(s => {
      const stampTimeMs = new Date(s.awarded_at).getTime();
      const stampManilaDate = getManilaDateString(new Date(s.awarded_at));

      if (stampManilaDate === todayStr) todayVisits++;
      if (stampTimeMs >= sevenDaysAgoMs) weekVisits++;
      if (stampTimeMs >= thirtyDaysAgoMs) monthVisits++;

      if (typeof s.distance_meters === 'number' && !isNaN(s.distance_meters)) {
        totalDistance += s.distance_meters;
        distanceCount++;
      }

      const hour = getManilaHour(s.awarded_at);
      if (hour >= 0 && hour < 24) {
        hourlyCounts[hour]++;
      }
    });

    const avgDistance = distanceCount > 0 ? Math.round(totalDistance / distanceCount) : null;

    // Peak rush calculations
    let maxHour = 8;
    let maxHourCount = 0;
    hourlyCounts.forEach((count, h) => {
      if (count > maxHourCount) {
        maxHourCount = count;
        maxHour = h;
      }
    });

    const formatHour = (h) => {
      const period = h >= 12 ? 'PM' : 'AM';
      const displayH = h % 12 === 0 ? 12 : h % 12;
      return `${displayH}:00 ${period}`;
    };

    const peakHourWindow = `${formatHour(maxHour)} – ${formatHour((maxHour + 1) % 24)}`;

    const rushWindows = {
      morning: { label: 'Morning Brew (6 AM – 11 AM)', count: 0 },
      lunch: { label: 'Lunch & Grill (11 AM – 3 PM)', count: 0 },
      sunset: { label: 'Sunset Chill (3 PM – 7 PM)', count: 0 },
      night: { label: 'Night Waves (7 PM – 11 PM)', count: 0 }
    };

    stamps.forEach(s => {
      const h = getManilaHour(s.awarded_at);
      if (h >= 6 && h < 11) rushWindows.morning.count++;
      else if (h >= 11 && h < 15) rushWindows.lunch.count++;
      else if (h >= 15 && h < 19) rushWindows.sunset.count++;
      else if (h >= 19 && h < 23) rushWindows.night.count++;
    });

    // Customer Retention & Funnel
    const userStampCounts = {};
    stamps.forEach(s => {
      userStampCounts[s.user_id] = (userStampCounts[s.user_id] || 0) + 1;
    });

    let newMembersThisWeek = 0;
    profiles.forEach(p => {
      if (new Date(p.created_at).getTime() >= sevenDaysAgoMs) {
        newMembersThisWeek++;
      }
    });

    const totalMembers = profiles.length;
    let returningMembers = 0;
    let tier1 = 0; // 1 stamp
    let tier2 = 0; // 2-4 stamps
    let tier3 = 0; // 5-9 stamps
    let tier4 = 0; // 10+ stamps
    let nearingRewardCount = 0;

    Object.values(userStampCounts).forEach(count => {
      if (count >= 2) returningMembers++;
      if (count === 1) tier1++;
      else if (count >= 2 && count <= 4) tier2++;
      else if (count >= 5 && count <= 9) tier3++;
      else if (count >= 10) tier4++;

      const cycle = count % 10;
      if (cycle === 4 || cycle === 9) {
        nearingRewardCount++;
      }
    });

    const retentionRate = totalMembers > 0 ? Math.round((returningMembers / totalMembers) * 100) : 0;

    // Redemptions Summary
    const totalRedemptions = redemptions.length;
    let totalMilestonesEarned = 0;
    Object.values(userStampCounts).forEach(count => {
      totalMilestonesEarned += Math.floor(count / 10);
    });
    const pendingRedemptions = Math.max(0, totalMilestonesEarned - totalRedemptions);

    // Activity Stream (Chronological unified feed)
    const activities = [];

    stamps.slice(0, 40).forEach(s => {
      const profile = profileMap.get(s.user_id);
      activities.push({
        id: `stamp-${s.id}`,
        type: 'stamp',
        customerName: profile?.display_name || profile?.email?.split('@')[0] || 'Store Guest',
        customerEmail: profile?.email || '',
        timestamp: s.awarded_at,
        distanceMeters: s.distance_meters,
        staffNote: s.staff_note || null
      });
    });

    redemptions.slice(0, 20).forEach(r => {
      const profile = profileMap.get(r.user_id);
      activities.push({
        id: `redemption-${r.id}`,
        type: 'redemption',
        customerName: profile?.display_name || profile?.email?.split('@')[0] || 'Store Guest',
        customerEmail: profile?.email || '',
        timestamp: r.redeemed_at,
        rewardType: r.reward_type,
        milestone: r.milestone_number
      });
    });

    profiles.slice(0, 20).forEach(p => {
      activities.push({
        id: `signup-${p.id}`,
        type: 'signup',
        customerName: p.display_name || p.email?.split('@')[0] || 'Store Guest',
        customerEmail: p.email || '',
        timestamp: p.created_at
      });
    });

    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return res.status(200).json({
      traffic: {
        totalVisits: stamps.length,
        todayVisits,
        weekVisits,
        monthVisits,
        avgDistanceMeters: avgDistance,
        peakHourWindow,
        peakHourCount: maxHourCount,
        hourlyCounts,
        rushWindows
      },
      retention: {
        totalMembers,
        newMembersThisWeek,
        returningMembers,
        retentionRate,
        nearingRewardCount,
        avgVisitsPerMember: totalMembers > 0 ? (stamps.length / totalMembers).toFixed(1) : '0',
        tiers: {
          firstTimer: tier1,
          occasional: tier2,
          regular: tier3,
          ambassador: tier4
        }
      },
      rewards: {
        totalRedemptions,
        pendingRedemptions,
        totalMilestonesEarned
      },
      activities: activities.slice(0, 50)
    });

  } catch (error) {
    console.error('Error in admin-activity API:', error);
    return res.status(500).json({ error: error.message || 'Failed to process activity metrics.' });
  }
}
