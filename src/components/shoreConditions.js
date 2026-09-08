/* ==========================================================================
   BAIA CAFE — Shore Atmosphere & Sunset Timing for Laurente, Masbate
   ========================================================================== */

export function initShoreConditions() {
  const sunsetDisplay = document.getElementById('sunset-countdown-display');
  if (!sunsetDisplay) return;

  function updateSunset() {
    const now = new Date();
    // Burias Island golden hour sunset target (5:58 PM Manila time)
    const sunsetTarget = new Date(now);
    sunsetTarget.setHours(17, 58, 0, 0);

    let diff = sunsetTarget.getTime() - now.getTime();
    if (diff < 0) {
      // If passed today, count towards tomorrow's sunset
      sunsetTarget.setDate(sunsetTarget.getDate() + 1);
      diff = sunsetTarget.getTime() - now.getTime();
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    sunsetDisplay.textContent = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // Immediate calculation & 1-second interval
  updateSunset();
  setInterval(updateSunset, 1000);
}
