import { createClient } from '@supabase/supabase-js';
import { setCorsHeaders, isRateLimited, rejectUnlessAdmin, getSupabaseConfig } from './_security.js';
import { cleanCardUid } from './_cards.js';

// Barista hands over a free Classic Coffee for the tapped card (walk-in or linked)
export default async function handler(req, res) {
  setCorsHeaders(req, res, 'POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rl = isRateLimited(req, 'admin-redeem-card', 30, 60_000);
  if (rl.limited) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  }

  try {
    if (await rejectUnlessAdmin(req, res)) return;

    const cleanUid = cleanCardUid((req.body || {}).cardUid);
    if (!cleanUid) {
      return res.status(400).json({ error: 'Tap the card on the reader first.' });
    }

    let supabaseAdmin;
    try {
      const { url, serviceKey } = getSupabaseConfig();
      supabaseAdmin = createClient(url, serviceKey, { auth: { persistSession: false } });
    } catch {
      return res.status(500).json({ error: 'Server database configuration error.' });
    }

    const { data: card } = await supabaseAdmin
      .from('loyalty_cards')
      .select('id')
      .eq('card_uid', cleanUid)
      .eq('status', 'active')
      .maybeSingle();

    if (!card) {
      return res.status(404).json({ error: 'This card is not active.' });
    }

    const { data, error } = await supabaseAdmin.rpc('redeem_card_reward', { p_card_id: card.id });
    if (error) {
      console.error('redeem_card_reward failed:', error);
      if (error.code === '23505') {
        return res.status(409).json({ error: 'That reward was just redeemed.' });
      }
      return res.status(500).json({ error: 'Could not redeem the reward. Try again.' });
    }
    if (!data?.success) {
      return res.status(400).json({ error: data?.error || 'No free coffee ready yet.' });
    }

    return res.status(200).json({
      success: true,
      pendingRewards: data.remainingPendingRewards ?? 0
    });

  } catch (err) {
    console.error('Unhandled admin-redeem-card error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
