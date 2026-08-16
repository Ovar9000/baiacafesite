import fs from 'fs';
import path from 'path';

const mainCssPath = path.resolve('src/styles/main.css');
const heroCssPath = path.resolve('src/styles/hero.css');

// Critical CSS chunk for above the fold
const criticalCss = `
:root {
  --electric-blue: #1F3AE0;
  --electric-blue-dark: #162BB5;
  --electric-blue-glow: rgba(31, 58, 224, 0.4);
  --deep-navy: #16255C;
  --deep-navy-dark: #0E1A45;
  --cream: #F5E9D6;
  --sand-light: #FAF4EB;
  --hot-pink: #9F1239;
  --hot-pink-bright: #E8237A;
  --golden-amber: #F5A623;
  --amber-contrast: #FFE699;
  --white: #FFFFFF;
  --text-dark: #16255C;
  --text-muted: #5A6987;
  --font-headline: 'Outfit', sans-serif;
  --font-display: 'Space Grotesk', sans-serif;
  --font-body: 'Outfit', sans-serif;
  --font-script: 'Caveat', cursive;
  --font-fun: 'Playpen Sans', cursive;
  --font-mono: 'Space Grotesk', monospace;
  --space-xs: 4px; --space-sm: 8px; --space-md: 16px; --space-lg: 24px; --space-xl: 32px; --space-2xl: 48px;
  --radius-sm: 8px; --radius-md: 14px; --radius-lg: 20px; --radius-xl: 32px; --radius-pill: 9999px;
  --shadow-sm: 0 2px 8px rgba(22, 37, 92, 0.06);
  --shadow-md: 0 8px 24px rgba(22, 37, 92, 0.1);
  --shadow-lg: 0 16px 40px rgba(22, 37, 92, 0.16);
  --shadow-xl: 0 24px 60px rgba(22, 37, 92, 0.22);
  --max-width: 1440px;
  --container-padding: 20px;
  --header-height: 80px;
  --ease-spring: cubic-bezier(0.175, 0.885, 0.32, 1.275);
  --ease-smooth: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-fast: 0.2s;
  --duration-normal: 0.35s;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; font-size: 16px; -webkit-font-smoothing: antialiased; overflow-x: hidden; max-width: 100vw; }
body { font-family: var(--font-body); background-color: var(--electric-blue); color: var(--white); line-height: 1.5; overflow-x: hidden; max-width: 100vw; position: relative; }
.container { width: 100%; max-width: var(--max-width); margin-left: auto; margin-right: auto; padding-left: var(--container-padding); padding-right: var(--container-padding); }
img { max-width: 100%; height: auto; display: block; }
svg { display: block; max-width: 100%; }
.wordmark { font-family: var(--font-display); font-weight: 900; letter-spacing: -0.04em; text-transform: uppercase; }
.script-accent { font-family: var(--font-script); font-weight: 700; font-size: 1.35em; line-height: 0.9; display: inline-block; transform: rotate(-3deg); }
.script-accent.pink { color: #ff6b9d; }
.site-header { position: fixed; top: 0; left: 0; width: 100%; height: var(--header-height); z-index: 100; background: rgba(31, 58, 224, 0.92); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(255, 255, 255, 0.14); }
.nav-container { height: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.brand-logo-link { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--white); }
.brand-logo-img { width: 42px; height: 42px; border-radius: 10px; object-fit: cover; border: 1.5px solid rgba(255,255,255,0.35); }
.brand-text-block { display: flex; flex-direction: column; }
.brand-title { font-size: 1.4rem; line-height: 1; color: var(--white); }
.brand-subtitle { font-family: var(--font-mono); font-size: 0.65rem; font-weight: 700; letter-spacing: 0.15em; color: var(--amber-contrast); text-transform: uppercase; }
.main-nav-links { display: flex; align-items: center; gap: 18px; list-style: none; }
.nav-link { color: var(--cream); text-decoration: none; font-family: var(--font-display); font-weight: 700; font-size: 0.9rem; text-transform: uppercase; padding: 6px 10px; border-radius: var(--radius-sm); }
.nav-actions { display: flex; align-items: center; gap: 10px; }
.audio-toggle-btn { background: rgba(255, 255, 255, 0.15); border: 1px solid rgba(255, 255, 255, 0.25); color: var(--white); padding: 0 14px; height: 38px; border-radius: var(--radius-pill); font-family: var(--font-display); font-weight: 800; font-size: 0.8rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.nav-phone-link { display: inline-flex; align-items: center; gap: 6px; color: var(--cream); text-decoration: none; font-family: var(--font-mono); font-size: 0.85rem; font-weight: 700; padding: 0 12px; height: 38px; border-radius: var(--radius-pill); border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(0, 0, 0, 0.15); }
.nav-cart-btn { display: inline-flex; align-items: center; gap: 8px; background: var(--golden-amber); color: var(--deep-navy); border: none; font-family: var(--font-display); font-weight: 900; font-size: 0.85rem; text-transform: uppercase; padding: 0 16px; height: 38px; border-radius: var(--radius-pill); cursor: pointer; }
.cart-count-badge { background: var(--hot-pink); color: var(--white); font-family: var(--font-mono); font-size: 0.75rem; font-weight: 900; width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; }
.hero-section { min-height: 100vh; padding-top: calc(var(--header-height) + 32px); padding-bottom: 64px; display: flex; align-items: center; position: relative; background: radial-gradient(circle at 80% 20%, #2f4eed 0%, var(--electric-blue) 70%); }
.hero-grid { display: grid; grid-template-columns: 1.15fr 0.95fr; align-items: center; gap: var(--space-xl); position: relative; z-index: 2; width: 100%; }
.hero-content { display: flex; flex-direction: column; align-items: flex-start; max-width: 640px; width: 100%; }
.hero-headline { font-family: var(--font-headline); font-weight: 900; font-size: clamp(2.4rem, 5.5vw, 4.4rem); line-height: 0.98; letter-spacing: -0.04em; text-transform: uppercase; color: var(--white); margin-bottom: var(--space-md); }
.hero-headline .headline-row { display: block; }
.hero-subtitle { font-size: 1.1rem; line-height: 1.6; color: var(--cream); margin-bottom: var(--space-lg); max-width: 520px; }
.hero-cta-group { display: flex; align-items: center; gap: var(--space-md); margin-bottom: var(--space-xl); flex-wrap: wrap; }
.btn-primary-glow { display: inline-flex; align-items: center; gap: 10px; background: var(--golden-amber); color: var(--deep-navy); font-family: var(--font-display); font-weight: 900; font-size: 1.05rem; text-transform: uppercase; text-decoration: none; padding: 16px 32px; border-radius: var(--radius-pill); box-shadow: 0 8px 24px rgba(245, 166, 35, 0.45); border: none; cursor: pointer; }
.btn-secondary-pill { display: inline-flex; align-items: center; gap: 10px; background: transparent; color: var(--white); font-family: var(--font-display); font-weight: 800; font-size: 1.05rem; text-transform: uppercase; text-decoration: none; padding: 16px 28px; border-radius: var(--radius-pill); border: 2px solid rgba(255, 255, 255, 0.35); cursor: pointer; }
.hero-trust-pill-group { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.trust-pill-highlight { background: rgba(245, 166, 35, 0.2); border: 1px solid var(--golden-amber); color: var(--amber-contrast); font-family: var(--font-mono); font-size: 0.8rem; font-weight: 800; padding: 4px 12px; border-radius: var(--radius-pill); }
.trust-pill-sub { background: rgba(255, 255, 255, 0.12); color: var(--cream); font-family: var(--font-mono); font-size: 0.775rem; font-weight: 700; padding: 4px 12px; border-radius: var(--radius-pill); }
.hero-recreation-sublink { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 0.875rem; color: var(--cream); margin-top: 14px; }
.recreation-anchor { display: inline-flex; align-items: center; min-height: 32px; padding: 4px 12px; background: rgba(245, 166, 35, 0.15); color: var(--amber-contrast); font-weight: 800; text-decoration: none; border: 1px solid var(--golden-amber); border-radius: var(--radius-pill); }
.hero-mascot-wrapper { display: flex; align-items: center; gap: 16px; background: rgba(22, 37, 92, 0.4); backdrop-filter: blur(8px); padding: 12px 20px; border-radius: var(--radius-lg); border: 1px solid rgba(255, 255, 255, 0.15); max-width: 400px; width: 100%; }
.mascot-illustration { width: 48px; height: 48px; background: var(--cream); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 2px solid var(--deep-navy); }
.hero-shore-strip { margin-top: var(--space-lg); display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 24px; background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(14px); border: 1.5px solid rgba(255, 255, 255, 0.25); border-radius: var(--radius-lg); padding: 14px 22px; width: 100%; max-width: 520px; }
.shore-strip-item { display: flex; align-items: center; gap: 8px; }
.strip-label { font-family: var(--font-mono); font-size: 0.725rem; font-weight: 800; text-transform: uppercase; color: var(--golden-amber); }
.strip-value { font-family: var(--font-body); font-weight: 800; font-size: 0.85rem; color: var(--white); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hero-visual-container { display: flex; justify-content: center; align-items: center; perspective: 1200px; position: relative; width: 100%; min-height: 480px; }
.hero-3d-card { position: relative; width: 100%; max-width: 440px; height: 480px; min-height: 480px; transform-style: preserve-3d; }
.hero-image-frame { width: 100%; height: 100%; border-radius: var(--radius-xl); overflow: hidden; position: relative; border: 4px solid var(--white); background: #0f172a; }
.hero-image-frame img { width: 100%; height: 100%; object-fit: cover; object-position: center 65%; display: block; }
.floating-order-badge { position: absolute; top: -24px; right: -24px; width: 120px; height: 120px; background: var(--golden-amber); color: var(--deep-navy); border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 3px solid var(--white); z-index: 10; cursor: pointer; }
.floating-flavor-pill { position: absolute; bottom: 24px; left: -20px; background: rgba(22, 37, 92, 0.85); backdrop-filter: blur(10px); color: var(--white); padding: 10px 18px; border-radius: var(--radius-pill); border: 2px solid rgba(255, 255, 255, 0.25); display: flex; align-items: center; gap: 8px; font-size: 0.85rem; }
.flavor-tag { background: var(--hot-pink); color: var(--white); font-family: var(--font-mono); font-size: 0.7rem; font-weight: 800; padding: 2px 8px; border-radius: var(--radius-pill); }
`;

console.log('Critical CSS generated. Characters:', criticalCss.length);
