import VanillaTilt from 'vanilla-tilt';

export function initHero3D() {
  const heroCard = document.querySelector('.hero-3d-card');
  if (heroCard) {
    VanillaTilt.init(heroCard, {
      max: 12,
      speed: 400,
      glare: true,
      'max-glare': 0.2,
      perspective: 1200,
      scale: 1.02
    });
  }

  // Floating Badge Click
  const orderBadge = document.querySelector('.floating-order-badge');
  if (orderBadge) {
    orderBadge.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // Surfer Mascot Click Interaction
  const mascot = document.querySelector('.hero-mascot-wrapper');
  if (mascot) {
    mascot.addEventListener('click', () => {
      showShowcaseToast('🏄‍♂️ Welcome to BAIA Cafe!', 'Catch the morning tide, grab an Asin Tibuok latte, and chill on the shore.', '🌴');
    });
  }

  // Multi-speed parallax motion across all floating constellation glyphs
  const glyphs = document.querySelectorAll('.floating-glyph');
  window.addEventListener('mousemove', (e) => {
    const mouseX = (e.clientX / window.innerWidth - 0.5) * 35;
    const mouseY = (e.clientY / window.innerHeight - 0.5) * 35;

    glyphs.forEach((glyph, index) => {
      const speed = 0.2 + ((index % 5) * 0.15);
      const rotateFactor = (index % 2 === 0 ? 1 : -1) * (mouseX * 0.2);
      glyph.style.transform = `translate(${mouseX * speed}px, ${mouseY * speed}px) rotate(${rotateFactor}deg)`;
    });
  });
}

export function showShowcaseToast(title, message, icon = '✦') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast-item';
  toast.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-content">
      <h4>${title}</h4>
      <p>${message}</p>
    </div>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}
