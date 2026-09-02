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

function getSupabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
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
    const { password } = req.body || {};
    if (!safeVerifyAdminPassword(password)) {
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      console.error('Server configuration error: SUPABASE_SERVICE_ROLE_KEY is missing.');
      return res.status(500).json({ error: 'Server database configuration error. Please contact administrator.' });
    }

    // 1. Fetch real registered customer profiles from Supabase
    const { data: profiles, error: pErr } = await supabaseAdmin
      .from('profiles')
      .select('id, email, display_name, avatar_url, created_at')
      .order('created_at', { ascending: false });

    if (pErr) {
      console.error('Error fetching Supabase profiles:', pErr);
      return res.status(500).json({ error: 'Failed to fetch profiles from Supabase.' });
    }

    // 2. Fetch all stamps and redemptions
    const { data: stamps, error: sErr } = await supabaseAdmin
      .from('stamps')
      .select('user_id, awarded_at, staff_note')
      .order('awarded_at', { ascending: false });

    const { data: redemptions, error: rErr } = await supabaseAdmin
      .from('redemptions')
      .select('user_id, redeemed_at, reward_type, milestone_number');

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
