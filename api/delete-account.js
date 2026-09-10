import { createClient } from '@supabase/supabase-js';
import { setCorsHeaders, isRateLimited, getSupabaseConfig } from './_security.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res, 'GET,OPTIONS,PATCH,DELETE,POST,PUT');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rl = isRateLimited(req, 'delete-account', 10, 60_000);
  if (rl.limited) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  }

  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    let supabaseAdmin;
    try {
      const { url, serviceKey } = getSupabaseConfig();
      supabaseAdmin = createClient(url, serviceKey, {
        auth: { persistSession: false }
      });
    } catch {
      console.error('Server configuration error: SUPABASE_SERVICE_ROLE_KEY is missing.');
      return res.status(500).json({ error: 'Server database configuration error.' });
    }

    const accessToken = authHeader.replace('Bearer ', '').trim();
    if (accessToken.length < 20 || accessToken.length > 5000) {
      return res.status(401).json({ error: 'Invalid user session. Please sign in again.' });
    }

    // Require explicit typed confirmation to prevent CSRF / stolen-token abuse
    const { confirm } = req.body || {};
    if (req.method === 'POST' && confirm !== 'DELETE') {
      return res.status(400).json({ error: 'Please type DELETE to confirm account deletion.' });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid user session. Please sign in again.' });
    }

    // Disassociate any claimed vouchers from the deleted user while keeping them marked as used
    try {
      await supabaseAdmin
        .from('wifi_vouchers')
        .update({ claimed_by: null })
        .eq('claimed_by', user.id);
    } catch (vErr) {
      console.warn('Non-fatal voucher disassociation notice during account deletion:', vErr.message);
    }

    // Delete user from auth.users (automatically cascades to profiles, stamps, redemptions)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      throw deleteError;
    }

    return res.status(200).json({
      success: true,
      message: 'Your account and loyalty data have been permanently deleted.'
    });
  } catch (err) {
    console.error('Delete account error:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete account.' });
  }
}
