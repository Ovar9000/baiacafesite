import { showShowcaseToast } from './hero3D.js';

let canvas = null;
let ctx = null;
let animationFrameId = null;
let isRainingActive = false;
const maxDrops = 180;
const drops = [];
const splashes = [];

class Drop {
  constructor() {
    this.reset();
  }
  reset() {
    if (!canvas) return;
    this.x = Math.random() * (canvas.width + 200) - 100;
    this.y = Math.random() * -canvas.height;
    this.length = 15 + Math.random() * 20;
    this.speed = 12 + Math.random() * 10;
    this.wind = -2.5;
    this.opacity = 0.25 + Math.random() * 0.45;
    this.width = 1 + Math.random() * 1.2;
  }
  update() {
    this.y += this.speed;
    this.x += this.wind;

    if (canvas && this.y > canvas.height - 20) {
      if (Math.random() > 0.4) {
        splashes.push(new Splash(this.x, canvas.height - Math.random() * 15));
      }
      this.reset();
    }
  }
  draw() {
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x + this.wind * 2, this.y + this.length);
    ctx.strokeStyle = `rgba(220, 235, 255, ${this.opacity})`;
    ctx.lineWidth = this.width;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

class Splash {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 1;
    this.maxRadius = 6 + Math.random() * 10;
    this.opacity = 0.6;
    this.speed = 0.8 + Math.random() * 0.6;
  }
  update() {
    this.radius += this.speed;
    this.opacity -= 0.035;
  }
  draw() {
    if (!ctx) return;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, this.radius * 1.8, this.radius * 0.6, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(230, 245, 255, ${Math.max(0, this.opacity)})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function loop() {
  if (!isRainingActive || !canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Update & draw drops
  drops.forEach(d => {
    d.update();
    d.draw();
  });

  // Update & draw splashes
  for (let i = splashes.length - 1; i >= 0; i--) {
    const s = splashes[i];
    s.update();
    s.draw();
    if (s.opacity <= 0 || s.radius >= s.maxRadius) {
      splashes.splice(i, 1);
    }
  }

  animationFrameId = requestAnimationFrame(loop);
}

export function initWeatherEasterEgg() {
  canvas = document.getElementById('weather-canvas');
  if (!canvas) return;

  ctx = canvas.getContext('2d');

  function resizeCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Populate drop pool
  drops.length = 0;
  for (let i = 0; i < maxDrops; i++) {
    const d = new Drop();
    d.y = Math.random() * (canvas.height || window.innerHeight);
    drops.push(d);
  }
}

// Strictly controlled by live Weather API for Laurente, San Pascual, Masbate
export function setLiveRainState(isRaining, weatherDescription = '') {
  if (!canvas) canvas = document.getElementById('weather-canvas');
  if (!canvas) return;

  if (isRaining) {
    if (!isRainingActive) {
      isRainingActive = true;
      canvas.classList.add('active');
      if (!animationFrameId) loop();
      if (weatherDescription) {
        showShowcaseToast('🌧️ Tropical Rain in Laurente, Masbate', weatherDescription, '🌧️');
      }
    }
  } else {
    isRainingActive = false;
    canvas.classList.remove('active');
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}
