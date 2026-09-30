// Smart 24-hour scroll restoration:
// First-time or hero-viewing users start snug at top (0, 0); repeat browsing within 24h restores position.
try {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (!window.location.hash) {
    const raw = localStorage.getItem('baia_scroll_pos');
    if (raw) {
      const data = JSON.parse(raw);
      if (Date.now() - (data.time || 0) < 86400000 && data.y > 150) {
        window.scrollTo(0, data.y);
      } else {
        window.scrollTo(0, 0);
      }
    } else {
      window.scrollTo(0, 0);
    }
  }
} catch (_) {
  window.scrollTo(0, 0);
}
