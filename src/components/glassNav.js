/**
 * Liquid-glass navigation highlight.
 *
 * A glass pill slides under the nav link for the section currently on screen
 * (scroll spy), and follows the pointer while hovering the nav. The current
 * link also gets aria-current="location" for assistive tech.
 */
export function initGlassNav() {
  const nav = document.querySelector('.main-nav-wrapper');
  const pill = nav?.querySelector('.nav-glass-indicator');
  if (!nav || !pill) return;

  // Nav links paired with the section they jump to, in page order.
  const pairs = [...nav.querySelectorAll('.nav-link[href^="#"]')]
    .map((link) => [link, document.querySelector(link.getAttribute('href'))])
    .filter(([, section]) => section);
  if (!pairs.length) return;

  nav.classList.add('has-glass-pill');
  let current = null;
  let hovered = null;

  const moveTo = (link) => {
    if (!link || link.offsetParent === null) {
      pill.classList.remove('is-visible');
      return;
    }
    const navBox = nav.getBoundingClientRect();
    const box = link.getBoundingClientRect();
    pill.style.setProperty('--pill-x', `${box.left - navBox.left}px`);
    pill.style.setProperty('--pill-w', `${box.width}px`);
    pill.style.setProperty('--pill-h', `${box.height}px`);
    pill.classList.add('is-visible');
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
    link.addEventListener('mouseenter', () => {
      hovered = link;
      moveTo(link);
    });
  }
  nav.addEventListener('mouseleave', () => {
    hovered = null;
    moveTo(current);
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => moveTo(hovered || current), { passive: true });
  // Link widths change once the web fonts arrive.
  document.fonts?.ready?.then(() => moveTo(hovered || current));
  update();
}
