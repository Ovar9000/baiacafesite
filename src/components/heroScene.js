/**
 * Hero: BAIA's iced mocha and cloud-top iced latte in 3D, side by side in
 * front of the giant BAIA, on the beach as it looks right now.
 *
 * The page paints at once: the beach photo, BAIA in huge letters, and a
 * poster of the two drinks (the scene's resting frame). Once the page is idle
 * this loads three.js and the models and fades a transparent WebGL canvas
 * (the whole hero's size) in over the poster, lined up with it. Then:
 *   - coffee beans and ice cubes burst out from behind the drinks and
 *     keep drifting around them, some behind, some close to us. The ice is
 *     liquid glass: it bends the hero behind it (the beach, the shade, the
 *     giant BAIA) through its curved edges, with a hint of rainbow
 *   - the drinks float: each rises and settles on its own slow breath,
 *     leaning a touch, its shadow tightening as it lifts. A sideways drag
 *     spins one (it carries on, then turns back to face us); a tap flicks
 *     it once round
 *   - the light: a neutral studio light keeps the drinks their true colours
 *     (glossy, cold), and a rim of light behind them takes the time of day's
 *     colour, gold at sunrise, orange at sunset, lantern-warm at night
 *   - the camera sits a little low (the drinks loom), leans as a phone tilts
 *     (its gyroscope; iPhones ask once, on the first tap in the hero; the
 *     mouse moves nothing), and as the hero scrolls away the beans and ice rise past
 *     faster than the drinks
 *
 * Reduced motion: everything stands still (beans and ice at rest). Save-Data
 * or 2G, or no WebGL: the poster stays.
 *
 * Models: public/models/hero, from `npm run hero:models`. The poster:
 * `?hero-poster` renders the drinks alone at rest, the stage's size, at 2x,
 * and marks the canvas ready (`npm run hero:poster` saves it as
 * public/images/hero-3d/drinks-{lg,sm}.webp).
 */

const MODELS = '/models/hero';

// Left to right. `turn`: which side faces us (radians). `glass`: the glass
// itself in the model, measured (base to rim height, rim radius), so both
// can be scaled to one glass size whatever Meshy made them.
const DRINKS = [
  { file: 'iced-mocha.glb', turn: 0.5, glass: { height: 1.47, rim: 0.424 }, phase: 0 },
  { file: 'cloudtop-latte.glb', turn: -0.4, glass: { height: 1.65, rim: 0.538 }, phase: 2.2 },
];

// The one glass size both are shown at
const GLASS = { height: 1.56, rim: 0.48 };

// Where the drinks stand, by the stage's shape (x, z; the floor is y = 0)
const LAYOUTS = {
  // Wide screens: side by side with air between
  row: [[-0.66, 0], [0.66, 0]],
  // Phones: close together, the latte a step in front of the mocha's shoulder
  cluster: [[-0.4, -0.4], [0.4, 0.25]],
};

// The float: how high (scene units, a glass is 1.56), one breath (seconds),
// how far it leans (radians), how long it takes to get going
const FLOAT = { lift: 0.05, seconds: 6, lean: 0.022, easeIn: 1.6 };

// The rim light behind the drinks, by time of day: colour and strength
const RIMS = {
  sunrise: { color: 0xffb064, intensity: 2.2 },
  day: { color: 0xeaf2ff, intensity: 1.6 },
  sunset: { color: 0xff8a4c, intensity: 2.4 },
  night: { color: 0xffc77a, intensity: 2.0 },
};

const FOV = 20;            // a long lens: product-shot perspective
const TILT = -0.04;        // looking up a touch: the drinks loom (radians)

// A drink spun by hand. perPixel: how far a drag turns it (radians per CSS
// px); friction: how fast a let-go spin slows (per second); below settleBelow
// (rad/s) it eases back to face us at `settle`; flick: a tap's spin, enough
// to go once round with that friction (2π × friction)
const SPIN = { perPixel: 0.012, friction: 2.4, settleBelow: 1.2, settle: 2.2, flick: 2 * Math.PI * 2.4, maxVel: 30 };

