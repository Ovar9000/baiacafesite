import VanillaTilt from 'vanilla-tilt';

// 4 Curated Aesthetic Showcase Slots (Rotates deterministically every 6 hours by Manila Time)
const HERO_SHOWCASE_ITEMS = [
  {
    slot: 0,
    timeWindow: '12 AM – 6 AM • Shore Dawn',
    badge: 'House Special',
    title: 'Iced Hazelnut Latte & Skimboard',
    img: './images/Baia%20skimboard%20and%20coffee.webp',
    alt: 'BAIA Iced Hazelnut Latte and custom branded skimboard on the beach sand at Laurente shore',
    tagColor: 'var(--hot-pink)'
  },
  {
    slot: 1,
    timeWindow: '6 AM – 12 PM • Morning Brew',
    badge: 'Signature Brew',
    title: 'Bohol Asin Tibuok Sea Salt Latte',
    img: './images/classiccafe.webp',
    alt: 'BAIA Bohol Asin Tibuok Sea Salt artisan latte on the beach',
    tagColor: '#D97706'
  },
  {
    slot: 2,
    timeWindow: '12 PM – 6 PM • Beachside Grill',
    badge: 'Beachside Grill',
    title: 'Double Smash Burger & Crisp Fries',
    img: './images/smashburger.webp',
    alt: 'BAIA freshly seared double smash burger on brioche bun',
    tagColor: '#EF4444'
  },
  {
    slot: 3,
    timeWindow: '6 PM – 12 AM • Golden Sunset',
    badge: 'Sunset Refresher',
    title: 'Shore Hibiscus Berry Refresher',
    img: './images/Hibiscus%20berry%20refresher.webp',
    alt: 'BAIA iced hibiscus berry iced refresher beverage',
    tagColor: '#8B5CF6'
  }
];

function getManila6HourSlotIndex() {
  try {
    const manilaHour = parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        hour: 'numeric',
        hour12: false
      }).format(new Date()),
      10
    );
    // 00:00 - 05:59 -> Slot 0
    // 06:00 - 11:59 -> Slot 1
    // 12:00 - 17:59 -> Slot 2
    // 18:00 - 23:59 -> Slot 3
    return Math.min(3, Math.max(0, Math.floor(manilaHour / 6)));
  } catch (e) {
    return Math.floor(Date.now() / 21600000) % 4;
  }
}

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

  // Automatic 6-Hour Showcase Rotation (Locked to system time — no manual user overriding)
  const showcaseImg = document.getElementById('hero-showcase-img');
  const flavorPill = document.getElementById('hero-flavor-pill');
  const flavorBadge = document.getElementById('hero-flavor-badge');
  const flavorTitle = document.getElementById('hero-flavor-title');

  let activeIndex = getManila6HourSlotIndex();

  function applySlot(idx, animate = false) {
    const item = HERO_SHOWCASE_ITEMS[idx];
    if (!item || !showcaseImg) return;
    activeIndex = idx;

    if (animate) {
      showcaseImg.classList.add('showcase-fading');
      if (flavorPill) flavorPill.classList.add('pill-fading');

      setTimeout(() => {
        showcaseImg.src = item.img;
        showcaseImg.alt = item.alt;
        if (flavorBadge) {
          flavorBadge.textContent = item.badge;
          if (item.tagColor) flavorBadge.style.background = item.tagColor;
        }
        if (flavorTitle) {
          flavorTitle.textContent = item.title;
        }
        showcaseImg.classList.remove('showcase-fading');
        if (flavorPill) flavorPill.classList.remove('pill-fading');
      }, 250);
    } else {
      showcaseImg.src = item.img;
      showcaseImg.alt = item.alt;
      if (flavorBadge) {
        flavorBadge.textContent = item.badge;
        if (item.tagColor) flavorBadge.style.background = item.tagColor;
      }
      if (flavorTitle) {
        flavorTitle.textContent = item.title;
      }
    }
  }

  // Apply initial 6-hour slot on load
  applySlot(activeIndex, false);

  // Periodic check: if 6-hour boundary changes while page remains open, crossfade to next feature
  setInterval(() => {
    const currentSlot = getManila6HourSlotIndex();
    if (currentSlot !== activeIndex) {
      applySlot(currentSlot, true);
    }
  }, 10 * 60 * 1000);

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
