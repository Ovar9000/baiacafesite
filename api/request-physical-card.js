import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig, setCorsHeaders, isRateLimited } from './_security.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res, 'GET,OPTIONS,POST');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET: Check user's current card & request status
  // POST: Submit a new physical card request
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rl = isRateLimited(req, 'request-physical-card', 25, 60_000);
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
    } catch {
      return res.status(500).json({ error: 'Server database configuration error.' });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid user session. Please sign in again.' });
    }

    // 1. Fetch user's active loyalty card if any
    const { data: activeCard, error: cardErr } = await supabaseAdmin
      .from('loyalty_cards')
      .select('id, card_uid, card_label, status, issued_at, last_tapped_at')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (cardErr) {
      console.warn('Error fetching active card:', cardErr.message);
    }

    // 2. Fetch user's latest card request if any
    const { data: latestRequest, error: reqErr } = await supabaseAdmin
      .from('card_requests')
      .select('id, status, price_php, includes_free_coffee, requested_at, fulfilled_at')
      .eq('user_id', user.id)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (reqErr) {
      console.warn('Error fetching card request:', reqErr.message);
    }

    // Handle GET: Return status
    if (req.method === 'GET') {
      return res.status(200).json({
        activeCard: activeCard || null,
        pendingRequest: (latestRequest && latestRequest.status === 'pending') ? latestRequest : null,
        latestRequest: latestRequest || null
      });
    }

    // Handle POST: Submit new request
    if (activeCard) {
      return res.status(400).json({
        error: 'You already have an active physical loyalty card! If your card was lost, please ask our counter barista for a replacement.'
      });
    }

    if (latestRequest && latestRequest.status === 'pending') {
      return res.status(400).json({
        error: 'You already have a pending card request! Please visit the Barista Cashier to claim your card and enjoy your complimentary coffee.'
      });
    }

    // Ensure profile exists
    await supabaseAdmin.from('profiles').upsert({
      id: user.id,
      email: user.email,
      display_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Baia Guest',
      avatar_url: user.user_metadata?.avatar_url || null
    }, { onConflict: 'id', ignoreDuplicates: true });

    // Insert pending card request
    const { data: newRequest, error: insertErr } = await supabaseAdmin
      .from('card_requests')
      .insert({
        user_id: user.id,
        status: 'pending',
        price_php: 120,
        includes_free_coffee: true
      })
      .select()
      .single();

    if (insertErr) {
      console.error('Failed to create card request:', insertErr);
      return res.status(500).json({ error: 'Failed to record card request. Please try again.' });
    }

    return res.status(200).json({
      success: true,
      request: newRequest,
      message: 'Card requested! Visit the Barista Cashier at BAIA Café to pay ₱120, receive your physical tap card, and claim your free Classic Coffee.'
    });

  } catch (err) {
    console.error('Unhandled request-physical-card error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
