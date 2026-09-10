import { createClient } from '@supabase/supabase-js';
import { setCorsHeaders, isRateLimited, isAdminAuthenticated, getSupabaseConfig, getRequiredEnv } from './_security.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rl = isRateLimited(req, 'admin-manual-stamp', 30, 60_000);
  if (rl.limited) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  }

  try {
    getRequiredEnv('ADMIN_PASSWORD');
  } catch {
    console.error('Server configuration error: ADMIN_PASSWORD environment variable is missing.');
    return res.status(500).json({ error: 'Server authentication configuration error. ADMIN_PASSWORD is not set.' });
  }

  try {
    const { email, staffNote } = req.body || {};

    if (!isAdminAuthenticated(req).ok) {
      await new Promise((r) => setTimeout(r, 300));
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }

    let supabaseAdmin;
    try {
      const { url, serviceKey } = getSupabaseConfig();
      supabaseAdmin = createClient(url, serviceKey, { auth: { persistSession: false } });
    } catch {
      console.error('Server configuration error: SUPABASE_SERVICE_ROLE_KEY is missing.');
      return res.status(500).json({ error: 'Server database configuration error. Please contact administrator.' });
    }

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Customer email is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail) || cleanEmail.length > 254) {
      return res.status(400).json({ error: 'Invalid customer email.' });
    }

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
      // Try finding user via auth admin API with pagination
      try {
        let page = 1;
        let hasMore = true;
        while (hasMore && !userId && page <= 5) {
          const { data: userList, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
            page,
            perPage: 100
          });
          if (listErr || !userList?.users?.length) {
            hasMore = false;
            break;
          }
          const found = userList.users.find(u => u.email?.toLowerCase() === cleanEmail);
          if (found) {
            userId = found.id;
            displayName = found.user_metadata?.full_name || found.email;
            await supabaseAdmin.from('profiles').upsert({
              id: found.id,
              email: found.email,
              display_name: displayName
            });
            break;
          }
          if (userList.users.length < 100) {
            hasMore = false;
          } else {
            page++;
          }
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

    // 2. Insert manual stamp (cap note length, strip control chars)
    const rawNote = typeof staffNote === 'string' ? staffNote.trim().slice(0, 200) : '';
    const safeNote = rawNote.replace(/[\u0000-\u001F\u007F]/g, '');
    const note = safeNote ? `Manual Grant: ${safeNote}` : 'Manual Barista Override (Edge Case / GPS)';
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
