import { createClient } from '@supabase/supabase-js';
import { setCorsHeaders, isRateLimited, rejectUnlessAdmin, getSupabaseConfig } from './_security.js';

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
    if (await rejectUnlessAdmin(req, res)) return;

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

    // 1. Look up this UID in any status (card_uid is unique across all statuses,
    //    so a deactivated/lost card must be re-linked, not re-inserted)
    const { data: existingCard, error: checkErr } = await supabaseAdmin
      .from('loyalty_cards')
      .select('id, user_id, status')
      .eq('card_uid', cleanUid)
      .maybeSingle();

    if (checkErr) {
      console.error('Error checking card UID:', checkErr);
      return res.status(500).json({ error: 'Database error checking card.' });
    }

    if (existingCard?.status === 'active') {
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

    // 3. Link the card FIRST so a failure never leaves the member without a card
    const cardFields = {
      user_id: targetUserId,
      card_label: staffNote ? `Baia Vinyl Tap Card (${staffNote})` : 'Baia Vinyl Tap Card',
      status: 'active',
      issued_at: new Date().toISOString(),
      last_tapped_at: null
    };

    const { data: newCard, error: cardLinkErr } = existingCard
      ? await supabaseAdmin
          .from('loyalty_cards')
          .update(cardFields)
          .eq('id', existingCard.id)
          .neq('status', 'active')
          .select()
          .single()
      : await supabaseAdmin
          .from('loyalty_cards')
          .insert({ ...cardFields, card_uid: cleanUid })
          .select()
          .single();

    if (cardLinkErr || !newCard) {
      console.error('Error linking loyalty card:', cardLinkErr);
      if (cardLinkErr?.code === '23505' || cardLinkErr?.code === 'PGRST116') {
        // Unique violation or the row became active meanwhile: someone else linked it first
        return res.status(409).json({
          error: `This NFC card (${cleanUid}) was just registered to another member. Please use an unassigned blank card.`
        });
      }
      return res.status(500).json({ error: 'Failed to link card. Please try again.' });
    }

    // 4. Retire the member's previous active cards (all except the one just linked)
    await supabaseAdmin
      .from('loyalty_cards')
      .update({ status: 'deactivated' })
      .eq('user_id', targetUserId)
      .eq('status', 'active')
      .neq('id', newCard.id);

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
    return res.status(500).json({ error: 'Internal server error' });
  }
}
