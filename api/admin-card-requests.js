import { createClient } from '@supabase/supabase-js';
import { setCorsHeaders, isRateLimited, isAdminAuthenticated, getSupabaseConfig } from './_security.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res, 'GET,OPTIONS,POST');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rl = isRateLimited(req, 'admin-card-requests', 40, 60_000);
  if (rl.limited) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  }

  try {
    if (!isAdminAuthenticated(req).ok) {
      await new Promise((r) => setTimeout(r, 200));
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }

    let supabaseAdmin;
    try {
      const { url, serviceKey } = getSupabaseConfig();
      supabaseAdmin = createClient(url, serviceKey, { auth: { persistSession: false } });
    } catch {
      return res.status(500).json({ error: 'Server database configuration error.' });
    }

    // Fetch pending card requests joined with profiles
    const { data: pendingRequests, error: pErr } = await supabaseAdmin
      .from('card_requests')
      .select(`
        id,
        user_id,
        status,
        price_php,
        includes_free_coffee,
        free_coffee_redeemed,
        requested_at,
        profiles (
          id,
          display_name,
          email,
          avatar_url
        )
      `)
      .eq('status', 'pending')
      .order('requested_at', { ascending: false });

    if (pErr) {
      console.error('Error fetching pending card requests:', pErr);
      return res.status(500).json({ error: 'Failed to fetch pending card requests.' });
    }

    // Fetch recently fulfilled requests (last 10)
    const { data: fulfilledRequests, error: fErr } = await supabaseAdmin
      .from('card_requests')
      .select(`
        id,
        user_id,
        status,
        price_php,
        requested_at,
        fulfilled_at,
        fulfilled_by,
        profiles (
          id,
          display_name,
          email
        )
      `)
      .eq('status', 'fulfilled')
      .order('fulfilled_at', { ascending: false })
      .limit(10);

    if (fErr) {
      console.warn('Error fetching fulfilled requests:', fErr);
    }

    return res.status(200).json({
      success: true,
      pending: pendingRequests || [],
      recentlyFulfilled: fulfilledRequests || []
    });

  } catch (err) {
    console.error('Unhandled admin-card-requests error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
