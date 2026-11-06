/**
 * Hero: BAIA's iced mocha and cloud-top iced latte in 3D, side by side in
 * front of the giant BAIA, on the beach as it looks right now.
 *
 * The page paints at once: the beach photo, BAIA in huge letters, and a
 * poster of the two drinks (the scene's resting frame). Once the page is idle
 * this loads three.js and the models and fades a transparent WebGL canvas
 * (the whole hero's size) in over the poster, lined up with it. Then:
 *   - coffee beans burst out from behind the drinks and keep
 *     drifting around them, some behind, some close to us
 *   - the drinks float: each rises and settles on its own slow breath,
 *     leaning a touch, its shadow tightening as it lifts
 *   - the light: a neutral studio light keeps the drinks their true colours
 *     (glossy, cold), and a rim of light behind them takes the time of day's
 *     colour, gold at sunrise, orange at sunset, lantern-warm at night
 *   - the camera sits a little low (the drinks loom), leans with the pointer
 *     on desktops, and as the hero scrolls away the beans rise past
 *     faster than the drinks
 *
 * Reduced motion: everything stands still (beans at rest). Save-Data
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
  const [THREE, { GLTFLoader }, { MeshoptDecoder }, { RoomEnvironment }] = await Promise.all([
    import('three'),
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/libs/meshopt_decoder.module.js'),
    import('three/addons/environments/RoomEnvironment.js'),
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
    return { spot, turner, shadow, size, phase: DRINKS[i].phase };
  });

  // Coffee beans, around the drinks (not in the poster)
  const bits = posterMode ? null : makeBits(THREE);
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
  };
  layout();

  // The pointer, eased (desktop only: -1..1 across the hero)
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  if (!still && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    section.addEventListener('pointermove', (e) => {
      const r = section.getBoundingClientRect();
      pointer.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
    });
    section.addEventListener('pointerleave', () => { pointer.tx = 0; pointer.ty = 0; });
  }

  // Motion. At t = 0 the drinks are at rest: the poster's pose
  let t0 = performance.now();
  let running = false;
  let raf = 0;
  const render = (now) => {
    const t = still ? 0 : (now - t0) / 1000;
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

    // Lean the camera with the pointer, round the drinks
    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;
    camera.position.set(base.position.x + pointer.x * 0.22, base.position.y - pointer.y * 0.12, base.position.z);
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
 * Coffee beans. Each has a resting place round the drinks (for wide or phone
 * stages), bursts out to it from behind the drinks when the scene arrives,
 * then drifts and tumbles slowly there.
 *
 * (Ice cubes were tried and dropped: on a transparent canvas real refraction
 * can't see the photo behind it, so they read as frosted blocks.)
 */
function makeBits(THREE) {
  const rand = mulberry32(7);
  const group = new THREE.Group();
  const beanGeo = beanGeometry(THREE);
  const beanMat = new THREE.MeshPhysicalMaterial({
    color: 0x4a2716, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.25, sheen: 0.3, sheenColor: 0x8a5a3a,
  });

  // Resting places: (x, y, z, size). Behind (z < 0) and round the edges; the
  // few in front stay clear of the glasses
  const PLACES = {
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

  const items = [];
  const maxCount = Math.max(...Object.values(PLACES).map((p) => p.length));
  for (let i = 0; i < maxCount; i++) {
    const mesh = new THREE.Mesh(beanGeo, beanMat);
    group.add(mesh);
    items.push({
      mesh,
      home: new THREE.Vector3(),
      from: new THREE.Vector3(),
      size: 1,
      delay: 0.15 + rand() * 0.45,
      spin: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.9),
      tumble: new THREE.Euler(rand() * 6.3, rand() * 6.3, rand() * 6.3),
      drift: rand() * 6.3,
      speed: 0.25 + rand() * 0.2,
    });
  }

  const place = (layout) => {
    const spots = PLACES[layout];
    items.forEach((it, i) => {
      const p = spots[i];
      it.mesh.visible = !!p;
      if (!p) return;
      it.home.set(p[0], p[1], p[2]);
      it.size = p[3] * 1.25;
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
