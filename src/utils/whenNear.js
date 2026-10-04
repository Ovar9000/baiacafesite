/**
 * Run `fn` once, when `el` scrolls within `margin` of the viewport.
 * Used to delay network-heavy work (e.g. the Supabase client) until the
 * visitor is actually heading toward the section that needs it.
 */
export function whenNear(el, fn, margin = '800px') {
  if (!el || typeof IntersectionObserver === 'undefined') {
    fn();
    return;
  }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      io.disconnect();
      fn();
    }
  }, { rootMargin: margin });
  io.observe(el);
}
