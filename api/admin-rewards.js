import { createClient } from '@supabase/supabase-js';
import { setCorsHeaders, isRateLimited, isAdminAuthenticated, getSupabaseConfig, getRequiredEnv } from './_security.js';

function getSupabaseAdmin() {
  try {
    const { url, serviceKey } = getSupabaseConfig();
    return createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rl = isRateLimited(req, 'admin-rewards', 30, 60_000);
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
    if (!isAdminAuthenticated(req).ok) {
      await new Promise((r) => setTimeout(r, 300));
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      console.error('Server configuration error: SUPABASE_SERVICE_ROLE_KEY is missing.');
      return res.status(500).json({ error: 'Server database configuration error. Please contact administrator.' });
    }

    // 1. Fetch real registered customer profiles from Supabase (bounded)
    const { data: profiles, error: pErr } = await supabaseAdmin
      .from('profiles')
      .select('id, email, display_name, avatar_url, created_at')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (pErr) {
      console.error('Error fetching Supabase profiles:', pErr);
      return res.status(500).json({ error: 'Failed to fetch profiles from Supabase.' });
    }

    // 2. Fetch stamps and redemptions (bounded to prevent memory exhaustion)
    const { data: stamps, error: sErr } = await supabaseAdmin
      .from('stamps')
      .select('user_id, awarded_at, staff_note')
      .order('awarded_at', { ascending: false })
      .limit(5000);

    const { data: redemptions, error: rErr } = await supabaseAdmin
      .from('redemptions')
      .select('user_id, redeemed_at, reward_type, milestone_number')
      .order('redeemed_at', { ascending: false })
      .limit(2000);

    // Group stamps and redemptions by user_id
    const userStampsMap = {};
    const userRedemptionsMap = {};

    (stamps || []).forEach((s) => {
      if (!userStampsMap[s.user_id]) {
        userStampsMap[s.user_id] = [];
      }
      userStampsMap[s.user_id].push(s);
    });

    (redemptions || []).forEach((r) => {
      if (!userRedemptionsMap[r.user_id]) {
        userRedemptionsMap[r.user_id] = [];
      }
      userRedemptionsMap[r.user_id].push(r);
    });

    // 3. Process each real Supabase member
    const processedMembers = (profiles || []).map((p) => {
      const userStamps = userStampsMap[p.id] || [];
      const userRedemptions = userRedemptionsMap[p.id] || [];

      const totalStamps = userStamps.length;
      const redemptionsCount = userRedemptions.length;

      const milestoneNumber = Math.floor(totalStamps / 10);
      const pendingRewardsCount = Math.max(0, milestoneNumber - redemptionsCount);
      const hasPendingReward = pendingRewardsCount > 0;

      const currentCycleProgress = totalStamps % 10;
      const stampsRemaining = 10 - currentCycleProgress;

      const nextRewardType = 'coffee';
      const nextRewardTitle = 'Free Specialty Coffee';

      let urgency = 'active';
      if (hasPendingReward) {
        urgency = 'ready'; // Reward Ready & Unredeemed
      } else if (currentCycleProgress >= 7) {
        urgency = 'nearing'; // 1-3 stamps away
      } else if (currentCycleProgress >= 4) {
        urgency = 'midway';
      }

      const lastActive = userStamps[0]?.awarded_at || p.created_at;

      return {
        id: p.id,
        name: p.display_name || p.email?.split('@')[0] || 'Member',
        email: p.email || 'No email provided',
        totalStamps,
        redemptionsCount,
        currentCycleProgress,
        stampsRemaining,
        hasPendingReward,
        pendingRewardsCount,
        nextRewardType,
        nextRewardTitle,
        urgency,
        lastActive,
        registeredAt: p.created_at
      };
    });

    // Sort: Reward Ready first, then closest to next reward (9 stamps, 8 stamps...), then recent active
    processedMembers.sort((a, b) => {
      if (a.hasPendingReward && !b.hasPendingReward) return -1;
      if (!a.hasPendingReward && b.hasPendingReward) return 1;
      if (b.currentCycleProgress !== a.currentCycleProgress) {
        return b.currentCycleProgress - a.currentCycleProgress;
      }
      return new Date(b.lastActive) - new Date(a.lastActive);
    });

    const readyCount = processedMembers.filter((m) => m.hasPendingReward).length;
    const nearingCount = processedMembers.filter((m) => !m.hasPendingReward && m.currentCycleProgress >= 7).length;

    return res.status(200).json({
      success: true,
      summary: {
        totalMembers: processedMembers.length,
        readyCount,
        nearingCount
      },
      members: processedMembers
    });
  } catch (err) {
    console.error('Error fetching admin rewards insights:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
