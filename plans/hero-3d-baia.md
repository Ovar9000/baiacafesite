# Hero: 3D BAIA letters

Branch: `design/hero-3d-baia` (from `origin/main` @ ea61004)

## The idea

The hero becomes a poster for the BAIA name. The tagline ("Coffee, Food & Good
Vibes, Crafted by the Bay") goes, and one 3D object fills the middle: the word
**BAIA** as thick, creamy 3D letters (the milk-letter look of the "baja"
poster). It turns slowly on its own and turns further when you drag or scroll.
Behind it is a flat colour backdrop with 2D shapes cut from the logo icons
(flower, palm, cup, waves) along the bottom, like the coffee-bag reference.

Style: "Kinetic Magazine, light". One photoreal 3D element with flat 2D graphics
around it. No scrapbook clutter. The page stays experience-first (see the site
direction): this is still "the place first", told through the brand.

## Decisions (settled 2026-11-05)

| Question | Choice |
|---|---|
| 3D object | The BAIA wordmark as 3D letters |
| Rotation | Pre-rendered spin: Blender renders frames, the page plays them |
| Beach photo | Time of day tints the backdrop. The photos move further down the page |
| Who models | Claude writes a Blender Python script, Mark runs it |

## Why a sway and not a full spin

A word that turns 360° reads edge-on at 90° and backwards ("AIAB") at 180°, so
half of every turn is unreadable. Instead the letters **sway between -28° and
+28°** (plus a slight tilt). That's 57 frames at 1° steps. Drag scrubs inside
that range and springs back to the front. Scrolling down turns it toward +28°
as the hero leaves. This keeps the name readable on every frame.

(The first plan said ±40° at 2° steps. In the test stills the letters at 40°
crowded behind each other and stopped reading as BAIA, so the range shrank and
the steps got finer.)

Optional extra for later: a single 360° flip, played once on first load. That
would be 4 to 6 extra frames, blurred, as a reveal.

## Time of day

The backdrop colour follows `data-daypart` (already set by
`public/hero-daypart.js`):

| Daypart | Backdrop | 2D shapes |
|---|---|---|
| sunrise (5:00–8:00) | warm peach | lighter peach |
| day (8:00–16:00) | electric blue `#1E4AFF` | lighter blue |
| sunset (16:00–18:30) | coral / amber | lighter coral |
| night (18:30–5:00) | deep navy `#0E1A45` | slate blue + a few stars |

The frames are rendered **once**, with a transparent background and a neutral
studio light, so the same frames sit on every backdrop. The cream letters work
on all four. A soft CSS contact shadow under the word changes tint with the
backdrop.

The beach photos aren't deleted. They move into About (or the Shore teaser), so
"what the beach looks like right now" is still on the page, one scroll down.
Exactly where they go is decided in Phase 5, against the whole page.

## Pipeline

```
blender/baia_letters.py   bpy script: builds the scene, renders frames
blender/fonts/            DynaPuff Bold (used); Fredoka, Titan One and others (tried); all OFL
blender/out/              raw PNG frames (gitignored)
scripts/build-hero-frames.js   sharp: PNG → WebP, phone + desktop sizes
public/images/hero-3d/    the shipped frames
src/components/heroSpin.js     canvas frame player
```

### The Blender script (`blender/baia_letters.py`)

Runs headless: `blender -b -P blender/baia_letters.py -- --preview` (3 stills)
or `-- --frames` (all 57). It renders in about 10 s a frame on the RTX 3060
(OptiX).

- **Letters:** a text object in **Fredoka Bold** (chosen over Space Grotesk,
  which looked carved rather than poured), converted to mesh, extruded deep
  (0.22), with a large rounded bevel (0.06) so the letters look soft. A
  Weighted Normal modifier keeps the flat fronts clean.
- **Material:** brand cream `#F5E9D6`, subsurface scattering (milky), roughness
  0.32, with a clearcoat for the wet gloss highlight.
- **Light:** a large soft key from the front left, a rim light behind to
  separate the edges, a low warm fill, and a dim neutral world. No HDRI, to
  keep the colour neutral.
- **Colour:** the **Standard** view transform at exposure 0.2. AgX turned the
  cream grey and putty-coloured, and these frames sit on flat brand colours,
  so true colour matters most. The lit faces measure about `#F0E9D7`.
- **Camera:** 85 mm (50 mm stretched the near letters), framed so the word
  fills about 74% of the width facing front.
- **Shadow:** none baked in. A shadow catcher would fight the tinted
  backdrops, so CSS draws it.
- **Pose:** the word's yaw runs from -28° to +28° in 1° steps, with an X tilt
  of 0.1° per degree of yaw.
- **Render:** Cycles, transparent film, 1600×800, RGBA PNG, 128 samples,
  denoised.

### Frame build (`scripts/build-hero-frames.js`)

`npm run hero:frames`

- Crops every frame to one shared box (the union of where the letters ever
  are, plus 2%), so frames line up exactly.
- `lg`: up to 1400 px wide WebP with alpha. `sm` (phones): 720 px wide.
- Writes `frame-00.webp` … `frame-56.webp` for each size, plus `manifest.json`
  (count, front frame, sizes), and prints the sizes against the budget.
- Frame 28 (front-on) doubles as the **poster**, the first paint and the LCP
  image.

### The player (`src/components/heroSpin.js`)

- Paints the poster `<img>` immediately (preloaded by `hero-daypart.js` in
  place of the beach photo). It's the LCP element, with explicit width and
  height so there's no layout shift.
- After `load` plus idle, fetches the other 40 frames (phone or desktop size
  by viewport), decodes them, then swaps the `<img>` for a `<canvas>` that
  draws frames.
- **Idle:** a slow ping-pong sway, about 6 s each way, eased.
- **Drag or swipe:** horizontal pointer movement scrubs the frames. On release
  it springs back to idle. `touch-action: pan-y` so a vertical swipe on an
  iPhone still scrolls the page.
- **Scroll:** while the hero is leaving, scroll position eases the word
  toward +28°.
- **Reduced motion:** no idle sway and no scroll turn, just the poster. Drag
  still works.
- **Off screen:** pauses through `IntersectionObserver`.
- Leaves out the frames on Save-Data or slow connections: the poster only.

## Page changes

- `index.html` hero: remove `.tagline-stack` and the doodles. New `<h1>` holds
  the poster image with `alt="BAIA"` and visually hidden text "BAIA Cafe:
  coffee, food and good vibes by the bay, Laurente Beach, Burias Island", so
  the tagline is kept for search and screen readers.
- `.hero-photo` and `.hero-scrim` are replaced by `.hero-backdrop` (daypart
  colour) and `.hero-shapes` (an inline SVG row of the logo-icon shapes).
- `src/styles/hero.css` and the critical hero CSS in `index.html`: the new
  layout, daypart tokens, the contact shadow, phone sizing (the word fills
  the width and sits slightly above centre).
- `public/hero-daypart.js`: preload the poster frame for phone or desktop
  instead of the beach photo. It still sets `data-daypart`.
- The header wordmark stays. If BAIA reads twice on load, the header text can
  fade in only after the hero scrolls past (decided in Phase 4).

## Phases (each one ends with something to look at)

1. **Setup:** install Blender (`winget install BlenderFoundation.Blender`)
   and add the font.
2. **Look development:** render 3 stills (front, -28°, +28°) at low samples.
   Mark reviews the font, bevel, depth, gloss and cream colour, and we iterate.
   *Gate: no turntable render until the stills look right.*
3. **Turntable:** render all 57 frames, then build the phone and desktop sets.
   Check the file sizes against the budget.
4. **Hero page:** markup, CSS, daypart backdrops, 2D shapes, frame player.
5. **Beach photos:** place the daypart photos in About or Shore. Review the
   whole page order against the site direction.
6. **Verify:** the preview at iPhone width and desktop, all four dayparts
   (forced through `data-daypart`), reduced motion, a vertical swipe over the
   hero on a phone, and Lighthouse (LCP and CLS no worse than now).

## Budgets

- First paint: one poster image, 60 KB or less on a phone.
- Total hero weight after idle: about 700 KB on a phone, about 1.6 MB on
  desktop, never on Save-Data.
- No new runtime dependencies (no three.js). The player is a plain canvas.

## Settled in Phase 2

- Font: Fredoka Bold (later replaced by DynaPuff Bold, see the font revision below).
- Cream only, no coffee swirl for now. A swirl variant can come later without
  touching the page, just by re-rendering.
- Depth: chunky (0.22 extrude + 0.06 bevel at letter size 1).

## Notes from Phase 4 (built 2026-11-05)

- Preview any time of day with `?daypart=sunrise|day|sunset|night` (read by
  `public/hero-daypart.js`, which also tints the phone browser bar).
- The poster is a plain `<img srcset>` with `fetchpriority="high"`, so it needs
  no JS preload. Don't add `decoding="async"` to it: that let the browser paint
  the hero without the word while the image was still decoding.
- `heroSpin.js` loads the set the browser picked for the poster (`/sm/` or
  `/lg/`), so the swap to the canvas can't jump.
- Memory: decoded frames take about 23 MB on phones (`sm`) and about 146 MB
  on desktops and tablets (`lg`). That's fine on desktop. If iPads struggle,
  give tablets the `sm` set or every other `lg` frame.
- The frames aren't in the PWA precache (default globs cover js/css/html
  only), so installing the app doesn't download them.
