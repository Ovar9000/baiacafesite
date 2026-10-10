import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig, setCorsHeaders, isRateLimited } from './_security.js';

const MESSAGES = {
  expired: 'This link has expired. Ask the barista to show a new one.',
  already_linked: 'This card is already linked to an account.',
  not_new_account: 'Walk-in cards can only be linked to a brand-new account. This account already has stamps or a card.'
};

// Customer scans the barista's QR while signed in: moves the walk-in card and its
// stamps onto this account. New accounts only, so stamps are never merged.
export default async function handler(req, res) {
  setCorsHeaders(req, res, 'POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rl = isRateLimited(req, 'link-card', 10, 60_000);
  if (rl.limited) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  }

  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Please sign in first.' });
    }

    const { token } = req.body || {};
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
      return res.status(400).json({ error: MESSAGES.expired });
    }

    let supabaseAdmin;
    try {
      const { url, serviceKey } = getSupabaseConfig();
      supabaseAdmin = createClient(url, serviceKey, { auth: { persistSession: false } });
    } catch {
      return res.status(500).json({ error: 'Server database configuration error.' });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', '').trim());
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid user session. Please sign in again.' });
    }

    // Stamps reference profiles, so make sure this account has one
    await supabaseAdmin.from('profiles').upsert({
      id: user.id,
      email: user.email,
      display_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Baia Guest',
      avatar_url: user.user_metadata?.avatar_url || null
    }, { onConflict: 'id', ignoreDuplicates: true });

    const { data, error } = await supabaseAdmin.rpc('link_walkin_card', { p_token: token, p_user_id: user.id });
    if (error) {
      console.error('link_walkin_card failed:', error);
      return res.status(500).json({ error: 'Could not link the card. Try again.' });
    }
    if (!data?.success) {
      return res.status(400).json({ error: MESSAGES[data?.code] || 'Could not link the card.' });
    }

    return res.status(200).json({ success: true, stampsMoved: data.stampsMoved || 0 });

  } catch (err) {
    console.error('Unhandled link-card error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
