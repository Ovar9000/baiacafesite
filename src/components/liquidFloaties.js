export function initLiquidFloaties() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  const floaties = document.querySelectorAll('.glass-floatie');
  if (!floaties.length) return;

  // Multi-tier mouse parallax
  window.addEventListener('mousemove', (e) => {
    const mouseX = (e.clientX / window.innerWidth - 0.5) * 40;
    const mouseY = (e.clientY / window.innerHeight - 0.5) * 40;

    floaties.forEach((floatie, idx) => {
      const speed = 0.15 + ((idx % 6) * 0.12);
      const rotate = (idx % 2 === 0 ? 1 : -1) * (mouseX * 0.15);
      floatie.style.transform = `translate(${mouseX * speed}px, ${mouseY * speed}px) rotate(${rotate}deg)`;
    });
  }, { passive: true });
}
