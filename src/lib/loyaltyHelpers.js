/**
 * Baia Café Loyalty Calculation Helpers
 */

/** Stamps per free coffee. The rule never changes; the bonus below is a gift on top. */
export const STAMPS_PER_REWARD = 10;

/**
 * First-card bonus: when a customer earns their 10th stamp, the database adds
 * 1 bonus stamp (stamps.kind = 'bonus', see supabase/2026-11-06-first-card-bonus.sql).
 * It lands as stamp #11, the first space on card 2, so card 2 takes 9 drinks.
 * It's a normal stamps row, so every count already includes it.
 */
export const isBonusStamp = (stamp) => stamp?.kind === 'bonus';

/** Oldest first; id breaks ties so the bonus always follows the 10th stamp. */
export function sortStampsAsc(stamps = []) {
  return [...stamps].sort((a, b) =>
    (new Date(a.awarded_at) - new Date(b.awarded_at)) || ((a.id ?? 0) - (b.id ?? 0))
  );
}

/**
 * Derives current milestone progress and reward eligibility
 * Every 10 stamps unlocks a Free Specialty Coffee.
 * @param {Array|number} stampsInput - Total lifetime stamps array or count
 * @param {Array|number} redemptionsInput - Redemptions array or count
 */
export function calculateLoyaltyStatus(stampsInput = 0, redemptionsInput = 0) {
  const totalStamps = Array.isArray(stampsInput) ? stampsInput.length : (Number(stampsInput) || 0);
  const redemptionsCount = Array.isArray(redemptionsInput) ? redemptionsInput.length : (Number(redemptionsInput) || 0);

  const milestoneNumber = Math.floor(totalStamps / 10);
  const pendingRewardsCount = Math.max(0, milestoneNumber - redemptionsCount);
  const hasPendingReward = pendingRewardsCount > 0;

  const nextRewardType = 'coffee';
  const nextRewardTitle = 'Free Specialty Coffee';

  // Progress in current 10-stamp cycle (0 to 10)
  const currentCycleProgress = totalStamps % 10;
  const stampsRemainingInCycle = 10 - currentCycleProgress;

  // Next upcoming milestone threshold
  const nextMilestoneStampGoal = (milestoneNumber + 1) * 10;
  const stampsUntilNextMilestone = nextMilestoneStampGoal - totalStamps;
  const upcomingMilestoneType = 'coffee';

  const hasFirstCardBonus = Array.isArray(stampsInput) && stampsInput.some(isBonusStamp);

  return {
    hasFirstCardBonus,
    totalStamps,
    redemptionsCount,
    milestoneNumber,
    hasPendingReward,
    availableReward: hasPendingReward ? nextRewardType : null,
    pendingRewardsCount,
    nextRewardType,
    nextRewardTitle,
    currentCycleProgress,
    stampsRemainingInCycle,
    nextMilestoneStampGoal,
    stampsUntilNextMilestone,
    upcomingMilestoneType
  };
}

/**
 * Format timestamp in Asia/Manila friendly string
 */
export function formatManilaDateTime(isoString) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  } catch (e) {
    return new Date(isoString).toLocaleString();
  }
}
