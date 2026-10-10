import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { setCorsHeaders, isRateLimited, rejectUnlessAdmin, getSupabaseConfig } from './_security.js';
import { cleanCardUid } from './_cards.js';

const LINK_TTL_MS = 10 * 60 * 1000;

// Barista starts linking a walk-in card: returns a short-lived link the customer
// scans (as a QR) on their phone while signed in to a new account.
export default async function handler(req, res) {
  setCorsHeaders(req, res, 'POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rl = isRateLimited(req, 'admin-card-link', 30, 60_000);
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

    const token = crypto.randomBytes(18).toString('base64url');
    const expiresAt = new Date(Date.now() + LINK_TTL_MS).toISOString();

    const { data: card, error } = await supabaseAdmin
      .from('loyalty_cards')
      .update({ link_token: token, link_token_expires_at: expiresAt })
      .eq('card_uid', cleanUid)
      .eq('status', 'active')
      .is('user_id', null)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('Error creating card link token:', error);
      return res.status(500).json({ error: 'Could not start linking. Try again.' });
    }
    if (!card) {
      return res.status(404).json({ error: 'Only walk-in cards can be linked this way.' });
    }

    const host = req.headers['x-forwarded-host'] || req.headers.host || 'baia.cafe';
    const proto = req.headers['x-forwarded-proto'] || (host.startsWith('localhost') ? 'http' : 'https');

    return res.status(200).json({
      success: true,
      linkUrl: `${proto}://${host}/card/?link=${token}`,
      expiresAt
    });

  } catch (err) {
    console.error('Unhandled admin-card-link error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