export function initHeroScene() {
  const section = document.querySelector('.hero-section');
  const stage = section?.querySelector('[data-hero-scene]');
  if (!stage) return;

  const posterMode = new URLSearchParams(location.search).has('hero-poster');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const conn = navigator.connection;
  const lite = !!(conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '')));
  if (lite && !posterMode) return;

  const start = () =>
    run(section, stage, { still: reduce || posterMode, posterMode }).catch((e) => {
      console.warn('[BAIA] hero 3D skipped:', e);
    });
  if (posterMode) return void start();
  const whenIdle = (fn) =>
    'requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 1000);
  if (document.readyState === 'complete') whenIdle(start);
  else window.addEventListener('load', () => whenIdle(start), { once: true });
}

async function run(section, stage, { still, posterMode }) {
  const [THREE, { GLTFLoader }, { MeshoptDecoder }, { RoomEnvironment }, { RoundedBoxGeometry }, { mergeVertices }] =
    await Promise.all([
      import('three'),
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/libs/meshopt_decoder.module.js'),
      import('three/addons/environments/RoomEnvironment.js'),
      import('three/addons/geometries/RoundedBoxGeometry.js'),
      import('three/addons/utils/BufferGeometryUtils.js'),
    ]);

  const canvas = document.createElement('canvas');
  canvas.className = 'hero-scene';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: posterMode,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;

  const daypart = document.documentElement.dataset.daypart in RIMS ? document.documentElement.dataset.daypart : 'day';
  const rim = RIMS[daypart];

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.8;
  pmrem.dispose();

  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(-3, 3, 5);
  const rimLeft = new THREE.DirectionalLight(rim.color, rim.intensity);
  rimLeft.position.set(-4, 2, -4);
  const rimRight = new THREE.DirectionalLight(rim.color, rim.intensity * 0.85);
  rimRight.position.set(4, 2.5, -4);
  scene.add(key, rimLeft, rimRight, new THREE.HemisphereLight(0xffffff, 0x1a2a6b, 0.4));

  // The drinks
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  // The textures packed in the models load as plain images (the site's CSP
  // allows blob: images) rather than by fetch (its connect-src doesn't)
  loader.register((parser) => {
    parser.textureLoader = new THREE.TextureLoader(parser.options.manager);
    parser.textureLoader.setCrossOrigin(parser.options.crossOrigin);
    return { name: 'baia_image_textures' };
  });
  const gltfs = await Promise.all(DRINKS.map((d) => loader.loadAsync(`${MODELS}/${d.file}`)));
  const shadowTex = makeShadowTexture(THREE);
  const world = new THREE.Group();     // drinks: rises a little as the hero scrolls away
  scene.add(world);
  const drinks = gltfs.map((gltf, i) => {
    const model = gltf.scene;
    const { glass } = DRINKS[i];
    const across = GLASS.rim / glass.rim;
    model.scale.set(across, GLASS.height / glass.height, across);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -box.min.y, -center.z);   // stand on the floor, lean about its foot
    const size = box.getSize(new THREE.Vector3());
    model.traverse((o) => {
      if (o.isMesh) o.material = glossy(THREE, o.material);
    });

    const turner = new THREE.Group();
    turner.add(model);
    turner.rotation.y = DRINKS[i].turn;

    // A soft contact shadow on the (invisible) floor
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(size.x * 2.1, size.z * 1.5),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    shadow.renderOrder = -1;

    const spot = new THREE.Group();
    spot.add(turner, shadow);
    world.add(spot);
    return { spot, turner, model, shadow, size, phase: DRINKS[i].phase, turn: DRINKS[i].turn, spin: 0, vel: 0, held: false };
  });

  // Coffee beans and liquid-glass ice, around the drinks (not in the poster).
  // The ice needs a copy of the hero behind the canvas to bend
  const backdrop = posterMode ? null : await makeBackdrop(THREE, section);
  const bits = posterMode ? null : makeBits(THREE, makeIce(THREE, RoundedBoxGeometry, mergeVertices, backdrop));
  if (bits) scene.add(bits.group);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  if (posterMode) stage.appendChild(canvas);
  else section.prepend(canvas);

  // Size, layout and framing. The camera frames the stage (where the poster
  // sits); the live canvas is the whole hero, so its view is widened to it,
  // keeping the stage exactly where it is on the page
  const base = { position: new THREE.Vector3(), target: new THREE.Vector3() };
  let layoutName = '';
  const layout = () => {
    const s = stage.getBoundingClientRect();
    const h = posterMode ? s : section.getBoundingClientRect();
    if (!s.width || !s.height) return;
    renderer.setPixelRatio(posterMode ? 2 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(Math.round(h.width), Math.round(h.height), false);
    const aspect = s.width / s.height;
    layoutName = aspect < 1.2 ? 'cluster' : 'row';
    const spots = LAYOUTS[layoutName];
    drinks.forEach((d, i) => d.spot.position.set(spots[i][0], 0, spots[i][1]));
    camera.aspect = aspect;
    frame(THREE, camera, drinks, aspect);
    if (posterMode) camera.clearViewOffset();
    else camera.setViewOffset(s.width, s.height, h.left - s.left, h.top - s.top, h.width, h.height);
    camera.updateProjectionMatrix();
    base.position.copy(camera.position);
    base.target.copy(camera.userData.target);
    if (bits) bits.place(layoutName);
    if (backdrop) backdrop.resize(renderer.getDrawingBufferSize(new THREE.Vector2()));
  };
  layout();

  // The phone's tilt, eased (-1..1 each way). Desktops: no lean at all
  const lean = { x: 0, y: 0, tx: 0, ty: 0 };
  if (!still) watchTilt(section, lean);

  // Spin a drink with a finger (or the mouse): drag sideways and it turns,
  // let go and it carries on, then settles back to face us; a tap flicks it
  // round once. Up and down stays the page's, for scrolling
  if (!still) {
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let grab = null;   // { d, id, x, lastX, lastT, moved }
    const drinkAt = (e) => {
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(drinks.map((d) => d.model), true)[0];
      return hit && drinks.find((d) => d.model === hit.object || d.model.getObjectById(hit.object.id));
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (grab || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const d = drinkAt(e);
      if (!d) return;
      grab = { d, id: e.pointerId, x: e.clientX, lastX: e.clientX, lastT: e.timeStamp, moved: false };
      d.held = true;
      d.vel = 0;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* not a live pointer */ }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!grab || e.pointerId !== grab.id) return;
      const dx = e.clientX - grab.lastX;
      const dt = Math.max(1, e.timeStamp - grab.lastT) / 1000;
      if (Math.abs(e.clientX - grab.x) > 6) grab.moved = true;
      grab.d.spin += dx * SPIN.perPixel;
      grab.d.vel = grab.d.vel * 0.6 + ((dx * SPIN.perPixel) / dt) * 0.4;
      grab.lastX = e.clientX;
      grab.lastT = e.timeStamp;
    });
    const release = (e) => {
      if (!grab || e.pointerId !== grab.id) return;
      const { d } = grab;
      d.held = false;
      if (e.type === 'pointercancel') d.vel = 0;   // the page took it (a scroll)
      else if (!grab.moved) d.vel = SPIN.flick;    // a tap: once round
      else if (e.timeStamp - grab.lastT > 80) d.vel = 0;   // held still, then let go
      d.vel = Math.max(-SPIN.maxVel, Math.min(SPIN.maxVel, d.vel));
      grab = null;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  }

  // Motion. At t = 0 the drinks are at rest: the poster's pose
  let t0 = performance.now();
  let running = false;
  let raf = 0;
  let last = 0;
  const render = (now) => {
    const t = still ? 0 : (now - t0) / 1000;
    const dt = Math.min(0.05, Math.max(0, (now - (last || now)) / 1000));
    last = now;
    drinks.forEach((d) => {
      if (d.held) return;
      // carry on spinning, slowing; then ease back round to the nearest full turn
      d.spin += d.vel * dt;
      d.vel *= Math.exp(-SPIN.friction * dt);
      if (Math.abs(d.vel) < SPIN.settleBelow) {
        const home = Math.round(d.spin / (2 * Math.PI)) * 2 * Math.PI;
        d.spin += (home - d.spin) * (1 - Math.exp(-SPIN.settle * dt));
        if (Math.abs(home - d.spin) < 1e-4) d.spin = d.vel = 0;
      }
      d.turner.rotation.y = d.turn + d.spin;
    });
    const ease = Math.min(1, t / FLOAT.easeIn);
    const amount = ease * ease * (3 - 2 * ease);
    const w = (2 * Math.PI) / FLOAT.seconds;
    drinks.forEach((d) => {
      const lift = amount * FLOAT.lift * 0.5 * (1 + Math.sin(w * t + d.phase));   // 0..lift
      d.turner.position.y = lift;
      d.turner.rotation.z = amount * FLOAT.lean * Math.sin(w * t + d.phase + 1.1);
      d.turner.rotation.x = amount * FLOAT.lean * 0.6 * Math.sin(w * t * 0.7 + d.phase);
      // the shadow tightens and fades as the glass lifts
      const k = lift / FLOAT.lift;
      d.shadow.scale.setScalar(1 - 0.12 * k);
      d.shadow.material.opacity = 1 - 0.3 * k;
    });

    // Scrolling away: the drinks rise a little, the beans faster
    let scroll = 0;
    if (!still) {
      const r = section.getBoundingClientRect();
      scroll = Math.min(1, Math.max(0, -r.top / r.height));
    }
    world.position.y = scroll * 0.35;
    if (bits) bits.update(still ? Infinity : t, scroll);

    // Lean the camera with the phone, round the drinks: tilt it and you look
    // past their sides, the beans and ice sliding by at their own depths
    lean.x += (lean.tx - lean.x) * 0.08;
    lean.y += (lean.ty - lean.y) * 0.08;
    camera.position.set(base.position.x + lean.x * 0.3, base.position.y - lean.y * 0.18, base.position.z);
    camera.lookAt(base.target);
    renderer.render(scene, camera);
  };
  const loop = (now) => {
    render(now);
    raf = running ? requestAnimationFrame(loop) : 0;
  };
  const setRunning = (on) => {
    running = on && !still;
    if (running && !raf) raf = requestAnimationFrame(loop);
  };

  new ResizeObserver(() => {
    layout();
    if (!running) render(performance.now());
  }).observe(section);

  // Shaders compile on the first frame: draw it before showing anything
  await renderer.compileAsync?.(scene, camera);
  render(t0);
  if (posterMode) {
    canvas.dataset.ready = 'true';
    return;
  }
  requestAnimationFrame(() => {
    t0 = performance.now();   // the burst starts as the canvas fades in
    section.classList.add('is-3d');
    if (still) render(t0);
    else watchVisible(section, setRunning);
  });
}

