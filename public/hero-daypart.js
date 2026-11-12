/*
 * Shows the beach as it looks right now: picks the photo for the time of day
 * in Manila (sunrise, day, sunset, night) before the page paints, and preloads
 * it. Used by the homepage's hero and by /3d/ (<html data-hero-3d>), which
 * also preloads its drinks poster.
 */
(function () {
  // Manila is UTC+8 all year (no daylight saving)
  var hour = (Date.now() / 3600000 + 8) % 24;
  var part =
    hour >= 5 && hour < 8 ? 'sunrise' :
    hour >= 8 && hour < 16 ? 'day' :
    hour >= 16 && hour < 18.5 ? 'sunset' :
    'night';

  var root = document.documentElement;
  root.setAttribute('data-daypart', part);

  var wide = window.matchMedia('(min-aspect-ratio: 1/1)').matches;
  var photoUrl = '/images/hero/' + part + (wide ? '-wide' : '-portrait') + '.webp';

  function preload(href) {
    var link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = href;
    link.setAttribute('fetchpriority', 'high');
    document.head.appendChild(link);
  }

  preload(photoUrl);

  if (!root.hasAttribute('data-hero-3d')) return;

  var small = window.matchMedia('(max-width: 640px)').matches;
  preload('/images/hero-3d/drinks-' + (small ? 'sm' : 'lg') + '.webp');

  // Keep a live Image handle so heroScene's ice backdrop reuses it without re-fetching
  var img = new Image();
  img.decoding = 'async';
  img.src = photoUrl;
  window.__heroPhoto = img;
})();
