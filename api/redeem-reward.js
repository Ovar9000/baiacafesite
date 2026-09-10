import { createClient } from '@supabase/supabase-js';
import { setCorsHeaders, isRateLimited, getSupabaseConfig } from './_security.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rl = isRateLimited(req, 'redeem-reward', 20, 60_000);
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
      console.error('Server configuration error: SUPABASE_SERVICE_ROLE_KEY is missing.');
      return res.status(500).json({ error: 'Server database configuration error. Please contact administrator.' });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid user session. Please sign in again.' });
    }

    // 1. Try atomic PostgreSQL Stored Procedure first (Zero race conditions)
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('redeem_loyalty_reward', {
      p_user_id: user.id,
      p_reward_type: 'coffee'
    });

    if (!rpcError && rpcResult) {
      if (!rpcResult.success) {
        return res.status(400).json(rpcResult);
      }
      return res.status(200).json(rpcResult);
    }

    // 2. Fallback: Sequential database queries if RPC is not yet created in Supabase SQL editor
    const { count: totalStamps, error: stampsError } = await supabaseAdmin
      .from('stamps')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (stampsError) {
      console.error('Error fetching stamps count:', stampsError);
      return res.status(500).json({ error: 'Failed to verify stamps.' });
    }

    const { count: redemptionsCount, error: redemptionsError } = await supabaseAdmin
      .from('redemptions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (redemptionsError) {
      console.error('Error fetching redemptions count:', redemptionsError);
      return res.status(500).json({ error: 'Failed to verify reward status.' });
    }

    const currentTotalStamps = totalStamps || 0;
    const currentRedemptions = redemptionsCount || 0;
    const earnedMilestones = Math.floor(currentTotalStamps / 10);

    if (earnedMilestones <= currentRedemptions) {
      return res.status(400).json({
        error: 'No pending rewards available for redemption.',
        totalStamps: currentTotalStamps,
        redemptionsCount: currentRedemptions
      });
    }

    const milestoneNumberToRedeem = currentRedemptions + 1;
    const rewardType = 'coffee';
    const serverTimestamp = new Date().toISOString();

    const { data: insertedRedemption, error: insertError } = await supabaseAdmin
      .from('redemptions')
      .insert({
        user_id: user.id,
        reward_type: rewardType,
        milestone_number: milestoneNumberToRedeem,
        redeemed_at: serverTimestamp
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to insert redemption:', insertError);
      if (insertError.code === '23505' || insertError.message?.toLowerCase().includes('unique') || insertError.message?.toLowerCase().includes('duplicate')) {
        return res.status(400).json({ error: 'This reward milestone has already been claimed.' });
      }
      return res.status(500).json({ error: `Failed to record reward redemption: ${insertError.message}` });
    }

    return res.status(200).json({
      success: true,
      redemptionId: insertedRedemption.id,
      rewardType,
      milestoneNumber: milestoneNumberToRedeem,
      redeemedAt: serverTimestamp,
      rewardTitle: 'Free Specialty Coffee',
      remainingPendingRewards: Math.max(0, earnedMilestones - milestoneNumberToRedeem)
    });

  } catch (err) {
    console.error('Unhandled redeem-reward error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
