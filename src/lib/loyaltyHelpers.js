/**
 * Baia Café Loyalty Calculation Helpers
 */

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

  return {
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
