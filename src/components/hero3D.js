import VanillaTilt from 'vanilla-tilt';

export function initHero3D() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const heroCard = document.querySelector('.hero-3d-card');

  if (heroCard && !prefersReducedMotion) {
    VanillaTilt.init(heroCard, {
      max: 10,
      speed: 400,
      glare: false,
      perspective: 1200,
      scale: 1.02
    });
  }

  // Floating Badge Click -> scrolls to Menu
  const orderBadge = document.querySelector('.floating-order-badge');
  if (orderBadge) {
    orderBadge.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // Surfer Mascot Click Interaction -> Smooth scroll to About & Story section
  const mascot = document.querySelector('.hero-mascot-wrapper');
  if (mascot) {
    const handleMascotAction = (e) => {
      e.preventDefault();
      const storySec = document.getElementById('story') || document.getElementById('about');
      if (storySec) {
        storySec.scrollIntoView({ behavior: 'smooth' });
      }
      showShowcaseToast('🏄‍♂️ Coffee by the Bay', 'Fresh brews & free guest skimboards right on the sand!', '🌊');
    };

    mascot.addEventListener('click', handleMascotAction);
    mascot.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        handleMascotAction(e);
      }
    });
  }
}

export function showShowcaseToast(title, message, icon = '✓') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast-item';
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <div class="toast-icon" aria-hidden="true">${icon}</div>
    <div class="toast-content">
      <h4>${title}</h4>
      <p>${message}</p>
    </div>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(12px)';
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}
