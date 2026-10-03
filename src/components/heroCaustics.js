/**
 * Hero Shore Foam — a cel-shaded, anime-style view down into calm shallows.
 *
 * Everything is computed per pixel in one fragment shader (no video, no images
 * besides a tiny shadow mask rasterised from the live DOM):
 *
 *  1. Foam tension network: rounded foam cells joined by webbed junctions, with
 *     a flat offset shadow on the sand. Cells drift and breathe slowly, like
 *     windless water just off the beach; the sheet thickens toward the shore.
 *  2. Floating headline: the tagline and photo card cast a crisp cel shadow on
 *     the seabed, gently wobbled by the water, so they read as floating.
 *  3. A soft lip of foam resting on the waterline at the bottom edge.
 */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uRes;          // canvas size in device px
uniform float uScale;       // device px per CSS px
uniform vec2 uHero;         // hero size in CSS px
uniform float uTime;
uniform float uUnit;        // CSS px per foam cell
uniform sampler2D uMask;
uniform vec2 uShadowOff;    // CSS px, sun from upper-left

vec2 hash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

float hash1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash1(i), hash1(i + vec2(1.0, 0.0)), u.x),
             mix(hash1(i + vec2(0.0, 1.0)), hash1(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Each foam cell's centre wanders on its own slow orbit: calm, windless water.
vec2 cellPoint(vec2 c) {
  vec2 h = hash2(c);
  return 0.5 + 0.44 * sin(uTime * (0.12 + 0.09 * h.yx) + 6.2831 * h);
}

// Each cell also carries its own "pressure" (an additive weight, Apollonius
// style). Borders between unequal cells curve, so fuller bubbles bulge into
// their neighbours and the smaller ones dent inward: foam under surface
// tension, not a tiling of convex polygons. Pressures breathe slowly, so cells
// swell, yield and sometimes pinch away entirely.
float pressure(vec2 c) {
  vec2 h = hash2(c + 17.3);
  return 0.2 * h.x * (0.75 + 0.25 * sin(uTime * (0.1 + 0.08 * h.y) + 6.2831 * h.y));
}

// Approximate distance to the nearest (curved) cell border. Neighbouring
// borders are combined with an exponential smooth-min, so every junction fills
// with a concave web of foam: the cel-shaded caustic look.
float foamNet(vec2 x) {
  const float k = 0.05;
  vec2 n = floor(x), f = fract(x);
  vec2 mg = vec2(0.0);
  float d1 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      float d = length(g + cellPoint(n + g) - f) - pressure(n + g);
      if (d < d1) { d1 = d; mg = g; }
    }
  }
  float acc = 0.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      if (i == 0 && j == 0) continue;
      vec2 g = mg + vec2(float(i), float(j));
      float d = length(g + cellPoint(n + g) - f) - pressure(n + g);
      acc += exp(-0.5 * (d - d1) / k);
    }
  }
  return -k * log(acc);
}

// Slow, drifting noise warp: bean and kidney shapes, wavy borders.
vec2 warp(vec2 p) {
  float t = uTime;
  vec2 n = vec2(vnoise2(p * 0.9 + vec2(0.0, t * 0.04)),
                vnoise2(p * 0.9 + vec2(5.2, 1.3) - vec2(t * 0.035, 0.0))) - 0.5;
  n += 0.5 * (vec2(vnoise2(p * 2.1 + vec2(9.1, t * 0.06)),
                   vnoise2(p * 2.1 + vec2(3.7, 2.9) - vec2(0.0, t * 0.05))) - 0.5);
  return p + 0.5 * n;
}

vec3 floorColor(vec2 uv) {
  // Mirrors the brand hero gradient: radial(120% 80% at 75% 40%).
  float d = length((uv - vec2(0.75, 0.4)) / vec2(1.2, 0.8));
  vec3 c0 = vec3(0.161, 0.286, 1.0);
  vec3 c1 = vec3(0.118, 0.290, 1.0);
  vec3 c2 = vec3(0.082, 0.169, 0.710);
  vec3 c = d < 0.6 ? mix(c0, c1, d / 0.6) : mix(c1, c2, clamp((d - 0.6) / 0.4, 0.0, 1.0));
  // Shallower toward the shore: a breath of turquoise near the bottom.
  return mix(c, vec3(0.13, 0.43, 1.0), 0.25 * smoothstep(0.5, 1.0, uv.y));
}

