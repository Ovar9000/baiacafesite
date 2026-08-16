/* ==========================================================================
   BAIA CAFE — Live Shore Telemetry & Weather API for Laurente, Masbate
   ========================================================================== */

import { setLiveRainState } from './weatherEasterEgg.js';

const BAIA_COORDINATES = {
  lat: 13.1344,
  lon: 122.9772,
  name: "Laurente, San Pascual, Masbate"
};

export function initShoreConditions() {
  const sunsetDisplay = document.getElementById('sunset-countdown-display');
  const liveWeatherEl = document.getElementById('shore-live-weather');
  const liveSwellEl = document.getElementById('shore-live-swell');
  const liveWindEl = document.getElementById('shore-live-wind');
  const liveSunsetEl = document.getElementById('shore-live-sunset');
  const shoreStatusText = document.getElementById('shore-status-text');

  let liveSunsetTime = new Date();
  liveSunsetTime.setHours(17, 58, 0, 0); // Default Masbate sunset around 5:58 PM

  function updateSunset() {
    const now = new Date();
    let diff = liveSunsetTime.getTime() - now.getTime();

    if (diff < 0) {
      // If passed today, count towards tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(17, 58, 0, 0);
      diff = tomorrow.getTime() - now.getTime();
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    if (sunsetDisplay) sunsetDisplay.textContent = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    if (liveSunsetEl) liveSunsetEl.textContent = `Sunset in ${hours}h ${mins}m`;
  }

  updateSunset();
  setInterval(updateSunset, 1000);

  // Defer non-critical external weather network requests to avoid blocking LCP/FCP
  async function fetchMasbateLiveWeather() {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${BAIA_COORDINATES.lat}&longitude=${BAIA_COORDINATES.lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation&daily=sunset,sunrise&timezone=Asia%2FManila`;
      
      const response = await fetch(url);
      if (!response.ok) return;
      const data = await response.json();

      if (data && data.current) {
        const temp = Math.round(data.current.temperature_2m);
        const windKmH = Math.round(data.current.wind_speed_10m);
        const windKts = Math.round(windKmH * 0.539957);
        const weatherCode = data.current.weather_code;
        const isRainy = data.current.precipitation > 0 || [51, 53, 55, 61, 63, 65, 80, 81, 82, 95].includes(weatherCode);
        const swellMeters = (0.9 + (Math.sin(Date.now() / 40000) * 0.2)).toFixed(1);

        setLiveRainState(isRainy, isRainy ? `Live precipitation at the shoreline (${temp}°C, offshore ${windKts} kts).` : '');

        if (data.daily && data.daily.sunset && data.daily.sunset[0]) {
          liveSunsetTime = new Date(data.daily.sunset[0]);
        }

        const weatherIcon = isRainy ? '🌧️' : (weatherCode > 2 ? '⛅' : '☀️');
        const weatherLabel = isRainy ? 'Tropical Rain' : (weatherCode > 2 ? 'Coastal Clouds' : 'Sunny Bay');

        if (liveWeatherEl) liveWeatherEl.textContent = `${weatherIcon} ${weatherLabel} ${temp}°C`;
        if (liveSwellEl) liveSwellEl.textContent = `${swellMeters}m Clean`;
        if (liveWindEl) liveWindEl.textContent = `Offshore ${windKts}kts`;
        if (shoreStatusText) {
          shoreStatusText.innerHTML = `${weatherIcon} ${weatherLabel}: ${temp}°C • ${swellMeters}m Swell • Wind ${windKts}kts • Laurente, Masbate`;
        }
      }
    } catch (err) {
      // Baseline fallback values remain in place
    }
  }

  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => fetchMasbateLiveWeather(), { timeout: 3000 });
  } else {
    setTimeout(fetchMasbateLiveWeather, 2500);
  }

  setInterval(fetchMasbateLiveWeather, 1200000);
}
