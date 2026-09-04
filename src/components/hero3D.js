import VanillaTilt from 'vanilla-tilt';
import { supabase } from '../lib/supabaseClient.js';

// 4 Curated Aesthetic Showcase Slots (Rotates deterministically every 6 hours by Manila Time)
// Default curated fallbacks:
const DEFAULT_SHOWCASE_ITEMS = [
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

let showcaseSlots = [...DEFAULT_SHOWCASE_ITEMS];

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
    const item = showcaseSlots[idx] || DEFAULT_SHOWCASE_ITEMS[idx];
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

  // 1. Apply initial 6-hour slot on load with curated beach defaults
  applySlot(activeIndex, false);

  // 2. Hydrate showcase slots with time-appropriate food/drink items from Supabase
  // The Hero card is strictly a food & drink showcase by time-of-day:
  // - Morning (6 AM – 12 PM): Coffee / Morning Brew
  // - Afternoon (12 PM – 6 PM): Burgers / Beachside Grill
  // - Golden Sunset (6 PM – 12 AM): Refreshers & Coolers
  // - Shore Dawn (12 AM – 6 AM): House Special Coffee & Skimboard
  // Announcements, advisories, and website launch posts belong in the New Drops section, never the hero food showcase.
  async function hydrateHeroFromSupabase() {
    try {
      // A. Check for optional dedicated 'showcase' table in Supabase
      const { data: customShowcase, error: showcaseErr } = await supabase
        .from('showcase')
        .select('*')
        .order('slot', { ascending: true });

      if (!showcaseErr && customShowcase && customShowcase.length > 0) {
        customShowcase.forEach(item => {
          const slotIdx = item.slot ?? item.slot_index;
          if (slotIdx >= 0 && slotIdx < 4 && item.image_url) {
            showcaseSlots[slotIdx] = {
              slot: slotIdx,
              timeWindow: DEFAULT_SHOWCASE_ITEMS[slotIdx].timeWindow,
              badge: item.badge || DEFAULT_SHOWCASE_ITEMS[slotIdx].badge,
              title: item.title || DEFAULT_SHOWCASE_ITEMS[slotIdx].title,
              img: item.image_url,
              alt: `BAIA Cafe — ${item.title}: ${item.description || DEFAULT_SHOWCASE_ITEMS[slotIdx].alt}`,
              tagColor: item.tag_color || DEFAULT_SHOWCASE_ITEMS[slotIdx].tagColor
            };
          }
        });
        applySlot(getManila6HourSlotIndex(), true);
        return;
      }

      // B. Intelligent Food/Drink matching from public.drops
      const { data: drops, error: dropsErr } = await supabase
        .from('drops')
        .select('id, title, description, badge, image_url, category')
        .neq('category', 'event') // Strictly exclude events, advisories, and launches
        .not('image_url', 'is', null)
        .order('published_at', { ascending: false })
        .limit(20);

      if (!dropsErr && drops && drops.length > 0) {
        const validFoodDrinks = drops.filter(d => 
          d.image_url && 
          d.image_url.startsWith('http') && 
          !String(d.id).startsWith('fb_post_') &&
          !/\b(advisory|closure|launch|website|contest|giveaway|winner|hours|weather)\b/i.test(d.title)
        );

        // Slot 1: Morning Coffee / Brew (6 AM – 12 PM)
        const latestCoffee = validFoodDrinks.find(d => 
          d.category === 'drink' && 
          /\b(coffee|latte|brew|espresso|bean|cappuccino|americano|mocha)\b/i.test(d.title + ' ' + (d.description || ''))
        );
        if (latestCoffee) {
          showcaseSlots[1] = {
            slot: 1,
            timeWindow: DEFAULT_SHOWCASE_ITEMS[1].timeWindow,
            badge: latestCoffee.badge || 'Morning Brew',
            title: latestCoffee.title,
            img: latestCoffee.image_url,
            alt: `BAIA Cafe — ${latestCoffee.title}`,
            tagColor: DEFAULT_SHOWCASE_ITEMS[1].tagColor
          };
        }

        // Slot 2: Afternoon Burger / Grill (12 PM – 6 PM)
        const latestBurger = validFoodDrinks.find(d => 
          d.category === 'food' && 
          /\b(burger|smash|patty|grill|sandwich)\b/i.test(d.title + ' ' + (d.description || ''))
        );
        if (latestBurger) {
          showcaseSlots[2] = {
            slot: 2,
            timeWindow: DEFAULT_SHOWCASE_ITEMS[2].timeWindow,
            badge: latestBurger.badge || 'Beachside Grill',
            title: latestBurger.title,
            img: latestBurger.image_url,
            alt: `BAIA Cafe — ${latestBurger.title}`,
            tagColor: DEFAULT_SHOWCASE_ITEMS[2].tagColor
          };
        }

        // Slot 3: Sunset Refresher / Cooler (6 PM – 12 AM)
        const latestRefresher = validFoodDrinks.find(d => 
          d.category === 'drink' && 
          /\b(refresher|berry|hibiscus|tea|cooler|fruit|lemonade|citrus)\b/i.test(d.title + ' ' + (d.description || ''))
        );
        if (latestRefresher) {
          showcaseSlots[3] = {
            slot: 3,
            timeWindow: DEFAULT_SHOWCASE_ITEMS[3].timeWindow,
            badge: latestRefresher.badge || 'Sunset Refresher',
            title: latestRefresher.title,
            img: latestRefresher.image_url,
            alt: `BAIA Cafe — ${latestRefresher.title}`,
            tagColor: DEFAULT_SHOWCASE_ITEMS[3].tagColor
          };
        }

        // Smoothly re-apply current time-of-day slot
        applySlot(getManila6HourSlotIndex(), true);
      }
    } catch (e) {
      // Graceful fallback to curated beach defaults
    }
  }

  hydrateHeroFromSupabase();

  // 3. Periodic check: if 6-hour boundary changes while page remains open, crossfade to next feature
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
      showShowcaseToast('Coffee by the Bay', 'Fresh brews and free guest skimboards right on the sand.', '✓');
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
