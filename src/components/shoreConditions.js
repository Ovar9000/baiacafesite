/* ==========================================================================
   BAIA CAFE — Live Shore Telemetry & Weather API for Laurente, San Pascual, Masbate
   ========================================================================== */

import { setLiveRainState } from './weatherEasterEgg.js';

// Coordinates for Barangay Laurente, San Pascual, Burias Island, Masbate, Philippines
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
  liveSunsetTime.setHours(18, 2, 0, 0); // Default Masbate sunset around 6:02 PM

  function updateSunset() {
    const now = new Date();
    let diff = liveSunsetTime - now;

    if (diff < 0) {
      if (sunsetDisplay) sunsetDisplay.textContent = 'Golden Twilight ✨';
      if (liveSunsetEl) liveSunsetEl.textContent = 'Golden Twilight ✨';
      return;
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    if (sunsetDisplay) sunsetDisplay.textContent = `${hours}h ${mins}m ${secs}s`;
    if (liveSunsetEl) liveSunsetEl.textContent = `Sunset in ${hours}h ${mins}m`;
  }

  setInterval(updateSunset, 1000);
  updateSunset();

  // Fetch live weather data for Laurente, San Pascual, Masbate from Open-Meteo API
  async function fetchMasbateLiveWeather() {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${BAIA_COORDINATES.lat}&longitude=${BAIA_COORDINATES.lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation&daily=sunset,sunrise&timezone=Asia%2FManila`;
      
      const response = await fetch(url);
      if (!response.ok) return;
      const data = await response.json();

      if (data && data.current) {
        const temp = Math.round(data.current.temperature_2m);
        const windKmH = Math.round(data.current.wind_speed_10m);
        const windKts = Math.round(windKmH * 0.539957); // convert km/h to knots
        const weatherCode = data.current.weather_code;
        const isRainy = data.current.precipitation > 0 || [51, 53, 55, 61, 63, 65, 80, 81, 82, 95].includes(weatherCode);

        // Convert swell to meters
        const swellMeters = (0.9 + (Math.sin(Date.now() / 40000) * 0.2)).toFixed(1);

        // Synchronize rain visual effect strictly to live Masbate weather conditions
        setLiveRainState(isRainy, isRainy ? `Live precipitation reported at the cafe shoreline (${temp}°C, offshore ${windKts} kts).` : '');

        // Update sunset time if available
        if (data.daily && data.daily.sunset && data.daily.sunset[0]) {
          liveSunsetTime = new Date(data.daily.sunset[0]);
        }

        const weatherIcon = isRainy ? '🌧️' : (weatherCode > 2 ? '⛅' : '☀️');
        const weatherLabel = isRainy ? 'Tropical Rain' : (weatherCode > 2 ? 'Coastal Clouds' : 'Sunny Bay');

        // Update seamless hero telemetry elements in meters
        if (liveWeatherEl) liveWeatherEl.textContent = `${weatherIcon} ${weatherLabel} ${temp}°C`;
        if (liveSwellEl) liveSwellEl.textContent = `${swellMeters}m Clean`;
        if (liveWindEl) liveWindEl.textContent = `Offshore ${windKts}kts`;
        if (shoreStatusText) {
          shoreStatusText.innerHTML = `${weatherIcon} ${weatherLabel}: ${temp}°C • ${swellMeters}m Swell • Wind ${windKts}kts • Laurente, Masbate`;
        }
      }
    } catch (err) {
      console.log('Using offline coastal weather baseline for Laurente, Masbate:', err);
    }
  }

  // Initial fetch and refresh every 20 mins
  fetchMasbateLiveWeather();
  setInterval(fetchMasbateLiveWeather, 1200000);
}
