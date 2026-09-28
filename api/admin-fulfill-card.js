import { createClient } from '@supabase/supabase-js';
import { setCorsHeaders, isRateLimited, isAdminAuthenticated, getSupabaseConfig } from './_security.js';

function cleanCardUid(raw) {
  if (!raw || typeof raw !== 'string') return '';
  // Normalize: remove colons, dashes, spaces, convert to uppercase
  return raw.replace(/[:\s-]/g, '').trim().toUpperCase();
}

export default async function handler(req, res) {
  setCorsHeaders(req, res, 'POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rl = isRateLimited(req, 'admin-fulfill-card', 30, 60_000);
  if (rl.limited) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  }

  try {
    if (!isAdminAuthenticated(req).ok) {
      await new Promise((r) => setTimeout(r, 200));
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }

    const { requestId, userId, cardUid, staffNote } = req.body || {};

    const cleanUid = cleanCardUid(cardUid);
    if (!cleanUid || cleanUid.length < 4 || cleanUid.length > 32) {
      return res.status(400).json({ error: 'Invalid card UID. Please tap a valid NFC card onto the reader.' });
    }

    let supabaseAdmin;
    try {
      const { url, serviceKey } = getSupabaseConfig();
      supabaseAdmin = createClient(url, serviceKey, { auth: { persistSession: false } });
    } catch {
      return res.status(500).json({ error: 'Server database configuration error.' });
    }

    // 1. Check if card UID is already assigned to any active card
    const { data: existingCard, error: checkErr } = await supabaseAdmin
      .from('loyalty_cards')
      .select('id, user_id, status')
      .eq('card_uid', cleanUid)
      .eq('status', 'active')
      .maybeSingle();

    if (existingCard) {
      return res.status(400).json({
        error: `This NFC card (${cleanUid}) is already registered and active for another member! Please use an unassigned blank card.`
      });
    }

    // 2. Resolve target user
    let targetUserId = userId;
    let requestRecord = null;

    if (requestId) {
      const { data: reqData, error: reqErr } = await supabaseAdmin
        .from('card_requests')
        .select('*')
        .eq('id', requestId)
        .single();

      if (reqErr || !reqData) {
        return res.status(404).json({ error: 'Card request not found.' });
      }

      if (reqData.status === 'fulfilled') {
        return res.status(400).json({ error: 'This card request has already been fulfilled.' });
      }

      targetUserId = reqData.user_id;
      requestRecord = reqData;
    }

    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID or Request ID is required.' });
    }

    // 3. Deactivate any previous active cards for this user
    await supabaseAdmin
      .from('loyalty_cards')
      .update({ status: 'deactivated' })
      .eq('user_id', targetUserId)
      .eq('status', 'active');

    // 4. Insert new active card
    const { data: newCard, error: cardInsertErr } = await supabaseAdmin
      .from('loyalty_cards')
      .insert({
        user_id: targetUserId,
        card_uid: cleanUid,
        card_label: staffNote ? `Baia Vinyl Tap Card (${staffNote})` : 'Baia Vinyl Tap Card',
        status: 'active'
      })
      .select()
      .single();

    if (cardInsertErr) {
      console.error('Error creating loyalty card:', cardInsertErr);
      return res.status(500).json({ error: `Failed to link card: ${cardInsertErr.message}` });
    }

    // 5. If fulfilling a request, mark it fulfilled
    if (requestId) {
      await supabaseAdmin
        .from('card_requests')
        .update({
          status: 'fulfilled',
          fulfilled_at: new Date().toISOString(),
          fulfilled_by: 'Cashier Barista',
          notes: `Linked to card UID: ${cleanUid}`
        })
        .eq('id', requestId);
    }

    // 6. Fetch user profile for display
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, display_name, email, avatar_url')
      .eq('id', targetUserId)
      .single();

    return res.status(200).json({
      success: true,
      card: newCard,
      user: profile || { id: targetUserId },
      message: `Card ${cleanUid} successfully linked to ${profile?.display_name || 'member'}! Collect ₱120 and dispense complimentary Classic Coffee.`
    });

  } catch (err) {
    console.error('Unhandled admin-fulfill-card error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
