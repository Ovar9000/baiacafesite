import { showShowcaseToast } from './hero3D.js';

export function initWeatherEasterEgg() {
  const canvas = document.getElementById('weather-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let animationFrameId = null;
  let isRaining = false;
  let weatherState = 'sunny'; // 'sunny' | 'cloudy' | 'rain'

  // Canvas Sizing
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Rain Drops & Splashes Simulation
  const maxDrops = 180;
  const drops = [];
  const splashes = [];

  class Drop {
    constructor() {
      this.reset();
    }
    reset() {
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

      if (this.y > canvas.height - 20) {
        if (Math.random() > 0.4) {
          splashes.push(new Splash(this.x, canvas.height - Math.random() * 15));
        }
        this.reset();
      }
    }
    draw() {
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
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.radius * 1.8, this.radius * 0.6, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(230, 245, 255, ${Math.max(0, this.opacity)})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Populate drop pool
  for (let i = 0; i < maxDrops; i++) {
    const d = new Drop();
    d.y = Math.random() * canvas.height;
    drops.push(d);
  }

  function loop() {
    if (!isRaining) return;
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

  function setWeather(state) {
    weatherState = state;
    const statusText = document.getElementById('shore-status-text');

    if (state === 'rain') {
      isRaining = true;
      canvas.classList.add('active');
      if (!animationFrameId) loop();
      if (statusText) {
        statusText.innerHTML = `🌧️ Tropical Rain: Warm Shore Showers • 3.4ft Swell • Clean Surf Tide <span class="weather-easter-hint">Tap Weather</span>`;
      }
      showShowcaseToast('🌧️ Tropical Shore Rain Activated!', 'Warm tropical showers over the bay. Tap the weather pill to cycle back to sunshine.', '🌧️');
    } else if (state === 'cloudy') {
      isRaining = false;
      canvas.classList.remove('active');
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (statusText) {
        statusText.innerHTML = `⛅ Coastal Clouds: Gentle Breeze • 3.0ft Swell • 27°C Water <span class="weather-easter-hint">Tap Weather</span>`;
      }
      showShowcaseToast('⛅ Coastal Breeze Active', 'Overcast cool breeze by the bay shore.', '⛅');
    } else {
      isRaining = false;
      canvas.classList.remove('active');
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (statusText) {
        statusText.innerHTML = `☀️ Sunny Bay: 3.2ft Swell • 28°C Water • Offshore 8kts • High Tide 3:45 PM <span class="weather-easter-hint">Tap Weather</span>`;
      }
      showShowcaseToast('☀️ Sunny Bay Day', 'Clear tropical skies and perfect coffee weather.', '☀️');
    }
  }

  // Click on Shore Status Pill to cycle weather easter egg
  const shorePill = document.querySelector('.shore-status-pill');
  if (shorePill) {
    shorePill.addEventListener('click', () => {
      if (weatherState === 'sunny') {
        setWeather('rain');
      } else if (weatherState === 'rain') {
        setWeather('cloudy');
      } else {
        setWeather('sunny');
      }
    });
  }

  // Keyboard shortcut 'R' easter egg
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'r' || e.key === 'R') {
      if (weatherState === 'rain') {
        setWeather('sunny');
      } else {
        setWeather('rain');
      }
    }
  });
}