- The beach photos in `public/images/hero/` aren't used for now. They come
  back in Phase 5.

## Revision: the drink scene (2026-11-05)

After seeing the letters on their own, Mark wanted the poster concept in full:
the cream BAIA letters **with a coffee being poured**. The hero is now two
layers:

| Layer | Script | What it does |
|---|---|---|
| Letters (behind) | `blender/baia_letters.py` | Unchanged: the ±28° sway, so the name always reads |
| Drink (front) | `blender/baia_drink.py` | A classic **iced Spanish latte** in BAIA's faceted tumbler (Picardie-style, 12 panels). It plays a **pour intro** once, then **spins 360°** slowly and endlessly |

Decisions:
- **The drink spins, the letters sway.** A full 360° turn of the word would
  read backwards half the time. The glass, drink, ice and condensation spin;
  the pitcher, the pour, the splash and the beans stay still.
- **The pour is espresso, not milk.** That's how a classic iced Spanish latte
  is built (condensed milk, cold milk, then the shot clouding down through
  it), and a dark stream reads against the cream letters where a milk stream
  disappeared. `--pour milk` remains an option.
- **Pour intro + living loop.** The intro (36 frames, about 2.6 s) starts
  from the glass of milk, the stream falls, splashes, and the espresso blooms
  down. Its last frame is the spin's first. The spin (48 frames, one turn
  in about 26 s) moves the marbling round a closed loop in noise space, so it
  drifts and still loops seamlessly. The player blends adjacent frames, so a
  slow spin from 48 frames stays smooth.
