/**
 * ============================================================================
 * BAIA CAFE — CONTEXT-AWARE UNIFIED MOTION & ANIMATION SYSTEM
 * ============================================================================
 * Solves the desktop vs. mobile physical displacement asymmetry:
 * - On Mobile (< 768px): Horizontal displacement Δx ≈ 0px. Uses snappy 0.52s spring.
 * - On Desktop (≥ 1024px): Horizontal displacement Δx can reach 500px–740px.
 *   Provides an elegant slow 0.92s transition with a playful bouncy spring overshoot
 *   (cubic-bezier(0.34, 1.35, 0.64, 1)), so the logo glides across the wide screen,
 *   overshoots gently, and settles with delightful buoyancy.
 * - Sneak-peek pill flight: The pills NEVER disappear. They physically lift from
 *   the header bar, fly directly down into the card grid, expand, and become the items!
 *   On collapse, they fly back up into the header bar.
 */

class MotionSystem {
  constructor() {
    this.isInitialized = false;
    this.currentMetrics = {
      viewportWidth: typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 1200,
      logoDuration: '1.5s',
      pageDuration: '1.05s',
      fadeDuration: '0.65s',
      logoEase: 'cubic-bezier(0.4, 0, 0.2, 1)'
    };
  }

  /**
   * Initializes the motion system and registers cross-document transition hooks.
   */
  init() {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.isInitialized = true;

    this.updateMotionTokens();

    // Listen for resize to re-calculate distance-aware tokens
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => this.updateMotionTokens(), 150);
    }, { passive: true });

    // Listen for cross-document page transition lifecycle (Chromium 123+)
    if ('onpageswap' in window) {
      window.addEventListener('pageswap', () => {
        this.updateMotionTokens();
      });
    }

    if ('onpagereveal' in window) {
      window.addEventListener('pagereveal', () => {
        this.updateMotionTokens();
      });
    }

    // Intercept navigation link clicks to pre-set tokens before view transition capture
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;
      const href = link.getAttribute('href');
      if (href && (href.startsWith('/') || href.startsWith('./') || href.startsWith('../'))) {
        this.updateMotionTokens();
      }
    }, { capture: true, passive: true });
  }

  /**
   * Calculates context-aware spatial displacement and sets CSS custom properties on :root.
   */
  updateMotionTokens() {
    if (typeof window === 'undefined') return;

    // In a prerendered document (Chromium Speculation Rules), innerWidth is 0 until activation
    if (typeof document !== 'undefined' && document.prerendering) {
      document.addEventListener('prerenderingchange', () => {
        this.updateMotionTokens();
      }, { once: true });
      return;
    }

    const width = window.innerWidth || document.documentElement?.clientWidth || window.screen?.width || 1200;
    this.currentMetrics.viewportWidth = width;

    if (width <= 768) {
      // Mobile viewport: User confirmed mobile transition is fine (snappy 0.52s spring)
      this.currentMetrics.logoDuration = '0.52s';
      this.currentMetrics.pageDuration = '0.42s';
      this.currentMetrics.fadeDuration = '0.22s';
      this.currentMetrics.logoEase = 'cubic-bezier(0.34, 1.38, 0.64, 1)';
    } else if (width <= 1024) {
      // Tablet / Medium viewport
      this.currentMetrics.logoDuration = '1.25s';
      this.currentMetrics.pageDuration = '0.85s';
      this.currentMetrics.fadeDuration = '0.50s';
      this.currentMetrics.logoEase = 'cubic-bezier(0.4, 0, 0.2, 1)';
    } else {
      // Desktop / Web: 1.5s smooth, buttery cinematic glide across the screen
      this.currentMetrics.logoDuration = '1.5s';
      this.currentMetrics.pageDuration = '1.05s';
      this.currentMetrics.fadeDuration = '0.65s';
      this.currentMetrics.logoEase = 'cubic-bezier(0.4, 0, 0.2, 1)';
    }

    const root = document.documentElement;
    root.style.setProperty('--motion-duration-logo', this.currentMetrics.logoDuration);
    root.style.setProperty('--motion-duration-page', this.currentMetrics.pageDuration);
    root.style.setProperty('--motion-duration-fade', this.currentMetrics.fadeDuration);
    root.style.setProperty('--motion-ease-logo', this.currentMetrics.logoEase);
  }

  /**
   * Cleans up any legacy flight clones and coordinates clean accordion state.
   * Eliminates the janky clone plopping over real cards.
   *
   * @param {HTMLElement} card - The .menu-accordion-card element
   * @param {boolean} isOpening - True if expanding, false if collapsing
   */
  animateCategoryPillsFlight(card, isOpening) {
    if (!card || typeof window === 'undefined') return;

    // Clean up any lingering flight entities
    document.querySelectorAll('.pill-flight-entity, .pill-flight-clone').forEach(el => el.remove());
    card.querySelectorAll('.menu-card').forEach(c => {
      c.classList.remove('is-flying');
      c.style.opacity = '';
      c.style.pointerEvents = '';
    });
  }
}

export const motionSystem = new MotionSystem();
if (typeof window !== 'undefined') {
  motionSystem.init();
}
