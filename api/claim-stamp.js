import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://cqtcmrqlafgtcrcfaojz.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DAILY_QR_SECRET = process.env.DAILY_QR_SECRET || 'baia_daily_secret_key_2026_x89a';
const CAFE_LAT = parseFloat(process.env.CAFE_LAT || '13.6218');
const CAFE_LNG = parseFloat(process.env.CAFE_LNG || '123.1948');
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

function generateExpectedToken(dateStr) {
  return crypto.createHmac('sha256', DAILY_QR_SECRET).update(dateStr).digest('hex');
}

function safeCompareTokens(provided, expected) {
  if (!provided || typeof provided !== 'string') return false;
  // Match full hash or 16-char prefix
  const expectedPrefix = expected.substring(0, provided.length);
  if (provided.length !== expected.length && provided.length !== expectedPrefix.length) {
    return false;
  }
  const bufA = Buffer.from(provided, 'utf8');
  const bufB = Buffer.from(provided.length === expected.length ? expected : expectedPrefix, 'utf8');
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
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Server configuration error: SUPABASE_SERVICE_ROLE_KEY is missing.');
      return res.status(500).json({ error: 'Server database configuration error. Please contact administrator.' });
    }

    const accessToken = authHeader.replace('Bearer ', '').trim();
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid user session. Please sign in again.' });
    }

    const { token, lat, lng } = req.body || {};

    if (!token) {
      return res.status(400).json({ error: 'QR verification token is required.' });
    }

    // 1. Verify daily token
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

    // 3. Ensure user profile exists
    await supabaseAdmin.from('profiles').upsert({
      id: user.id,
      email: user.email,
      display_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Baia Guest',
      avatar_url: user.user_metadata?.avatar_url || null
    });

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