/** The models' material, made glossy and cold: a thin wet coat over it */
function glossy(THREE, m) {
  const g = new THREE.MeshPhysicalMaterial({
    map: m.map,
    normalMap: m.normalMap,
    roughnessMap: m.roughnessMap,
    roughness: m.roughness,
    metalness: 0,
    clearcoat: 0.55,
    clearcoatRoughness: 0.14,
    specularIntensity: 0.9,
    envMapIntensity: 0.85,
    side: m.side,
  });
  if (m.normalScale) g.normalScale.copy(m.normalScale);
  m.dispose();
  return g;
}

/**
 * Coffee beans and ice cubes. Each has a resting place round the drinks (for
 * wide or phone stages), bursts out to it from behind the drinks when the
 * scene arrives, then drifts and tumbles slowly there.
 */
function makeBits(THREE, ice) {
  const rand = mulberry32(7);
  const group = new THREE.Group();
  const beanGeo = beanGeometry(THREE);
  const beanMat = new THREE.MeshPhysicalMaterial({
    color: 0x4a2716, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.25, sheen: 0.3, sheenColor: 0x8a5a3a,
  });

  // Resting places: (x, y, z, size). Behind (z < 0) and round the edges; the
  // few in front stay clear of the glasses
  const BEANS = {
    row: [
      [-2.1, 1.55, -0.6, 1], [-1.65, 0.35, 0.7, 1.3], [-1.35, 2.05, -1.1, 0.9], [2.05, 1.7, -0.7, 1],
      [2.6, 1.0, -1.3, 0.8], [1.3, 2.1, -1.0, 0.9], [-0.2, 0.15, 1.5, 1.4], [0.15, 1.25, -1.6, 0.8],
      [-2.3, 2.35, 0.3, 1.1], [-0.95, -0.05, 1.2, 1.15], [-2.6, 0.1, 0.2, 1.0],
    ],
    // Phones: the drinks fill the width, so most sit in the open sky above
    // them and the sand below
    cluster: [
      [-0.55, 2.6, -0.4, 1], [0.6, 2.75, -0.6, 1], [-0.72, 2.05, 0.5, 1.1], [0.74, 2.0, 0.6, 1.1],
      [0.5, -0.4, 1.0, 1.2], [-0.05, -0.75, 1.2, 1.25], [0.8, 0.55, 1.0, 1.0], [0.3, 3.3, -1.3, 0.8],
    ],
  };
  // The ice: mostly low, in the open sand and sea below and beside the
  // drinks, never in front of a glass (it shows what's behind the canvas,
  // not the drinks); one high up, bending the giant BAIA
  const ICE = {
    row: [
      [1.7, 0.4, 0.8, 1.25], [1.0, -0.02, 1.3, 1.1], [-1.9, -0.2, 0.9, 1.15], [2.45, -0.15, 0.4, 1.0],
      [-2.55, 0.85, -1.2, 0.85], [0, 2.25, -1.5, 0.9], [2.3, 2.3, 0.4, 1.0],
    ],
    cluster: [
      [-0.45, -0.35, 0.9, 1.1], [0.2, -0.62, 0.7, 1.0], [0.95, -0.15, 0.3, 0.95], [0.05, 3.05, -1.0, 0.9],
    ],
  };

  const items = [];
  const kinds = [
    { places: BEANS, geo: beanGeo, mat: beanMat, size: 1.25, spin: 0.9 },
    { places: ICE, geo: ice.geometry, mat: ice.material, size: 1, spin: 0.45 },
  ];
  for (const kind of kinds) {
    const count = Math.max(...Object.values(kind.places).map((p) => p.length));
    for (let i = 0; i < count; i++) {
      const geo = Array.isArray(kind.geo) ? kind.geo[i % kind.geo.length] : kind.geo;
      const mesh = new THREE.Mesh(geo, kind.mat);
      group.add(mesh);
      items.push(makeItem(mesh, kind, i));
    }
  }

  function makeItem(mesh, kind, index) {
    return {
      mesh,
      kind,
      index,
      home: new THREE.Vector3(),
      from: new THREE.Vector3(),
      size: 1,
      delay: 0.15 + rand() * 0.45,
      spin: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(kind.spin),
      tumble: new THREE.Euler(rand() * 6.3, rand() * 6.3, rand() * 6.3),
      drift: rand() * 6.3,
      speed: 0.25 + rand() * 0.2,
    };
  }

  const place = (layout) => {
    items.forEach((it) => {
      const p = it.kind.places[layout][it.index];
      it.mesh.visible = !!p;
      if (!p) return;
      it.home.set(p[0], p[1], p[2]);
      it.size = p[3] * it.kind.size;
      // they burst out from behind the middle of the drinks
      it.from.set(p[0] * 0.15, 1.0, -0.6);
    });
  };

  const backOut = (x) => {
    const c = 1.4;
    return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
  };

  // t: seconds since the scene arrived (Infinity: at rest, no motion)
  const update = (t, scroll) => {
    for (const it of items) {
      if (!it.mesh.visible) continue;
      const still = t === Infinity;
      const k = still ? 1 : Math.min(1, Math.max(0, (t - it.delay) / 1.3));
      const e = backOut(k);
      it.mesh.position.lerpVectors(it.from, it.home, e);
      it.mesh.scale.setScalar(it.size * Math.min(1, k * 2.5));
      if (!still) {
        const d = t * it.speed + it.drift;
        it.mesh.position.x += Math.sin(d) * 0.05 * k;
        it.mesh.position.y += Math.sin(d * 1.3 + 1) * 0.07 * k - scroll * (1.2 - it.home.z * 0.4);
      }
      // a fast spin while flying out, then a slow tumble
      const spinT = still ? 0 : t + (1 - k) * 2.5;
      it.mesh.rotation.set(
        it.tumble.x + it.spin.x * spinT,
        it.tumble.y + it.spin.y * spinT,
        it.tumble.z + it.spin.z * spinT,
      );
    }
  };

  return { group, place, update };
}

