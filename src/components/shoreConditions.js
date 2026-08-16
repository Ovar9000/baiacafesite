/* ==========================================================================
   BAIA CAFE — Live Shore Conditions & Sunset Countdown
   ========================================================================== */

export function initShoreConditions() {
  const sunsetDisplay = document.getElementById('sunset-countdown-display');
  const shoreStatusText = document.getElementById('shore-status-text');

  function updateSunset() {
    if (!sunsetDisplay) return;

    const now = new Date();
    // Target sunset today at 17:58 (5:58 PM)
    const sunset = new Date();
    sunset.setHours(17, 58, 0, 0);

    let diff = sunset - now;
    if (diff < 0) {
      // Past sunset, set to tomorrow's sunrise
      sunsetDisplay.textContent = 'Golden Twilight ✨';
      return;
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    sunsetDisplay.textContent = `${hours}h ${mins}m ${secs}s`;
  }

  setInterval(updateSunset, 1000);
  updateSunset();

  // Dynamic swell wave indicator simulation
  let swellHeight = 3.2;
  setInterval(() => {
    if (shoreStatusText) {
      const variation = (Math.sin(Date.now() / 20000) * 0.4).toFixed(1);
      const currentSwell = (3.2 + parseFloat(variation)).toFixed(1);
      shoreStatusText.textContent = `Bay Conditions: ${currentSwell}ft Swell • 28°C Water • Offshore 8kts • High Tide 3:45 PM`;
    }
  }, 10000);
}
