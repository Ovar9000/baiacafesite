import { initHero3D } from './components/hero3D.js';
import { initMenuExplorer } from './components/menuExplorer.js';
import { initBoardsRental } from './components/boardsRental.js';
import { initBayVibesAudio } from './components/bayVibesAudio.js';
import { initShoreConditions } from './components/shoreConditions.js';
import { initLiquidFloaties } from './components/liquidFloaties.js';
import { initWeatherEasterEgg } from './components/weatherEasterEgg.js';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize showcase modules
  initHero3D();
  initMenuExplorer();
  initBoardsRental();
  initBayVibesAudio();
  initShoreConditions();
  initLiquidFloaties();
  initWeatherEasterEgg();

  // Scroll Header Glassmorphism Effect
  const header = document.getElementById('site-header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 30) {
      header?.classList.add('scrolled');
    } else {
      header?.classList.remove('scrolled');
    }
  });
});