- **No fluid simulation.** It's slow to bake and hard to keep clean; the
  scripted shader and curve animation gives the poster look and stays
  controllable.
- **The Einspänner is a later phase:** the same script with `--drink
  einspanner`. The reference is Mark's photo: the same faceted glass, milk at
  the bottom, coffee with ice, and a thick whipped-cream cap dusted with cocoa
  spilling over the rim.

How the drink is built (`blender/baia_drink.py`, units in decimetres):
- **Glass:** lathe profile, 12 flat panels on the lower part fading into a
  round band, a heavy base. Transparent-glass film, so the backdrop shows
  through the glass. Glass, ice and water cast no shadows (refractive
  caustics are off, and a shadowing glass left the drink black).
- **Drink:** one liquid layered by height in the shader: condensed milk at
  the bottom, cold milk, then espresso marbling down, warped by two noise
  fields. Espresso parts transmit light, milk parts scatter it. A "Bloom"
  value pushes the espresso out (0) or in (1) for the intro, and a "Drift"
  offset moves the noise for the loop.
- **Ice:** six rounded cubes. **Condensation:** about 420 beads on the
  panels, with a few running streaks.
- **Pitcher:** a glazed stoneware creamer, tilted 70° and turned 28° away
  from the camera, with its lip above the letters' band so the stream crosses
  the name. Its handle is a creamer's ear (a flat strap that swells where it
  joins the body), parented to the body. **Pour:** a mesh rebuilt every
  frame. It leaves the lip as a flat sheet, rounds into a thick rope (radius
  0.05 at the lip), necks as it falls (r ~ (1 + drop/0.6)^-0.25, from
  constant flow), and ripples, with the ripples growing on the way down and
  travelling with the flow (whole wavelengths per loop, so seamless). The
  intro grows it from the lip with a rounded, swelling head. Opaque glossy
  espresso: a transmissive stream shows the page's backdrop through the
  transparent film. **Splash:** a ring, a crown of droplets and a few strays,
  grown from the landing point, plus beads shaken loose from the stream.
- **Beans:** a modelled S-crease, matte roast, kept out of the letters' band.

The frames (`npm run hero:frames`) are now `letters/{lg,sm}` and (until the
video revision below) `drink/{intro,spin}/{lg,sm}`. Intro and spin share one crop. The manifest
reports where the glass and the letters' band sit in the drink frame, and the
CSS variables on `.hero-stage` take those numbers.

The posters (first paint) are letters frame 28 and drink intro frame 0
(the glass of milk waiting for the shot). With reduced motion or Save-Data,
`heroSpin.js` swaps the drink poster for the finished drink (spin frame 0),
and with Save-Data no other frames load.

## Revision: the font (2026-11-05)

