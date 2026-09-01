import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://cqtcmrqlafgtcrcfaojz.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_DPUxis9LXG23_4k8VqXHjQ_JCyxrf3U';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_DPUxis9LXG23_4k8VqXHjQ_JCyxrf3U';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const demoEmail = 'testcustomer@baia.cafe';
  const demoPass = 'BaiaDemoPass2026!';

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });

    // 1. Ensure user is created with pre-confirmed email (bypasses email service & rate limits)
    try {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: demoEmail,
        password: demoPass,
        email_confirm: true,
        user_metadata: {
          full_name: 'Mark Lawrence (Test Account)',
          avatar_url: '/images/Logo.webp'
        }
      });

      if (created?.user) {
        // Upsert into profiles
        await supabaseAdmin.from('profiles').upsert({
          id: created.user.id,
          email: demoEmail,
          display_name: 'Mark Lawrence (Test Account)',
          avatar_url: '/images/Logo.webp'
        });
      }
    } catch (e) {
      // User may already exist
    }

    // 2. Sign in with password via Supabase Auth
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false }
    });

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: demoEmail,
      password: demoPass
    });

    if (error) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      session: data.session,
      user: data.user
    });

  } catch (err) {
    console.error('Dev login error:', err);
    return res.status(500).json({ error: err.message || 'Internal dev login error' });
  }
}
