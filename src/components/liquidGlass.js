/**
 * BAIA CAFE — Liquid glass (styles in src/styles/liquid-glass.css)
 *
 * Every element with .lg-glass behaves like a thick piece of clear glass.
 * No added lighting: the depth comes from the lens and the shadows.
 *
 *  1. Lens (Chromium only, html.lg-refract). Each piece gets its own SVG
 *     filter, built for its exact size and corner shape: a displacement map
 *     that pulls the page behind inward near the rim, the way a convex glass
 *     edge bends light, stronger right at the edge than further in. Red,
 *     green and blue bend by very slightly different amounts, a faint fringe
 *     like real glass. Safari can't use SVG filters in backdrop-filter, so
 *     it shows the same glass without the bend.
 *
 *  2. Press. .is-pressed swells the glass under the finger; releasing springs
 *     it back with a little overshoot (the spring easing is in the CSS).
 *
 *  3. Tone. Over the cream sections the glass deepens to a navy tint
 *     (.is-light) so its white text and the BAIA name still read; over the
 *     photo and the navy sections it stays clear. The text never changes
 *     colour.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

let defs = null;
let nextId = 0;

/** A displacement map for a rounded rectangle w×h with corner radius r. */
function lensMap(w, h, r, bezel) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const hx = w / 2;
  const hy = h / 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - hx;
      const py = y + 0.5 - hy;
      // Signed distance to the rounded-rect edge (negative inside)
      const qx = Math.abs(px) - (hx - r);
      const qy = Math.abs(py) - (hy - r);
      const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
      const inside = Math.min(Math.max(qx, qy), 0);
      const dist = -(outside + inside - r);

      // Outward normal of the nearest edge
      let nx = 0;
      let ny = 0;
      if (qx > 0 && qy > 0) {
        const len = Math.hypot(qx, qy) || 1;
        nx = (qx / len) * Math.sign(px);
        ny = (qy / len) * Math.sign(py);
      } else if (qx > qy) {
        nx = Math.sign(px);
      } else {
        ny = Math.sign(py);
      }

      // 0 in the flat middle, rising steeply to 1 at the rim
      const t = dist >= bezel ? 0 : 1 - Math.max(dist, 0) / bezel;
      const bend = t * t * (3 - 2 * t) * t;

      // Sample inward (towards the centre): a convex edge magnifies
      const i = (y * w + x) * 4;
      img.data[i] = 128 - nx * bend * 127;
      img.data[i + 1] = 128 - ny * bend * 127;
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

function svgEl(name, attrs) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** One filter: the backdrop displaced three times (R, G, B), then recombined. */
function buildFilter(id, mapUrl, strength) {
  const filter = svgEl('filter', {
    id,
    x: '0',
    y: '0',
    width: '100%',
    height: '100%',
    'color-interpolation-filters': 'sRGB'
  });
  filter.append(
    svgEl('feImage', { href: mapUrl, x: '0', y: '0', width: '100%', height: '100%', preserveAspectRatio: 'none', result: 'map' })
  );
  const channels = [
    ['r', strength, '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'],
    ['g', strength * 0.97, '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0'],
    ['b', strength * 0.94, '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0']
  ];
  for (const [ch, scale, matrix] of channels) {
    filter.append(
      svgEl('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale: String(scale), xChannelSelector: 'R', yChannelSelector: 'G', result: `d${ch}` }),
      svgEl('feColorMatrix', { in: `d${ch}`, type: 'matrix', values: matrix, result: ch })
    );
  }
  filter.append(
    svgEl('feBlend', { in: 'r', in2: 'g', mode: 'screen', result: 'rg' }),
    svgEl('feBlend', { in: 'rg', in2: 'b', mode: 'screen' })
  );
  return filter;
}

function ensureDefs() {
  if (defs) return defs;
  const svg = svgEl('svg', { width: '0', height: '0', 'aria-hidden': 'true', focusable: 'false' });
  svg.style.position = 'absolute';
  defs = svgEl('defs', {});
  svg.append(defs);
  document.body.prepend(svg);
  return defs;
}

function refract(el) {
  const id = `lg-lens-${nextId++}`;
  let lastKey = '';

  const update = () => {
    const w = Math.round(el.offsetWidth);
    const h = Math.round(el.offsetHeight);
    if (!w || !h) return;
    const radius = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, w / 2, h / 2);
    const key = `${w}x${h}r${radius}`;
    if (key === lastKey) return;
    lastKey = key;

    const bezel = Math.min(h * 0.42, w * 0.42, 22);
    const filter = buildFilter(id, lensMap(w, h, radius, bezel), Math.min(46, h * 0.8));
    ensureDefs().querySelector(`#${id}`)?.remove();
    defs.append(filter);
    el.style.setProperty('--lg-lens', `url(#${id})`);
  };

  update();
  new ResizeObserver(update).observe(el);
}

function followPress(el) {
  const press = () => { if (!REDUCED_MOTION.matches) el.classList.add('is-pressed'); };
  const release = () => el.classList.remove('is-pressed');
  el.addEventListener('pointerdown', press, { passive: true });
  el.addEventListener('pointerup', release, { passive: true });
  el.addEventListener('pointercancel', release, { passive: true });
  el.addEventListener('pointerleave', release, { passive: true });
}

const LIGHT_THEMES = /^sand/;

/** What section is under this piece? (skips the floating bars themselves) */
function themeBehind(el) {
  const r = el.getBoundingClientRect();
  const stack = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  for (const node of stack) {
    if (node.closest('.site-header, .lg-glass, .mobile-sticky-bar, dialog')) continue;
    const themed = node.closest('[data-theme]');
    if (themed) return themed.dataset.theme;
  }
  return '';
}

// Wide screens keep the header as one solid bar: its pieces don't change tone
const WIDE = window.matchMedia('(min-width: 901px)');

function followTone(pieces) {
  let frame = 0;
  const update = () => {
    frame = 0;
    for (const el of pieces) {
      if (!el.offsetWidth) continue;
      if (WIDE.matches && el.closest('.site-header')) {
        el.classList.remove('is-light');
        continue;
      }
      el.classList.toggle('is-light', LIGHT_THEMES.test(themeBehind(el)));
    }
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  WIDE.addEventListener('change', schedule);
  update();
}

export function initLiquidGlass() {
  const pieces = [...document.querySelectorAll('.lg-glass')];
  if (!pieces.length) return;

  pieces.forEach(followPress);
  followTone(pieces);

  if (document.documentElement.classList.contains('lg-refract')) {
    const refracted = new WeakSet();
    const attachRefract = () => {
      for (const el of pieces) {
        if (refracted.has(el)) continue;
        // Desktop header is a single bar; only build per-piece lenses for it below 901px
        if (WIDE.matches && el.closest('.site-header')) continue;
        refracted.add(el);
        refract(el);
      }
    };
    attachRefract();
    WIDE.addEventListener('change', attachRefract);
  }
}
