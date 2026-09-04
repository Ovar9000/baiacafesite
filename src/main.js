import './styles/main.css';
import { motionSystem } from './utils/motionSystem.js';
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

function initHeroLoyaltyCta() {
  const ctaText = document.getElementById('hero-loyalty-cta-text');
  if (!ctaText) return;

  try {
    const hasAuth = Object.keys(localStorage).some(
      (k) => k.includes('auth-token') || k.startsWith('sb-')
    );
    if (hasAuth) {
      ctaText.textContent = 'View Loyalty Card';
    }
  } catch (e) {}
}

function handleRootAuthCallback() {
  if (
    window.location.search.includes('code=') ||
    window.location.hash.includes('access_token=') ||
    window.location.hash.includes('error=')
  ) {
    window.location.replace('/card/' + window.location.search + window.location.hash);
  }
}

function initLoyaltyPrefetch() {
  const cardLinks = document.querySelectorAll('a[href*="/card"]');
  let prefetched = false;

  const prefetchCard = () => {
    if (prefetched) return;
    prefetched = true;
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = '/card/';
    document.head.appendChild(link);
  };

  // Trigger prefetch immediately so first-time click is already warm
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    prefetchCard();
  } else {
    window.addEventListener('DOMContentLoaded', prefetchCard, { once: true });
  }

  cardLinks.forEach(link => {
    link.addEventListener('mouseenter', prefetchCard, { passive: true });
    link.addEventListener('touchstart', prefetchCard, { passive: true });
  });
}

function initApp() {
  const safeInit = (name, fn) => {
    try {
      fn();
    } catch (e) {
      console.warn(`[BAIA] Error initializing ${name}:`, e);
    }
  };

  safeInit('rootAuth', handleRootAuthCallback);
  safeInit('heroLoyaltyCta', initHeroLoyaltyCta);
  safeInit('loyaltyPrefetch', initLoyaltyPrefetch);
  safeInit('hero3D', initHero3D);
  safeInit('newDrops', initNewDrops);
  safeInit('menuExplorer', initMenuExplorer);
  safeInit('boardsRental', initBoardsRental);
  safeInit('cartDrawer', initCartDrawer);
  safeInit('seasonalPromos', initSeasonalPromosToggle);
  safeInit('polaroidWall', initPolaroidWall);

  // Defer non-critical ambient features to idle time
  const initAmbientFeatures = () => {
    safeInit('bayVibesAudio', initBayVibesAudio);
    safeInit('shoreConditions', initShoreConditions);
    safeInit('liquidFloaties', initLiquidFloaties);
    safeInit('weatherEasterEgg', initWeatherEasterEgg);
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
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

/**
 * Interactive Lightbox for Wall of Supporters Polaroid Gallery
 */
function initPolaroidWall() {
  const modal = document.getElementById('polaroid-modal');
  const closeBtn = document.getElementById('polaroid-modal-close');
  const modalImg = document.getElementById('polaroid-modal-img');
  const modalQuote = document.getElementById('polaroid-modal-quote');
  const modalAuthor = document.getElementById('polaroid-modal-author');
  const modalMeta = document.getElementById('polaroid-modal-meta');
  const modalFbBtn = document.getElementById('polaroid-modal-fb-btn');
  const cards = document.querySelectorAll('.mosaic-photo-card, .polaroid-card');

  if (!modal || !cards.length) return;

  const openModal = (card) => {
    const photo = card.dataset.photo || card.querySelector('img')?.src;
    const quote = card.dataset.quote || card.querySelector('.polaroid-quote')?.textContent?.trim();
    const author = card.dataset.author || card.querySelector('.polaroid-author-name')?.textContent?.trim();
    const meta = card.dataset.meta || card.querySelector('.polaroid-author-meta')?.textContent?.trim();
    const permalink = card.dataset.permalink || 'https://www.facebook.com/thebaiacafe';

    if (modalImg && photo) {
      modalImg.src = photo;
      modalImg.alt = author ? `Customer moment by ${author}` : 'Community photo';
    }
    if (modalQuote) modalQuote.textContent = quote ? `"${quote.replace(/^["']|["']$/g, '')}"` : '';
    if (modalAuthor) modalAuthor.textContent = author || 'BAIA Cafe Guest';
    if (modalMeta) modalMeta.textContent = meta || 'Shared Community Moment';
    if (modalFbBtn) modalFbBtn.href = permalink;

    modal.classList.add('is-active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };

  const closeModal = () => {
    modal.classList.remove('is-active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  cards.forEach((card) => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      openModal(card);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openModal(card);
      }
    });
  });

  closeBtn?.addEventListener('click', closeModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-active')) {
      closeModal();
    }
  });
}