**DynaPuff Bold** replaces Fredoka: puffier and more playful, like cream
piped into letters, and it reads at every sway angle. Compared side by side
with Fredoka, Titan One, Lilita One, Bagel Fat One and Baloo 2.

- The B's holes and the A's triangle had filled in. The cause was
  overlapping contours left in the static instances of variable fonts, which
  Blender's curve fill gets wrong. The B, A and I glyphs in `blender/fonts/`
  have their overlaps merged (fontTools `removeOverlaps`, with skia-pathops).
- The text curve's `offset` is set to minus the bevel, so the bevel rounds the
  edges without swelling the strokes and closing the counters. Faces with
  sharp inside corners (Lilita, Bagel, Baloo) glitch with this, which is
  part of why they lost.

## Revision: the drink as video (2026-11-05)

As 84 WebP stills, the drink came to 5.9 MB on a phone and 9.7 MB on a
desktop (budgets 3 and 6 MB), and decoded to roughly 200 MB of bitmaps on a
phone, enough to get an iPhone tab reloaded. It now ships as two H.264 videos
per size:

- `drink/intro-{sm,lg}.mp4`: the pour, 2.6 s at 30 fps, played once.
- `drink/spin-{sm,lg}.mp4`: one full turn, 26 s at 15 fps, looped.

Real alpha video (VP9 alpha, HEVC alpha) doesn't play in every browser, so
each frame is **stacked**: the picture premultiplied (on black) on top, its
alpha as grey below. `heroSpin.js` draws the video into a WebGL canvas that
puts the two halves back together. ffmpeg's `framerate` filter blends the
in-between frames, as the old canvas crossfade did; the spin's first render
is repeated at the end and cut off, so the loop is seamless.

- After idle: phone 1.3 MB (letters 0.57 + intro 0.07 + spin 0.62), desktop
  2.9 MB. Decoded memory is one video frame.
- The video size follows the drink's on-screen pixels (stage width x DPR,
  capped at 2x), not the poster's srcset pick: phones get the 640-wide video.
- The stills `drink/{intro,spin}-{sm,lg}.webp` are the first paint (the glass
  before the pour) and the finished drink for reduced motion, Save-Data, no
  WebGL, or refused autoplay (e.g. iOS Low Power Mode).
- Dropped: dragging no longer nudges the glass's spin (a video can't seek
  smoothly enough). Dragging still sways the letters.
- Not yet checked on a real iPhone: Safari playing a detached, muted,
  inline video into WebGL. If Safari pauses it, the canvas holds its frame.

## Revision: the Coco Cloud, BAIA exploded around it (2026-11-05)

The separate letters layer is gone. The hero is now a magazine-collage
poster in three layers, front to back:

1. **The drink and the letters, one render** (`blender/baia_drink.py`,
   `--drink cloud` by default). A steel frothing pitcher pours cold foam onto
   dark iced coffee in a faceted glass; the foam piles into a low cloud over
   the rim (the Coco Cloud photo). As it sets, B-A-I-A burst out of the foam,
   one after another, as chunky DynaPuff 3D letters, and land around the
   glass at different depths and tilts. During the spin they bob and sway on
   the same loop as the glass, so the two stay in sync. The Einspanner
   (cocoa-dusted cream heap on coffee over milk) and the Spanish latte are
   still there as `--drink einspanner|spanish`.
2. **The logo's cup as a flat silhouette** (`public/images/hero-cup.svg`,
   traced from the logo by `blender/trace_logo.py`), standing behind the
   glass, cream-white in every daypart (`--hero-silhouette`).
3. **BAIA again, huge and flat** (Outfit 900, `.hero-backword`), a shade
   deeper than the backdrop (`--hero-word`), running off both edges.

The flat shape band along the bottom is off for now (the back word and
silhouette carry the 2D side).

- Video: 60 fps. The intro (3.4 s) is 205 real frames; the spin (26 s) is
  390 renders blended to 60 fps by ffmpeg. `npm run hero:frames -- --src
  <dir>` builds from any render folder (drafts land in `blender/out/draft`).
- Dragging is gone entirely: the letters are in the video now.
- The anchors in `scripts/build-hero-frames.js` (glass axis, rim, base) are
  estimates from the camera; check them against the render.

## Revision: two drinks, no words (2026-11-06)

The collage didn't feel premium. Replaced with a product shot: BAIA's iced
lemon tea and Einspanner turning slowly side by side, in front of the giant
flat BAIA, and nothing else. No pour, no exploded letters, no cup silhouette,
no tagline.

