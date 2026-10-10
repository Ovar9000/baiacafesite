import { createClient } from '@supabase/supabase-js';
import { setCorsHeaders, isRateLimited, rejectUnlessAdmin, getSupabaseConfig } from './_security.js';
import { cleanCardUid } from './_cards.js';

// Sell a blank card at the counter as a walk-in card (no account needed)
export default async function handler(req, res) {
  setCorsHeaders(req, res, 'POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rl = isRateLimited(req, 'admin-activate-card', 30, 60_000);
  if (rl.limited) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  }

  try {
    if (await rejectUnlessAdmin(req, res)) return;

    const cleanUid = cleanCardUid((req.body || {}).cardUid);
    if (!cleanUid || cleanUid.length < 4 || cleanUid.length > 32) {
      return res.status(400).json({ error: 'Invalid card number. Tap the card on the reader again.' });
    }

    let supabaseAdmin;
    try {
      const { url, serviceKey } = getSupabaseConfig();
      supabaseAdmin = createClient(url, serviceKey, { auth: { persistSession: false } });
    } catch {
      return res.status(500).json({ error: 'Server database configuration error.' });
    }

    const { data: existing, error: findErr } = await supabaseAdmin
      .from('loyalty_cards')
      .select('id, status')
      .eq('card_uid', cleanUid)
      .maybeSingle();

    if (findErr) {
      console.error('Error checking card UID:', findErr);
      return res.status(500).json({ error: 'Database error checking card.' });
    }

    if (existing?.status === 'active') {
      return res.status(409).json({ error: 'This card is already in use. Use a fresh card.' });
    }

    // card_uid is unique across statuses, so a retired card is reused, not re-inserted.
    // Its old stamps stay with whoever owned them.
    const fields = {
      user_id: null,
      card_label: 'Walk-in Tap Card',
      status: 'active',
      issued_at: new Date().toISOString(),
      last_tapped_at: null,
      link_token: null,
      link_token_expires_at: null
    };

    const { error: saveErr } = existing
      ? await supabaseAdmin.from('loyalty_cards').update(fields).eq('id', existing.id).neq('status', 'active')
      : await supabaseAdmin.from('loyalty_cards').insert({ ...fields, card_uid: cleanUid });

    if (saveErr) {
      console.error('Error activating walk-in card:', saveErr);
      if (saveErr.code === '23505') {
        return res.status(409).json({ error: 'This card was just activated. Tap it again.' });
      }
      return res.status(500).json({ error: 'Could not activate the card. Try again.' });
    }

    return res.status(200).json({ success: true, cardUid: cleanUid });

  } catch (err) {
    console.error('Unhandled admin-activate-card error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
