import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://cqtcmrqlafgtcrcfaojz.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function safeVerifyAdminPassword(providedPassword) {
  if (!providedPassword || typeof providedPassword !== 'string') return false;
  const expectedPassword = process.env.ADMIN_PASSWORD || 'baia-admin-2026';
  const providedBuf = Buffer.from(providedPassword, 'utf8');
  const expectedBuf = Buffer.from(expectedPassword, 'utf8');
  if (providedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { password, email, staffNote } = req.body || {};

    if (!safeVerifyAdminPassword(password)) {
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Server configuration error: SUPABASE_SERVICE_ROLE_KEY is missing.');
      return res.status(500).json({ error: 'Server database configuration error. Please contact administrator.' });
    }

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Customer email is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });

    // 1. Find profile by email
    let userId = null;
    let displayName = cleanEmail;

    const { data: profiles, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('id, email, display_name')
      .ilike('email', cleanEmail)
      .limit(1);

    if (profiles && profiles.length > 0) {
      userId = profiles[0].id;
      displayName = profiles[0].display_name || cleanEmail;
    } else {
      // Try finding user via auth admin API
      try {
        const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
        const found = userList?.users?.find(u => u.email?.toLowerCase() === cleanEmail);
        if (found) {
          userId = found.id;
          displayName = found.user_metadata?.full_name || found.email;
          // create profile row
          await supabaseAdmin.from('profiles').upsert({
            id: found.id,
            email: found.email,
            display_name: displayName
          });
        }
      } catch (e) {
        console.warn('Could not list auth users:', e.message);
      }
    }

    if (!userId) {
      return res.status(404).json({
        error: `Customer with email "${cleanEmail}" was not found. Please ask them to log in to /card first.`
      });
    }

    // 2. Insert manual stamp
    const note = staffNote?.trim() ? `Manual Grant: ${staffNote.trim()}` : 'Manual Barista Override (Edge Case / GPS)';
    const { error: insertErr } = await supabaseAdmin
      .from('stamps')
      .insert({
        user_id: userId,
        distance_meters: 0,
        staff_note: note
      });

    if (insertErr) {
      console.error('Manual stamp insert error:', insertErr);
      if (insertErr.code === '23505' || insertErr.message?.toLowerCase().includes('unique') || insertErr.message?.toLowerCase().includes('duplicate')) {
        return res.status(400).json({
          error: `Customer (${displayName}) has already received a stamp for today. Only 1 stamp per day is permitted.`
        });
      }
      return res.status(500).json({ error: `Failed to award stamp in database: ${insertErr.message}` });
    }

    // 3. Get updated count
    const { count: totalStamps } = await supabaseAdmin
      .from('stamps')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    return res.status(200).json({
      success: true,
      message: `Successfully granted 1 stamp to ${displayName}!`,
      user: {
        id: userId,
        email: cleanEmail,
        displayName
      },
      totalStamps: totalStamps || 1
    });

  } catch (err) {
    console.error('Unhandled admin manual stamp error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
