/*
 * Shows the beach as it looks right now: picks the hero photo for the time of
 * day in Manila (sunrise, day, sunset, night) before the page paints, and
 * preloads only that one image. The photos themselves are set per daypart in
 * CSS (src/styles/hero.css, "TIME OF DAY").
 *
 * A plain blocking script in <head> rather than part of the app bundle, so the
 * right photo starts loading immediately instead of after main.js.
 */
(function () {
  // Manila is UTC+8 all year (no daylight saving)
  var hour = (Date.now() / 3600000 + 8) % 24;
  var part =
    hour >= 5 && hour < 8 ? 'sunrise' :
    hour >= 8 && hour < 16 ? 'day' :
    hour >= 16 && hour < 18.5 ? 'sunset' :
    'night';

  document.documentElement.setAttribute('data-daypart', part);

  var wide = window.matchMedia('(min-aspect-ratio: 1/1)').matches;
  var link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = '/images/hero/' + part + (wide ? '-wide' : '-portrait') + '.webp';
  link.setAttribute('fetchpriority', 'high');
  document.head.appendChild(link);
})();
