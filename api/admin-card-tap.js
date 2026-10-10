import { createClient } from '@supabase/supabase-js';
import { setCorsHeaders, isRateLimited, rejectUnlessAdmin, getSupabaseConfig } from './_security.js';
import { cleanCardUid, manilaDayBounds, forHolder, holderProgress, holderName, holderWifiVoucher, CARD_SELECT } from './_cards.js';

const CAFE_TIMEZONE = process.env.CAFE_TIMEZONE || 'Asia/Manila';

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
    if (await rejectUnlessAdmin(req, res)) return;

    const cleanUid = cleanCardUid((req.body || {}).cardUid);
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

    // 1. Find the active card (linked to an account or a walk-in card)
    const { data: card, error: cardErr } = await supabaseAdmin
      .from('loyalty_cards')
      .select(CARD_SELECT)
      .eq('card_uid', cleanUid)
      .eq('status', 'active')
      .maybeSingle();

    if (cardErr) {
      console.error('Error querying loyalty card:', cardErr);
      return res.status(500).json({ error: 'Database error searching card.' });
    }

    if (!card) {
      return res.status(200).json({ status: 'unlinked_card', cardUid: cleanUid });
    }

    const holder = {
      cardUid: cleanUid,
      walkIn: !card.user_id,
      user: { display_name: holderName(card) }
    };

    // 2. One stamp per holder per Manila day
    const { start, end } = manilaDayBounds();
    const { data: todayStamps, error: checkError } = await forHolder(
      supabaseAdmin.from('stamps').select('id, awarded_at'),
      card
    ).gte('awarded_at', start).lte('awarded_at', end);

    if (checkError) {
      console.error('Database query error checking stamps:', checkError);
      return res.status(500).json({ error: 'Failed to verify today’s stamp status.' });
    }

    if (todayStamps?.length) {
      const progress = await holderProgress(supabaseAdmin, card);
      return res.status(200).json({
        status: 'already_stamped',
        ...holder,
        ...progress,
        wifiVoucher: await holderWifiVoucher(supabaseAdmin, card),
        lastAwardedTime: new Intl.DateTimeFormat('en-PH', {
          timeZone: CAFE_TIMEZONE, hour: 'numeric', minute: '2-digit', hour12: true
        }).format(new Date(todayStamps[0].awarded_at))
      });
    }

    // 3. Record the stamp (card_id kept on linked stamps too, for history)
    const { error: insertError } = await supabaseAdmin
      .from('stamps')
      .insert({ user_id: card.user_id, card_id: card.id, staff_note: 'Cashier Counter NFC Tap' });

    if (insertError) {
      if (insertError.code === '23505' || insertError.message?.toLowerCase().includes('unique')) {
        const progress = await holderProgress(supabaseAdmin, card);
        return res.status(200).json({
          status: 'already_stamped',
          ...holder,
          ...progress,
          wifiVoucher: await holderWifiVoucher(supabaseAdmin, card)
        });
      }
      console.error('Failed to award stamp:', insertError);
      return res.status(500).json({ error: 'Failed to award stamp.' });
    }

    await supabaseAdmin
      .from('loyalty_cards')
      .update({ last_tapped_at: new Date().toISOString() })
      .eq('id', card.id);

    const progress = await holderProgress(supabaseAdmin, card);
    return res.status(200).json({
      status: 'awarded',
      ...holder,
      ...progress,
      rewardUnlockedNow: progress.totalStamps > 0 && progress.totalStamps % 10 === 0,
      wifiVoucher: await holderWifiVoucher(supabaseAdmin, card)
    });

  } catch (err) {
    console.error('Unhandled admin-card-tap error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
