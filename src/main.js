import './styles/main.css';
import { initHero3D } from './components/hero3D.js';
import { initMenuExplorer } from './components/menuExplorer.js';
import { initBoardsRental } from './components/boardsRental.js';
import { initBayVibesAudio } from './components/bayVibesAudio.js';
import { initShoreConditions } from './components/shoreConditions.js';
import { initLiquidFloaties } from './components/liquidFloaties.js';
import { initWeatherEasterEgg } from './components/weatherEasterEgg.js';
import { initCartDrawer } from './components/cartDrawer.js';
import { injectSpeedInsights } from '@vercel/speed-insights';

// Initialize Vercel Speed Insights
injectSpeedInsights();

document.addEventListener('DOMContentLoaded', () => {
  // Initialize showcase modules
  initHero3D();
  initMenuExplorer();
  initBoardsRental();
  initBayVibesAudio();
  initShoreConditions();
  initLiquidFloaties();
  initWeatherEasterEgg();
  initCartDrawer();

  // Scroll Header Glassmorphism Effect
  const header = document.getElementById('site-header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 30) {
      header?.classList.add('scrolled');
    } else {
      header?.classList.remove('scrolled');
    }
  }, { passive: true });

  // Update Sunset Countdown to 5:58 PM Daily
  function updateSunsetCountdown() {
    const display = document.getElementById('sunset-countdown-display');
    if (!display) return;

    const now = new Date();
    const sunset = new Date();
    sunset.setHours(17, 58, 0, 0);

    let diff = sunset.getTime() - now.getTime();
    if (diff < 0) {
      // Sunset passed for today, set to tomorrow's sunset
      sunset.setDate(sunset.getDate() + 1);
      diff = sunset.getTime() - now.getTime();
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    display.textContent = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  updateSunsetCountdown();
  setInterval(updateSunsetCountdown, 1000);
});
