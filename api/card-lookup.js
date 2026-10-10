import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig, setCorsHeaders, isRateLimited } from './_security.js';
import { readerUidFromAny, holderProgress } from './_cards.js';

// Public stamp count for a tapped card (phone tap opens /card/?u=<chip UID>).
// Returns counts only, never who owns the card.
export default async function handler(req, res) {
  setCorsHeaders(req, res, 'GET,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rl = isRateLimited(req, 'card-lookup', 30, 60_000);
  if (rl.limited) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  }

  try {
    const uid = readerUidFromAny(String(req.query?.u || ''));
    if (!uid) {
      return res.status(400).json({ error: 'Unrecognised card.' });
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
      .select('id, user_id')
      .eq('card_uid', uid)
      .eq('status', 'active')
      .maybeSingle();

    res.setHeader('Cache-Control', 'no-store');
    if (!card) {
      return res.status(200).json({ status: 'inactive' });
    }

    const progress = await holderProgress(supabaseAdmin, card);
    return res.status(200).json({
      status: card.user_id ? 'linked' : 'walk_in',
      last4: uid.slice(-4),
      ...progress
    });

  } catch (err) {
    console.error('Unhandled card-lookup error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