float maskAt(vec2 css) { return texture2D(uMask, css / uHero).r; }
float shadowAt(vec2 c) {
  float r = 6.0;
  return 0.2 * maskAt(c) + 0.2 * (maskAt(c + vec2(r, 0.0)) + maskAt(c - vec2(r, 0.0)) +
                                  maskAt(c + vec2(0.0, r)) + maskAt(c - vec2(0.0, r)));
}

// Sparse bubbles clinging to the foam: little hollow rings, like inked dots.
// Returns (ring, hole) coverage.
vec2 bubble(vec2 q, float aa) {
  vec2 bp = q * 3.2;
  vec2 bi = floor(bp), bf = fract(bp);
  vec2 h = hash2(bi + 7.3);
  if (h.x > 0.35) return vec2(0.0);
  vec2 c = 0.3 + 0.4 * hash2(bi + 1.9);
  float r = 0.13 + 0.1 * h.y;
  float d = length(bf - c);
  float e = aa * 3.2;
  float disc = 1.0 - smoothstep(r - e, r + e, d);
  float hole = 1.0 - smoothstep(r * 0.62 - e, r * 0.62 + e, d);
  return vec2(disc - hole, hole);
}

void main() {
  vec2 css = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uScale;
  vec2 uv = css / uHero;
  float t = uTime;

  // 0 out on open water, 1 at the shoreline (bottom): foam tension gathers there.
  float shore = smoothstep(0.2, 1.0, uv.y);
  float aa = 1.1 / (uScale * uUnit);
  float fromB = uHero.y - css.y;
  float px = 1.0 / uScale;
  // Right at the waterline the strands swell and fuse into the resting lip.
  float lipZone = 1.0 - smoothstep(0.0, 70.0, fromB);
  float w = mix(0.012, 0.04, shore) + 0.12 * lipZone * lipZone;

  // Gentle shoreward drift of the whole sheet.
  vec2 p = css / uUnit - vec2(0.0, t * 0.012);
  vec2 q = warp(p);
  float b = foamNet(q);
  // The same sheet, shifted: its cel shadow on the sand below.
  float bs = foamNet(warp(p - uShadowOff * 0.45 / uUnit));

  // Hand-drawn feel: strands swell and pinch along their length, and their
  // edges are scalloped by the bubbles they are made of.
  w *= 0.6 + 0.75 * vnoise2(q * 1.7 + 4.0);
  w += (0.006 + 0.012 * shore) * (vnoise2(q * 11.0 + t * 0.03) - 0.5);
  w = max(w, 0.006);
  float strand = 1.0 - smoothstep(w - aa, w + aa, b);
  // Thick foam near the shore is full of tiny pinhole bubbles (drawn in
  // unwarped space so they stay round).
  vec2 hp = p * 9.0;
  vec2 hc = floor(hp);
  vec2 hh = hash2(hc + 2.7);
  float pin = step(hh.x, 0.45) * (1.0 - smoothstep(0.1 + 0.08 * hh.y - aa * 9.0, 0.1 + 0.08 * hh.y + aa * 9.0,
              length(fract(hp) - 0.3 - 0.4 * hash2(hc + 8.1))));
  pin *= smoothstep(0.035, 0.07, w - b) * shore;
  float strandShadow = 1.0 - smoothstep(w + 0.008 - aa, w + 0.008 + aa, bs);

  vec3 base = floorColor(uv);
  vec3 deep = base * vec3(0.5, 0.56, 0.76);
  vec3 foamC = mix(base, vec3(0.86, 0.92, 1.0), mix(0.4, 0.84, shore));

  vec3 col = base;
  col = mix(col, deep, strandShadow * mix(0.4, 0.75, shore));
  col = mix(col, foamC, strand);
  col = mix(col, mix(foamC, base, 0.4), pin);

  // Bubbles only where they can cling to a strand.
  float nearStrand = (1.0 - smoothstep(w * 1.5, w * 4.0, b)) * mix(0.5, 1.0, shore);
  vec2 bub = bubble(p, aa) * nearStrand;
  col = mix(col, foamC, bub.x);
  col = mix(col, mix(base, foamC, 0.25), bub.y);

  // A soft lip of foam resting on the waterline, barely breathing.
  float edge = 7.0 + 4.0 * sin(css.x / 120.0 + t * 0.3) + 2.5 * sin(css.x / 47.0 - t * 0.45)
             + 2.5 * sin(t * 0.55);
  col = mix(col, foamC, 1.0 - smoothstep(edge - px, edge + px, fromB));

  // Floating headline and card: a flat, crisp cel shadow, gently wobbled
  // by the water above it.
  vec2 wob = 2.5 * vec2(sin(css.y / 21.0 + t * 0.7), sin(css.x / 27.0 + t * 0.6));
  float ts = smoothstep(0.22, 0.52, shadowAt(css - uShadowOff + wob));
  col = mix(col, col * vec3(0.6, 0.66, 0.84), ts * 0.55);

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Caustics shader: ${log}`);
  }
  return sh;
}

const SHADOW_TEXT_SELECTOR =
  '.hero-headline .letter-chunky, .hero-headline .ampersand-chunky, .hero-headline .script-crafted-fatseed, .hero-headline .bay-chunky';

function rotationOf(transform) {
  if (!transform || transform === 'none') return 0;
  const m = transform.match(/matrix\(([^)]+)\)/);
  if (!m) return 0;
  const [a, b] = m[1].split(',').map(parseFloat);
  return Math.atan2(b, a);
}

/** Rasterise what floats on the surface (tagline + photo card) into a mask. */
function drawShadowMask(hero, ctx, scale) {
  const hr = hero.getBoundingClientRect();
  const w = Math.max(1, Math.ceil(hr.width * scale));
  const h = Math.max(1, Math.ceil(hr.height * scale));
  ctx.canvas.width = w;
  ctx.canvas.height = h;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = '#fff';

  const centreOf = (el) => {
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2 - hr.left, r.top + r.height / 2 - hr.top];
  };

  hero.querySelectorAll(SHADOW_TEXT_SELECTOR).forEach((el) => {
    const cs = getComputedStyle(el);
    const [cx, cy] = centreOf(el);
    let text = el.textContent.trim();
    if (cs.textTransform === 'uppercase') text = text.toUpperCase();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotationOf(cs.transform));
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
    const m = ctx.measureText(text);
    const asc = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent;
    const desc = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, 0, (asc - desc) / 2);
    ctx.restore();
  });

  // Doodles: soft blobs are enough once blurred.
  hero.querySelectorAll('.hero-headline .hero-doodle').forEach((el) => {
    const r = el.getBoundingClientRect();
    const [cx, cy] = centreOf(el);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r.width * 0.38, r.height * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  const frame = hero.querySelector('.hero-image-frame');
  if (frame && frame.offsetWidth) {
    const [cx, cy] = centreOf(frame);
    const fw = frame.offsetWidth, fh = frame.offsetHeight;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotationOf(getComputedStyle(frame).transform));
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-fw / 2, -fh / 2, fw, fh, 24);
    else ctx.rect(-fw / 2, -fh / 2, fw, fh);
    ctx.fill();
    ctx.restore();
  }
}

export function initHeroCaustics() {
  const hero = document.querySelector('.hero-section');
  if (!hero) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'hero-caustics';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
    preserveDrawingBuffer: false
  });
  if (!gl) return; // Brand gradient stays as the fallback.

  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  } catch (e) {
    console.warn('[BAIA] Hero caustics disabled:', e);
    return;
  }
  gl.useProgram(program);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = {};
  ['uRes', 'uScale', 'uHero', 'uTime', 'uUnit', 'uMask', 'uShadowOff']
    .forEach((name) => { u[name] = gl.getUniformLocation(program, name); });

  // Shadow mask texture (low-res; bilinear sampling + shader taps round it off).
  const maskCtx = document.createElement('canvas').getContext('2d');
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 1, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8Array([0]));
  gl.uniform1i(u.uMask, 0);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const frameInterval = 1000 / (coarse ? 30 : 60);
  let quality = 1;

  function refreshMask() {
    drawShadowMask(hero, maskCtx, 1 / 6);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, maskCtx.canvas);
  }

  function resize() {
    const rect = hero.getBoundingClientRect();
    const heroW = rect.width, heroH = rect.height;
    if (heroW < 2 || heroH < 2) return; // Hidden/collapsed; wait for a real size.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Cel edges want crisp pixels, so render close to native resolution.
    let scale = Math.min(dpr, 1.5) * quality;
    const maxPixels = 1.8e6 * quality;
    if (heroW * heroH * scale * scale > maxPixels) scale = Math.sqrt(maxPixels / (heroW * heroH));
    canvas.width = Math.max(1, Math.round(heroW * scale));
    canvas.height = Math.max(1, Math.round(heroH * scale));
    gl.viewport(0, 0, canvas.width, canvas.height);

    const minDim = Math.min(heroW, heroH);
    gl.uniform2f(u.uRes, canvas.width, canvas.height);
    gl.uniform1f(u.uScale, canvas.width / heroW);
    gl.uniform2f(u.uHero, heroW, heroH);
    gl.uniform1f(u.uUnit, Math.min(165, Math.max(80, minDim * 0.2)));
    const sun = Math.min(1, Math.max(0.6, heroW / 1280));
    gl.uniform2f(u.uShadowOff, 12 * sun, 18 * sun);
    refreshMask();
  }

  const start = performance.now();
  // Reduced motion: a single still frame.
  const STILL_TIME = 37.5;

  function draw(now, at) {
    const t = at ?? (reduceMotion.matches ? STILL_TIME : ((now - start) / 1000 + 20) % 3600);
    gl.uniform1f(u.uTime, t);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  let raf = 0, last = 0, visible = true, revealed = false;
  let slowFrames = 0, sampled = 0;

  function reveal() {
    if (revealed) return;
    revealed = true;
    hero.classList.add('has-caustics');
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = now - last;
    if (dt < frameInterval - 2) return;
    // Adaptive resolution: step down if the GPU keeps missing the budget.
    if (last && sampled < 240) {
      sampled++;
      if (dt > frameInterval * 1.6) slowFrames++;
      if (sampled % 60 === 0) {
        if (slowFrames > 30 && quality > 0.5) {
          quality *= 0.75;
          resize();
        }
        slowFrames = 0;
      }
    }
    last = now;
    draw(now);
    reveal();
  }

  function play() {
    if (raf || !visible || document.hidden) return;
    if (reduceMotion.matches) {
      draw(performance.now());
      reveal();
      return;
    }
    last = 0;
    raf = requestAnimationFrame(tick);
  }
  function pause() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  hero.prepend(canvas);
  resize();

  let resizeTimer = 0;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resize(); if (!raf) draw(performance.now()); }, 120);
  }).observe(hero);
  if (document.fonts?.ready) document.fonts.ready.then(refreshMask);
  // The showcase card animates in; settle the mask once layout is final.
  window.addEventListener('load', () => setTimeout(refreshMask, 600), { once: true });

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    visible ? play() : pause();
  }).observe(hero);
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : play()));
  reduceMotion.addEventListener?.('change', () => { pause(); play(); });

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    pause();
    hero.classList.remove('has-caustics');
  });

  if (import.meta.env.DEV) {
    window.__heroCaustics = { refreshMask, maskCanvas: maskCtx.canvas, draw: (at) => draw(performance.now(), at), pause, play };
  }

  play();
}