- Scene: `blender/baia_duo.py` (new; `baia_drink.py` and `baia_letters.py`
  are the earlier experiments). Both drinks modelled on the user's photos:
  - Tea: tall faceted tumbler, amber tea coloured by its depth (volume
    absorption), packed with ice, two lemon wheels against the glass, a thin
    shaken-foam head, a cube over the rim, condensation.
  - Einspanner: milk at the bottom, coffee above with a soft swirled border,
    white cream pressed into the coffee against the glass, a coffee-soaked
    foam cap over the rim, a cocoa-dusted white dollop on top.
- Light cards behind each glass are seen only through the glass, so the tea
  glows instead of showing the page's backdrop through it.
- A shadow-catcher floor gives real contact shadows; its faint veil is faded
  out at the frame's edges in `scripts/build-hero-frames.js`.
- Colour: Khronos PBR Neutral (AgX greyed the coffee and pinked the tea).
- Video: one loop, 24 s at 60 fps from 240 renders (blended), stacked alpha
  as before. Output `public/images/hero-3d/duo/spin-{lg,sm}.{mp4,webp}`.
- Page: `heroSpin.js` just loops the one video. On phones the stage runs past
  the screen edges (the render has empty margins) so the drinks fill the
  width, and the back word sits higher.

## Revision: live 3D, two drinks (2026-11-06, later)

The Blender render was stopped. The user had 3D models made (Meshy) and chose
two of them: the iced mocha with whipped cream and the cloud-top iced latte.
(A strawberry soda was tried as frosted, see-through glass and dropped.)

- Hero: the two drinks live in WebGL (three.js), turning slowly side by side
  over the electric-blue backdrop, BAIA huge behind. Blue at every time of
  day now; `public/hero-daypart.js` is gone.
- Models: raw Meshy files in `models/hero/*.raw.glb` (not in git, ~40 MB
  each). `npm run hero:models` simplifies them (meshoptimizer), shrinks the
  textures to 2K/1K WebP, sets metalness to 0 (Meshy marked the drinks as
  metal), and meshopt-compresses them into `public/models/hero` (1.9 MB both).
- Poster: `npm run hero:poster` captures the scene's first frame
  (`?hero-poster`) as `public/images/hero-3d/drinks-{lg,sm}.webp`. It paints
  first and is all that Save-Data / no-WebGL visitors get; the live canvas
  fades in over it (they line up: the stage's aspect fixes the framing).
- `src/components/heroScene.js` loads three.js (177 KB gz) and the models
  only once the page is idle; it pauses off screen; reduced motion stands
  the drinks still.
- Stage: 1.45 wide on desktop (side by side), 0.82 on phones (close together,
  the latte a step in front), word raised to peek over the drinks on phones.
- `blender/` (baia_duo.py and earlier) is the abandoned render pipeline.

### Then (same day): float, one glass size, the beach photo back

- No turning. The drinks float: each rises and settles on its own 6 s
  breath (~3% of a glass), leaning a touch, its shadow tightening as it
  lifts; it eases in from the poster's rest pose. On desktops the camera
  leans a little with the pointer.
- One glass size: Meshy made the latte's glass 27% wider and 12% taller than
  the mocha's. Each glass's height and rim were measured (DRINKS[].glass in
  heroScene.js) and both are scaled to GLASS (1.56 tall, rim 0.48).
- The time-of-day beach photo is back behind everything
  (`public/hero-daypart.js`, hero.css "TIME OF DAY"), under a light navy
  shade. BAIA stays huge behind the drinks, now in cream over the photo.

### Then: more wow

- Coffee beans burst out from behind the drinks as the scene
  arrives (springy, staggered), then drift and tumble. The canvas now covers
  the whole hero so they can fly anywhere; the drinks still land where the
  poster's are (`setViewOffset`). The poster has no beans or ice.
- Glossy drinks (a clearcoat), and two rim lights behind them whose colour
  follows the time of day (warm at sunrise and sunset, cool by day, lantern
  gold at night). Neutral studio reflections, so the drinks keep their real
  colours.
- The beach photo is softly out of focus (a long-lens look), the camera sits
  a touch low looking up, and on scroll the beans rise faster than the
  drinks (parallax).

### Then: the header

- Over the hero the header shows the BAIA mark alone (the hero's giant BAIA
  is the name there); once the hero has scrolled away, "BAIA" slides out
  beside the mark (main.js sets .past-hero). The glass bar stays.
- The menu button moved to the bottom right on phones and tablets (one-hand
  use). The tab bar (Menu, What's new, My Order) stops short of it. The
  section drawer grows out of that corner as a sheet with every link in
  thumb reach, and its close button lands where the menu button sits.
- Ice cubes dropped: on a transparent canvas real refraction can't see the
  photo behind, so they read as frosted blocks.
