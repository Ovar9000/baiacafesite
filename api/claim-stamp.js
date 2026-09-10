import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { getDailyQrSecret, getSupabaseConfig, setCorsHeaders, isRateLimited } from './_security.js';

const CAFE_LAT = parseFloat(process.env.CAFE_LAT || '13.6218');
const CAFE_LNG = parseFloat(process.env.CAFE_LNG || '123.1948');
const CAFE_TIMEZONE = process.env.CAFE_TIMEZONE || 'Asia/Manila';
const CAFE_OPEN_HOUR = parseInt(process.env.CAFE_OPEN_HOUR || '9', 10);
const CAFE_CLOSE_HOUR = parseInt(process.env.CAFE_CLOSE_HOUR || '23', 10);

function isCafeOperatingHours(date = new Date()) {
  const hour = parseInt(new Intl.DateTimeFormat('en-US', {
    timeZone: CAFE_TIMEZONE,
    hour: 'numeric',
    hourCycle: 'h23'
  }).format(date), 10);
  return hour >= CAFE_OPEN_HOUR && hour < CAFE_CLOSE_HOUR;
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

function generateExpectedToken(dateStr) {
  return crypto.createHmac('sha256', getDailyQrSecret()).update(dateStr).digest('hex');
}

function safeCompareTokens(provided, expected) {
  if (!provided || typeof provided !== 'string') return false;
  // Strictly enforce 64-character SHA-256 hex string to prevent prefix bypass
  if (provided.length !== 64 || expected.length !== 64) {
    return false;
  }
  const bufA = Buffer.from(provided, 'utf8');
  const bufB = Buffer.from(expected, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // meters
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

export default async function handler(req, res) {
  setCorsHeaders(req, res, 'GET,OPTIONS,POST');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rl = isRateLimited(req, 'claim-stamp', 20, 60_000);
  if (rl.limited) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  }

  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const accessToken = authHeader.replace('Bearer ', '').trim();
    let supabaseAdmin;
    try {
      const { url, serviceKey } = getSupabaseConfig();
      supabaseAdmin = createClient(url, serviceKey, {
        auth: { persistSession: false }
      });
    } catch (e) {
      console.error('Server configuration error: Supabase env is missing.');
      return res.status(500).json({ error: 'Server database configuration error. Please contact administrator.' });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid user session. Please sign in again.' });
    }

    const { token, lat, lng } = req.body || {};

    if (!token) {
      return res.status(400).json({ error: 'QR verification token is required.' });
    }

    if (typeof token !== 'string' || token.length !== 64 || !/^[a-f0-9]{64}$/i.test(token)) {
      return res.status(403).json({
        error: 'Invalid or expired QR code. Please scan today’s QR standee at the drink pickup bar.'
      });
    }

    // Fail closed when secrets are not configured (no hardcoded fallback)
    try {
      getDailyQrSecret();
    } catch (e) {
      console.error('Server configuration error: DAILY_QR_SECRET is not set.');
      return res.status(500).json({ error: 'Server QR configuration error. Please contact administrator.' });
    }

    // 1. Operating Hours Enforcement (Closed 11:00 PM - 9:00 AM Manila time)
    if (!isCafeOperatingHours()) {
      return res.status(403).json({
        error: 'Baia Café is currently closed. Stamp claims are only available during operating hours (9:00 AM – 11:00 PM).'
      });
    }

    // 2. Verify daily token
    const todayManila = getManilaDateString();
    const expectedToken = generateExpectedToken(todayManila);
    if (!safeCompareTokens(token, expectedToken)) {
      return res.status(403).json({ 
        error: 'Invalid or expired QR code. Please scan today’s QR standee at the drink pickup bar.' 
      });
    }

    // 2. Optional location recording (no blocking / no GPS requirement)
    let distanceRecorded = null;
    if (lat !== undefined && lng !== undefined) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      if (!isNaN(userLat) && !isNaN(userLng)) {
        distanceRecorded = Math.round(haversineDistance(userLat, userLng, CAFE_LAT, CAFE_LNG));
      }
    }

    // 3. Ensure user profile exists (without overwriting customized display_name)
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (!existingProfile) {
      await supabaseAdmin.from('profiles').insert({
        id: user.id,
        email: user.email,
        display_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Baia Guest',
        avatar_url: user.user_metadata?.avatar_url || null
      });
    }

    // 4. Check for existing stamp today (Asia/Manila midnight boundary)
    const startOfDayISO = new Date(`${todayManila}T00:00:00+08:00`).toISOString();
    const endOfDayISO = new Date(`${todayManila}T23:59:59.999+08:00`).toISOString();

    const { data: todayStamps, error: checkError } = await supabaseAdmin
      .from('stamps')
      .select('id, awarded_at')
      .eq('user_id', user.id)
      .gte('awarded_at', startOfDayISO)
      .lte('awarded_at', endOfDayISO);

    if (checkError) {
      console.error('Database query error:', checkError);
      return res.status(500).json({ error: 'Failed to verify today’s stamp status.' });
    }

    if (todayStamps && todayStamps.length > 0) {
      return res.status(400).json({
        error: 'You have already collected today’s stamp! Enjoy your drink and come back tomorrow for another.'
      });
    }

    // 5. Insert new stamp record
    const { error: insertError } = await supabaseAdmin
      .from('stamps')
      .insert({
        user_id: user.id,
        distance_meters: distanceRecorded,
        staff_note: 'QR Barista Standee Scan'
      });

    if (insertError) {
      console.error('Failed to insert stamp:', insertError);
      if (insertError.code === '23505' || insertError.message?.toLowerCase().includes('unique') || insertError.message?.toLowerCase().includes('duplicate')) {
        return res.status(400).json({
          error: 'You have already collected today’s stamp! Enjoy your drink and come back tomorrow for another.'
        });
      }
      return res.status(500).json({ error: `Failed to record stamp in database: ${insertError.message}` });
    }

    // 6. Recalculate totals and milestone unlock
    const { count: totalStamps } = await supabaseAdmin
      .from('stamps')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const { count: redemptionsCount } = await supabaseAdmin
      .from('redemptions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const currentTotal = totalStamps || 1;
    const milestoneNumber = Math.floor(currentTotal / 10);
    const rewardUnlockedNow = (currentTotal % 10 === 0);
    const pendingRewards = Math.max(0, milestoneNumber - (redemptionsCount || 0));

    // 7. Dispense Omada Wi-Fi Voucher (gracefully fails safe if pool not seeded yet)
    let wifiVoucher = null;
    try {
      const { data: voucherData, error: voucherErr } = await supabaseAdmin
        .rpc('claim_next_wifi_voucher', { p_user_id: user.id });

      if (!voucherErr && voucherData && voucherData.length > 0) {
        wifiVoucher = {
          code: voucherData[0].voucher_code,
          durationHours: voucherData[0].duration || 1,
          deviceLimit: voucherData[0].devices || 2
        };
      }
    } catch (vErr) {
      console.warn('Wi-Fi voucher dispensing non-fatal notice:', vErr.message);
    }

    return res.status(200).json({
      success: true,
      totalStamps: currentTotal,
      distanceMeters: distanceRecorded,
      rewardUnlockedNow,
      pendingRewards,
      milestoneNumber,
      wifiVoucher,
      message: rewardUnlockedNow
        ? `Milestone Reached! You unlocked a Free Specialty Coffee!`
        : `Stamp recorded! You now have ${currentTotal} ${currentTotal === 1 ? 'stamp' : 'stamps'}.`
    });

  } catch (err) {
    console.error('Unhandled claim-stamp error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
