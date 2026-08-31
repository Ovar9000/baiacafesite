import './styles/main.css';
import { initHero3D } from './components/hero3D.js';
import { initMenuExplorer } from './components/menuExplorer.js';
import { initBoardsRental } from './components/boardsRental.js';
import { initBayVibesAudio } from './components/bayVibesAudio.js';
import { initShoreConditions } from './components/shoreConditions.js';
import { initLiquidFloaties } from './components/liquidFloaties.js';
import { initWeatherEasterEgg } from './components/weatherEasterEgg.js';
import { initCartDrawer } from './components/cartDrawer.js';
import { initNewDrops } from './components/newDrops.js';
import { injectSpeedInsights } from '@vercel/speed-insights';
import { inject } from '@vercel/analytics';

// Initialize Vercel Speed Insights
injectSpeedInsights();

// Initialize Vercel Web Analytics
inject();

/**
 * ============================================================================
 * PROMOS & SEASONAL EVENTS TOGGLE
 * ============================================================================
 * Set SHOW_PROMOS_SECTION = true to activate and display the seasonal events
 * & holiday promotions section on the landing page.
 * When false (default), the section remains completely hidden with zero layout impact.
 */
export const SHOW_PROMOS_SECTION = false;

function initSeasonalPromosToggle() {
  const section = document.getElementById('seasonal-events');
  if (!section) return;
  if (SHOW_PROMOS_SECTION) {
    section.hidden = false;
    section.classList.remove('is-hidden');
  } else {
    section.hidden = true;
    section.classList.add('is-hidden');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Initialize primary interactive modules
  initHero3D();
  initNewDrops();
  initMenuExplorer();
  initBoardsRental();
  initCartDrawer();
  initSeasonalPromosToggle();

  // Defer non-critical ambient features to idle time
  const initAmbientFeatures = () => {
    initBayVibesAudio();
    initShoreConditions();
    initLiquidFloaties();
    initWeatherEasterEgg();
  };

  if ('requestIdleCallback' in window) {
    requestIdleCallback(initAmbientFeatures, { timeout: 2000 });
  } else {
    setTimeout(initAmbientFeatures, 1000);
  }

  // Scroll Header Glassmorphism Effect
  const header = document.getElementById('site-header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 30) {
      header?.classList.add('scrolled');
    } else {
      header?.classList.remove('scrolled');
    }
  }, { passive: true });

  // Scroll-Aware Mobile Sticky Order Bar (IntersectionObserver on Hero Section)
  function initScrollAwareStickyBar() {
    const stickyBar = document.getElementById('mobile-sticky-bar');
    const heroSection = document.getElementById('hero') || document.querySelector('.hero-section');
    if (!stickyBar || !heroSection) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        // Hide sticky bar when hero is visible in viewport
        if (entry.isIntersecting) {
          const rect = heroSection.getBoundingClientRect();
          // If top of hero is near top of viewport, hide bar
          if (rect.top >= -80) {
            stickyBar.classList.remove('is-visible');
          }
        } else {
          // Show once user has scrolled past the hero section
          const rect = heroSection.getBoundingClientRect();
          if (rect.bottom < 150) {
            stickyBar.classList.add('is-visible');
          } else {
            stickyBar.classList.remove('is-visible');
          }
        }
      });
    }, {
      root: null,
      threshold: [0, 0.1, 0.5, 1.0]
    });

    observer.observe(heroSection);

    // Fast scroll fallback listener
    window.addEventListener('scroll', () => {
      const rect = heroSection.getBoundingClientRect();
      if (rect.bottom < 100) {
        stickyBar.classList.add('is-visible');
      } else {
        stickyBar.classList.remove('is-visible');
      }
    }, { passive: true });
  }

  initScrollAwareStickyBar();
});
