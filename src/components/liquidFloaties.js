/**
 * Liquid-glass floaties: collision avoidance + mouse parallax.
 *
 * Floaties sit behind section content, but behind translucent panels a
 * white glass bubble can wash out white text. Positions are percentages, so
 * whether one lands under content depends on the screen; each floatie is
 * checked against the content around it and tucked away if it overlaps.
 *
 * Parallax: the CSS bobbing animation owns each floatie's `transform`, so the
 * mouse offset uses the independent `translate` / `rotate` properties, which
 * compose with it. Updates are batched to one per animation frame.
 */

const CONTENT = [
  'h1', 'h2', 'h3', 'h4', 'p', 'a', 'button', 'img', 'input', 'li', 'dl',
  '[class*="card"]', '[class*="banner"]', '[class*="box"]', '[class*="pill"]'
].map((sel) => `.container ${sel}`).join(', ');
const CLEARANCE = 10; // px of breathing room around content

function overlaps(a, b) {
  return a.left < b.right + CLEARANCE && a.right > b.left - CLEARANCE &&
    a.top < b.bottom + CLEARANCE && a.bottom > b.top - CLEARANCE;
}

// Below this width there is no side margin to use; phones keep the CSS rule
// (first two floaties per section, faint, behind the content).
const MIN_WIDTH = 900;

const EDGE_INSET = 8; // px from the section edge when a floatie is re-seated

function tuckColliding(section) {
  const layer = section.querySelector(':scope > .section-floaties-layer');
  const floaties = layer ? [...layer.children] : [];
  if (!floaties.length) return;

  // Restore authored positions before measuring (layout may have changed).
  floaties.forEach((f) => {
    if (!('origLeft' in f.dataset)) {
      f.dataset.origLeft = f.style.left;
      f.dataset.origRight = f.style.right;
      f.dataset.origTop = f.style.top;
    }
    f.style.left = f.dataset.origLeft;
    f.style.right = f.dataset.origRight;
    f.style.top = f.dataset.origTop;
    f.classList.remove('is-tucked');
  });

  if (window.innerWidth >= MIN_WIDTH) {
    const sec = section.getBoundingClientRect();
    // Obstacles: content, plus floaties already seated (so they don't pile up).
    const obstacles = [...section.querySelectorAll(CONTENT)]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom }));
    const free = (box) => !obstacles.some((r) => overlaps(box, r));

    floaties.forEach((f) => {
      const box = f.getBoundingClientRect();
      if (box.width === 0) return;
      const size = box.width;
      const at = (x, y) => ({ left: x, right: x + size, top: y, bottom: y + size });
      let seat = free(box) ? box : null;

      if (!seat) {
        // Search along the floatie's own edge for the nearest free spot.
        const side = f.dataset.origLeft ? 'left' : 'right';
        const x = side === 'left' ? sec.left + EDGE_INSET : sec.right - EDGE_INSET - size;
        const maxY = sec.height - size - EDGE_INSET;
        const startY = Math.min(Math.max(box.top - sec.top, EDGE_INSET), maxY);
        for (let step = 0; step <= maxY && !seat; step += 16) {
          for (const y of step ? [startY - step, startY + step] : [startY]) {
            if (y < EDGE_INSET || y > maxY) continue;
            const candidate = at(x, sec.top + y);
            if (free(candidate)) {
              seat = candidate;
              f.style[side] = `${EDGE_INSET}px`;
              f.style.top = `${Math.round(y)}px`;
              break;
            }
          }
        }
      }

      if (seat) obstacles.push(seat);
      else f.classList.add('is-tucked');
    });
  }
  // Fade in only after the first check, so a colliding one never flashes.
  layer.classList.add('is-ready');
}

function initCollisionAvoidance() {
  const sections = [...document.querySelectorAll('.section-floaties-layer')].map((l) => l.parentElement);
  if (!sections.length) return;
  const pending = new Set();
  let scheduled = false;
  const schedule = (section) => {
    pending.add(section);
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      pending.forEach(tuckColliding);
      pending.clear();
    });
  };
  // Re-check whenever a section's size changes (menu expands, drops load, resize).
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver((entries) => entries.forEach((e) => schedule(e.target)));
    sections.forEach((s) => ro.observe(s));
  }
  sections.forEach(schedule);
  document.fonts?.ready?.then(() => sections.forEach(schedule));
}

function initParallax() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasMouse = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (prefersReducedMotion || !hasMouse) return;

  const floaties = document.querySelectorAll('.glass-floatie');
  if (!floaties.length) return;

  let pending = null;
  const apply = () => {
    const { x, y } = pending;
    pending = null;
    floaties.forEach((floatie, idx) => {
      const depth = 0.15 + (idx % 6) * 0.12;
      const tilt = (idx % 2 === 0 ? 1 : -1) * x * 0.15;
      floatie.style.translate = `${(x * depth).toFixed(1)}px ${(y * depth).toFixed(1)}px`;
      floatie.style.rotate = `${tilt.toFixed(1)}deg`;
    });
  };

  window.addEventListener('mousemove', (e) => {
    const first = pending === null;
    pending = {
      x: (e.clientX / window.innerWidth - 0.5) * 40,
      y: (e.clientY / window.innerHeight - 0.5) * 40
    };
    if (first) requestAnimationFrame(apply);
  }, { passive: true });
}

export function initLiquidFloaties() {
  initCollisionAvoidance();
  initParallax();
}