/**
 * A copy of what sits behind the canvas (the hero's background colour, the
 * beach photo as CSS shows it, the navy shade and the giant BAIA), drawn into
 * a texture the canvas's size, for the ice to bend. Real refraction can't
 * do this: the canvas is transparent and WebGL never sees the page under it.
 * Keep the shade in step with hero.css (.hero-scrim).
 */
async function makeBackdrop(THREE, section) {
  const photo = section.querySelector('.hero-photo');
  const word = section.querySelector('.hero-backword');
  const url = photo && /url\(["']?(.*?)["']?\)/.exec(getComputedStyle(photo).backgroundImage)?.[1];
  const img = url ? await loadImage(url).catch(() => null) : null;
  await document.fonts?.ready;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  const uniforms = {
    uBackdrop: { value: texture },
    uBackdropRes: { value: new THREE.Vector2(1, 1) },
  };

  const draw = () => {
    const box = section.getBoundingClientRect();
    const W = box.width;
    const H = box.height;
    if (!W || !H) return;
    const k = Math.min(1, 1400 / W);    // it's blurred and bent: no need for more
    const cw = Math.round(W * k);
    const ch = Math.round(H * k);
    // A new size needs new GPU storage, not an update in place
    if (canvas.width && (cw !== canvas.width || ch !== canvas.height)) texture.dispose();
    canvas.width = cw;
    canvas.height = ch;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = getComputedStyle(section).backgroundColor;
    ctx.fillRect(0, 0, W, H);

    // The photo: background-size cover at its background-position, scaled
    // about its middle and blurred as the CSS does
    if (img) {
      const cs = getComputedStyle(photo);
      const fit = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      const dw = img.naturalWidth * fit;
      const dh = img.naturalHeight * fit;
      const [px, py] = cs.backgroundPosition.split(' ').map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : 0.5));
      const zoom = cs.transform && cs.transform !== 'none' ? new DOMMatrix(cs.transform).a : 1;
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-W / 2, -H / 2);
      if ('filter' in ctx && cs.filter !== 'none') {
        ctx.filter = cs.filter.replace(/blur\(([\d.]+)px\)/, (_, r) => `blur(${r * k}px)`);
      }
      ctx.drawImage(img, (W - dw) * px, (H - dh) * py, dw, dh);
      ctx.restore();
    }

    // The shade (hero.css .hero-scrim)
    ctx.save();
    ctx.translate(W / 2, H);
    ctx.scale(1.2 * W, 0.7 * H);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    glow.addColorStop(0, 'rgba(14, 26, 69, 0.55)');
    glow.addColorStop(0.7, 'rgba(14, 26, 69, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-1, -2, 2, 2);
    ctx.restore();
    const fade = ctx.createLinearGradient(0, 0, 0, H);
    fade.addColorStop(0, 'rgba(14, 26, 69, 0.28)');
    fade.addColorStop(0.45, 'rgba(14, 26, 69, 0.12)');
    fade.addColorStop(1, 'rgba(14, 26, 69, 0.4)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, W, H);

    // The giant BAIA, where it stands on the page
    if (word) {
      const cs = getComputedStyle(word);
      const r = word.getBoundingClientRect();
      ctx.save();
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = cs.letterSpacing;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = cs.color;
      const m = ctx.measureText(word.textContent);
      const cy = r.top - box.top + r.height / 2;
      ctx.fillText(word.textContent, r.left - box.left + r.width / 2, cy + (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2);
      ctx.restore();
    }
    texture.needsUpdate = true;
  };

  let timer = 0;
  return {
    uniforms,
    // The canvas's size in device pixels; redraws (settled) after a resize
    resize(size) {
      uniforms.uBackdropRes.value.copy(size);
      clearTimeout(timer);
      if (!canvas.width) draw();
      else timer = setTimeout(draw, 150);
    },
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Liquid-glass ice: a slightly lumpy rounded cube. The faces show the hero
 * behind it (the backdrop texture, at this pixel), bent sideways by the
 * surface (most at the curved edges, like a lens), the three colours bent a
 * little differently (a hint of rainbow), cooled a touch, with a frosty glow
 * where it turns away from us. Reflections and highlights go on top.
 */
function makeIce(THREE, RoundedBoxGeometry, mergeVertices, backdrop) {
  // A few different cubes, so no two look stamped from one mould
  const geometry = [11, 23, 37, 51].map((seed) => iceShape(THREE, RoundedBoxGeometry, mergeVertices, seed));

  const material = new THREE.MeshPhysicalMaterial({
    color: 0x000000,          // no body colour: what it shows is the backdrop
    roughness: 0.05,
    metalness: 0,
    ior: 1.31,
    specularIntensity: 1,
    envMapIntensity: 0.06,    // the studio's grey room would grey the faces over; the rim and glints draw the shape
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, backdrop.uniforms);
    // The cube's middle on screen (0..1 across the canvas), for the lens
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec2 vIceCenter;\nvarying vec3 vIcePos;\nvarying vec2 vIceCore;\nvoid main() {')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 iceMid = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
        vec4 iceCenter = projectionMatrix * iceMid;
        vIceCenter = iceCenter.xy / iceCenter.w * 0.5 + 0.5;
        // where on the cube (-1..1), and how far from its middle as we see it
        vIcePos = transformed / 0.135;
        vIceCore = ( mvPosition.xy - iceMid.xy ) / ( length( modelMatrix[ 0 ].xyz ) * 0.135 );`);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform sampler2D uBackdrop;\nuniform vec2 uBackdropRes;\nvarying vec2 vIceCenter;\nvarying vec3 vIcePos;\nvarying vec2 vIceCore;\nvoid main() {')
      .replace('#include <colorspace_fragment>', `{
        vec3 n = normalize( normal );
        float edge = 1.0 - clamp( n.z, 0.0, 1.0 );
        // ice is never a perfect mirror: a gentle melt-wobble in the surface
        n.xy += 0.12 * vec2(
          sin( vIcePos.y * 5.1 + vIcePos.z * 2.3 ) * sin( vIcePos.x * 3.7 ),
          sin( vIcePos.x * 4.6 - vIcePos.z * 2.9 ) * sin( vIcePos.y * 3.3 + 1.0 ) );
        vec2 uv = gl_FragCoord.xy / uBackdropRes;
        // a solid block of ice flips what's behind it upside down and shrinks
        // it, like a thick lens; that flip is what makes it read as ice
        uv = vIceCenter - ( uv - vIceCenter ) * 0.6;
        // and the rounded edges throw it further out
        vec2 bend = -n.xy * 0.14 * edge * edge;
        bend.x *= uBackdropRes.y / uBackdropRes.x;
        vec3 seen = vec3(
          texture2D( uBackdrop, uv + bend * 0.97 ).r,
          texture2D( uBackdrop, uv + bend ).g,
          texture2D( uBackdrop, uv + bend * 1.035 ).b );
        // deeper in, a glacier-blue tint and a cloudy white heart (the frozen
        // air), streaky rather than even
        float core = 1.0 - smoothstep( 0.1, 0.95, length( vIceCore ) );
        float cloud = 0.55 + 0.45 * sin( vIcePos.x * 5.0 + 2.0 * sin( vIcePos.y * 4.0 ) ) * sin( vIcePos.z * 4.5 + vIcePos.y * 2.0 );
        seen *= mix( vec3( 1.0 ), vec3( 0.88, 0.96, 1.05 ), core );
        seen = mix( seen, vec3( 0.8, 0.88, 0.95 ), 0.035 * core * cloud );
        // a bright rim right at the silhouette
        seen += vec3( 0.9, 0.95, 1.0 ) * 0.45 * pow( edge, 7.0 );
        gl_FragColor = vec4( seen + gl_FragColor.rgb, 1.0 );
      }
      #include <colorspace_fragment>`);
  };
  return { geometry, material };
}

/**
 * One ice cube, irregular the way real ones are: out of a tray (a little
 * narrower at the top, not quite square), edges softened unevenly by melting,
 * a corner chipped off flat, a shallow dip on top. 0.27 across.
 */
function iceShape(THREE, RoundedBoxGeometry, mergeVertices, seed) {
  const rand = mulberry32(seed);
  const between = (a, b) => a + rand() * (b - a);
  let geo = new RoundedBoxGeometry(1, 1, 1, 8, between(0.07, 0.13));
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);

  const w = between(0.92, 1.08);
  const h = between(0.82, 0.97);
  const d = between(0.9, 1.05);
  const taper = between(0.08, 0.16);
  const lean = between(-0.05, 0.05);
  // the melt: slow waves across the faces, a different set for each cube
  const waves = Array.from({ length: 3 }, () => ({
    f: [between(2, 5), between(2, 5), between(2, 5)],
    p: between(0, 6.3),
    a: between(0.015, 0.035),
  }));
  // the chip: a plane across one corner
  const chip = new THREE.Vector3(rand() < 0.5 ? -1 : 1, rand() < 0.5 ? -1 : 1, rand() < 0.5 ? -1 : 1).normalize();
  const chipAt = between(0.66, 0.74);
  const dip = between(0.02, 0.05);

  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const over = v.dot(chip) - chipAt;
    if (over > 0) v.addScaledVector(chip, -over * 0.92);
    let melt = 1;
    for (const wv of waves) melt += wv.a * Math.sin(v.x * wv.f[0] + wv.p) * Math.sin(v.y * wv.f[1] - v.z * wv.f[2] + wv.p * 0.7);
    const up = v.y + 0.5;                        // 0 at the bottom, 1 at the top
    const narrow = 1 - taper * up;
    let y = v.y * h;
    if (v.y > 0.42) y -= dip * Math.max(0, 1 - (v.x * v.x + v.z * v.z) * 4);
    pos.setXYZ(i, (v.x * narrow * w + lean * up) * melt * 0.27, y * melt * 0.27, v.z * narrow * d * melt * 0.27);
  }
  geo.computeVertexNormals();
  return geo;
}

/** A roasted coffee bean: a squashed egg with the crease down its flat side */
function beanGeometry(THREE) {
  const geo = new THREE.SphereGeometry(1, 28, 20);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // flatten the front (+z), keep the back round
    if (v.z > 0) v.z *= 0.55;
    // the crease: a narrow S-shaped groove down the flat face
    const centre = 0.12 * Math.sin(v.y * 2.4);
    const d = Math.abs(v.x - centre);
    if (v.z > 0 && d < 0.2) v.z -= 0.32 * (1 - d / 0.2) ** 2;
    pos.setXYZ(i, v.x * 0.07, v.y * 0.095, v.z * 0.06);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Small seeded random numbers, so the beans land in the same places */
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Put the camera where the drinks fill the stage: a touch low, far enough
 * back for both glasses (and the float) to fit with a little air.
 */
function frame(THREE, camera, drinks, aspect) {
  const box = new THREE.Box3();
  for (const d of drinks) {
    const r = Math.max(d.size.x, d.size.z) / 2;
    box.expandByPoint(new THREE.Vector3(d.spot.position.x - r, 0, d.spot.position.z - r));
    box.expandByPoint(new THREE.Vector3(d.spot.position.x + r, d.size.y + FLOAT.lift, d.spot.position.z + r));
  }
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const tanV = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const fitH = (size.y * 1.08) / 2 / tanV;
  const fitW = (size.x * 1.06) / 2 / (tanV * aspect);
  const dist = Math.max(fitH, fitW) + size.z / 2;
  const target = new THREE.Vector3(center.x, center.y, center.z);
  camera.position.set(target.x, target.y + Math.sin(TILT) * dist, target.z + Math.cos(TILT) * dist);
  camera.lookAt(target);
  camera.userData.target = target;
}

/** A soft round shadow, darkest in the middle */
function makeShadowTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(6, 12, 40, 0.6)');
  grad.addColorStop(0.45, 'rgba(6, 12, 40, 0.3)');
  grad.addColorStop(1, 'rgba(6, 12, 40, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Pause while the hero is off screen or the tab is hidden */
/**
 * The phone's tilt, as -1..1 left/right (`tx`) and up/down (`ty`), measured
 * from however the phone is being held: that rest pose drifts along behind
 * it over a few seconds, so lying in bed or standing up both start centred
 * and a tilt always reads as a tilt. ±18° is the full lean. Landscape swaps
 * the axes. iPhones only send motion after asking: if none has come, the
 * first tap in the hero (not on a link or button) asks, once.
 */
function watchTilt(section, lean) {
  if (typeof DeviceOrientationEvent === 'undefined') return;
  if (!window.matchMedia('(pointer: coarse)').matches) return;
  const FULL = 18;
  let rest = null;
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  const onTilt = (e) => {
    if (e.beta == null || e.gamma == null) return;
    const angle = (screen.orientation?.angle ?? window.orientation ?? 0) % 360;
    // side to side and towards/away, as the viewer sees the screen
    let x = e.gamma;
    let y = e.beta;
    if (angle === 90 || angle === -270) { x = e.beta; y = -e.gamma; }
    else if (angle === 270 || angle === -90) { x = -e.beta; y = e.gamma; }
    else if (angle === 180 || angle === -180) { x = -e.gamma; y = -e.beta; }
    if (!rest) rest = { x, y };
    rest.x += (x - rest.x) * 0.012;
    rest.y += (y - rest.y) * 0.012;
    lean.tx = clamp((x - rest.x) / FULL);
    lean.ty = clamp((y - rest.y) / FULL);
  };
  // Android sends motion straight away; an iPhone sends nothing until asked
  window.addEventListener('deviceorientation', onTilt);
  if (typeof DeviceOrientationEvent.requestPermission !== 'function') return;
  const ask = (e) => {
    if (rest) { section.removeEventListener('click', ask); return; }   // already moving
    if (e.target.closest?.('a, button, input, select, textarea, label')) return;
    section.removeEventListener('click', ask);
    DeviceOrientationEvent.requestPermission().catch(() => {});
  };
  section.addEventListener('click', ask);
}

function watchVisible(el, onChange) {
  let inView = true;
  const report = () => onChange(inView && document.visibilityState === 'visible');
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    report();
  }).observe(el);
  document.addEventListener('visibilitychange', report);
  report();
}
