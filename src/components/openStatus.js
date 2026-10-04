/* ==========================================================================
   BAIA CAFE — Live hours & "Open now" indicators
   Fills [data-hours] and [data-open-status] elements from src/data/siteInfo.js
   ========================================================================== */

import { HOURS_TEXT, getOpenStatus } from '../data/siteInfo.js';

export function initOpenStatus() {
  document.querySelectorAll('[data-hours]').forEach((el) => {
    const text = HOURS_TEXT[el.dataset.hours];
    if (text) el.textContent = text;
  });

  const statusEls = document.querySelectorAll('[data-open-status]');
  if (!statusEls.length) return;

  const update = () => {
    const { state, label } = getOpenStatus();
    statusEls.forEach((el) => {
      el.textContent = label;
      el.closest('[data-open-state]')?.setAttribute('data-open-state', state);
    });
  };

  update();
  // Minute resolution is plenty; re-check when the tab comes back into view.
  setInterval(update, 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') update();
  });
}
