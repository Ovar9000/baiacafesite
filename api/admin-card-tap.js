import { createClient } from '@supabase/supabase-js';
import { setCorsHeaders, isRateLimited, isAdminAuthenticated, getSupabaseConfig } from './_security.js';

const CAFE_TIMEZONE = process.env.CAFE_TIMEZONE || 'Asia/Manila';

function cleanCardUid(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/[:\s-]/g, '').trim().toUpperCase();
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

export default async function handler(req, res) {
  setCorsHeaders(req, res, 'POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rl = isRateLimited(req, 'admin-card-tap', 60, 60_000);
  if (rl.limited) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({ error: 'Too many card scans. Please wait a moment.' });
  }

  try {
    if (!isAdminAuthenticated(req).ok) {
      await new Promise((r) => setTimeout(r, 200));
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }

    const { cardUid } = req.body || {};
    const cleanUid = cleanCardUid(cardUid);

    if (!cleanUid || cleanUid.length < 4 || cleanUid.length > 32) {
      return res.status(400).json({ error: 'Invalid card UID format.' });
    }

    let supabaseAdmin;
    try {
      const { url, serviceKey } = getSupabaseConfig();
      supabaseAdmin = createClient(url, serviceKey, { auth: { persistSession: false } });
    } catch {
      return res.status(500).json({ error: 'Server database configuration error.' });
    }

    // 1. Find active card
    const { data: card, error: cardErr } = await supabaseAdmin
      .from('loyalty_cards')
      .select(`
        id,
        user_id,
        card_uid,
        status,
        last_tapped_at,
        profiles (
          id,
          display_name,
          email,
          avatar_url
        )
      `)
      .eq('card_uid', cleanUid)
      .eq('status', 'active')
      .maybeSingle();

    if (cardErr) {
      console.error('Error querying loyalty card:', cardErr);
      return res.status(500).json({ error: 'Database error searching card.' });
    }

    // Card not linked to any active user
    if (!card) {
      return res.status(200).json({
        status: 'unlinked_card',
        cardUid: cleanUid,
        message: `Card ${cleanUid} is unassigned. Tap "Assign to Member" to link it.`
      });
    }

    const userProfile = card.profiles || { id: card.user_id, display_name: 'Member' };
    const todayManila = getManilaDateString();
    const startOfDayISO = new Date(`${todayManila}T00:00:00+08:00`).toISOString();
    const endOfDayISO = new Date(`${todayManila}T23:59:59.999+08:00`).toISOString();

    // 2. Check if already stamped today
    const { data: todayStamps, error: checkError } = await supabaseAdmin
      .from('stamps')
      .select('id, awarded_at')
      .eq('user_id', card.user_id)
      .gte('awarded_at', startOfDayISO)
      .lte('awarded_at', endOfDayISO);

    if (checkError) {
      console.error('Database query error checking stamps:', checkError);
      return res.status(500).json({ error: 'Failed to verify today’s stamp status.' });
    }

    // 3. Fetch lifetime stamps and redemptions count
    const { count: totalStampsCount } = await supabaseAdmin
      .from('stamps')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', card.user_id);

    const { count: redemptionsCount } = await supabaseAdmin
      .from('redemptions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', card.user_id);

    const currentTotalStamps = totalStampsCount || 0;
    const currentRedemptions = redemptionsCount || 0;

    // Already collected today
    if (todayStamps && todayStamps.length > 0) {
      const awardedTime = new Intl.DateTimeFormat('en-PH', {
        timeZone: CAFE_TIMEZONE,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }).format(new Date(todayStamps[0].awarded_at));

      return res.status(200).json({
        status: 'already_stamped',
        user: userProfile,
        cardUid: cleanUid,
        totalStamps: currentTotalStamps,
        cycleProgress: currentTotalStamps % 10,
        pendingRewards: Math.max(0, Math.floor(currentTotalStamps / 10) - currentRedemptions),
        lastAwardedTime: awardedTime,
        message: `${userProfile.display_name} already collected today’s stamp at ${awardedTime}! ☕`
      });
    }

    // 4. Record new stamp
    const { error: insertError } = await supabaseAdmin
      .from('stamps')
      .insert({
        user_id: card.user_id,
        staff_note: 'Cashier Counter NFC Tap'
      });

    if (insertError) {
      if (insertError.code === '23505' || insertError.message?.toLowerCase().includes('unique')) {
        return res.status(200).json({
          status: 'already_stamped',
          user: userProfile,
          cardUid: cleanUid,
          totalStamps: currentTotalStamps,
          cycleProgress: currentTotalStamps % 10,
          pendingRewards: Math.max(0, Math.floor(currentTotalStamps / 10) - currentRedemptions),
          message: `${userProfile.display_name} already collected today’s stamp!`
        });
      }
      return res.status(500).json({ error: `Failed to award stamp: ${insertError.message}` });
    }

    // Update last_tapped_at on card
    await supabaseAdmin
      .from('loyalty_cards')
      .update({ last_tapped_at: new Date().toISOString() })
      .eq('id', card.id);

    const newTotalStamps = currentTotalStamps + 1;
    const milestoneNumber = Math.floor(newTotalStamps / 10);
    const rewardUnlockedNow = (newTotalStamps % 10 === 0);
    const pendingRewards = Math.max(0, milestoneNumber - currentRedemptions);

    return res.status(200).json({
      status: 'awarded',
      user: userProfile,
      cardUid: cleanUid,
      totalStamps: newTotalStamps,
      cycleProgress: newTotalStamps % 10,
      rewardUnlockedNow,
      pendingRewards,
      milestoneNumber,
      message: rewardUnlockedNow
        ? `🎉 Milestone Reached! ${userProfile.display_name} earned a Free Classic Coffee!`
        : `Stamp recorded! ${userProfile.display_name} now has ${newTotalStamps} ${newTotalStamps === 1 ? 'stamp' : 'stamps'}.`
    });

  } catch (err) {
    console.error('Unhandled admin-card-tap error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
