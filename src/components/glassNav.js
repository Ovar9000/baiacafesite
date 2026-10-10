/**
 * Liquid-glass navigation lens (after the Lot 7 header).
 *
 * A bright glass bubble glides to the nav link for the section currently on
 * screen (scroll spy), and to the link under the pointer while hovering the
 * nav. It holds a scaled copy of the links lined up with the real ones, so
 * whatever sits under it reads enlarged, mid-glide included. The current link
 * (and its row in the phone drawer) gets aria-current="location".
 */
export function initGlassNav() {
  const nav = document.querySelector('.main-nav-wrapper');
  const list = nav?.querySelector('.main-nav-links');
  const lens = nav?.querySelector('.nav-lens');
  const track = lens?.querySelector('.lens-track');
  if (!nav || !list || !lens || !track) return;

  // Nav links paired with the section they jump to, in page order.
  const pairs = [...nav.querySelectorAll('.nav-link[href^="#"]')]
    .map((link) => [link, document.querySelector(link.getAttribute('href'))])
    .filter(([, section]) => section);
  if (!pairs.length) return;

  // The lens copy: the same list with the same classes, so it lays out
  // exactly like the real one. Links become plain spans so it holds nothing
  // focusable.
  const copy = list.cloneNode(true);
  copy.querySelectorAll('a').forEach((a) => {
    const span = document.createElement('span');
    span.className = a.className;
    span.innerHTML = a.innerHTML;
    a.replaceWith(span);
  });
  track.append(copy);

  // The phone drawer rows and bottom tabs mirror the current section too
  const drawerItems = document.querySelectorAll('.nav-drawer-item[href^="#"], .mobile-bar-tab[href^="#"]');
  const header = document.getElementById('site-header');

  nav.classList.add('has-lens');
  let current = null;
  let hovered = null;

  // Keeps its last position while hidden, so it reappears where it left
  // rather than sliding in from 0.
  const moveTo = (link) => {
    if (!link || link.offsetParent === null) {
      lens.classList.remove('is-visible');
      return;
    }
    const navBox = nav.getBoundingClientRect();
    const box = link.getBoundingClientRect();
    lens.style.setProperty('--lens-x', `${box.left - navBox.left}px`);
    lens.style.setProperty('--lens-w', `${box.width}px`);
    lens.classList.add('is-visible');
  };

  const setCurrent = (link) => {
    if (link === current) return;
    if (current) {
      current.classList.remove('is-current');
      current.removeAttribute('aria-current');
    }
    current = link;
    if (current) {
      current.classList.add('is-current');
      current.setAttribute('aria-current', 'location');
    }
    const href = current?.getAttribute('href');
    drawerItems.forEach((item) => {
      const isCurrent = item.getAttribute('href') === href;
      item.classList.toggle('is-current', isCurrent);
      if (isCurrent) item.setAttribute('aria-current', 'location');
      else item.removeAttribute('aria-current');
    });
    if (!hovered) moveTo(current);
  };

  // The current section is the last one whose top has passed a line a third
  // of the way down the screen, so in-between sections keep the previous link.
  const update = () => {
    const line = window.innerHeight * 0.33;
    let found = null;
    for (const [link, section] of pairs) {
      if (section.getBoundingClientRect().top <= line) found = link;
    }
    // The footer is shorter than the screen, so its top never reaches the
    // line: at the very bottom of the page, the last link is current.
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    if (atBottom) found = pairs[pairs.length - 1][0];
    setCurrent(found);
  };

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      update();
    });
  };

  for (const [link] of pairs) {
    link.addEventListener('pointerenter', () => {
      hovered = link;
      moveTo(link);
    });
  }
  nav.addEventListener('pointerleave', () => {
    hovered = null;
    moveTo(current);
  });

  // A soft light that follows the pointer across the glass bar (mouse and
  // trackpad only).
  const bar = header?.querySelector('.nav-container');
  if (bar && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    bar.addEventListener('pointermove', (e) => {
      const rect = bar.getBoundingClientRect();
      bar.style.setProperty('--spec-x', `${e.clientX - rect.left}px`);
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  // Re-measure when the nav reflows (web fonts arriving, window resizing).
  new ResizeObserver(() => moveTo(hovered || current)).observe(nav);
  update();
}
