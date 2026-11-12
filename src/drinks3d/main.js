/**
 * /3d/: BAIA's two drinks in 3D (src/components/heroScene.js). The poster
 * paints first; three.js and the models load once it has, so the page is
 * never blank while they arrive.
 */
import { initHeroScene } from '../components/heroScene.js';

const start = () => requestAnimationFrame(() => requestAnimationFrame(initHeroScene));
const poster = document.querySelector('.hero-drinks img');

if (!poster || poster.complete) {
  start();
} else {
  poster.addEventListener('load', start, { once: true });
  poster.addEventListener('error', start, { once: true });
}
