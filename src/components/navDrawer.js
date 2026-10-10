/**
 * Section drawer for phones and tablets (after the Lot 7 sideswipe drawer).
 *
 * The drawer is a native modal <dialog>: showModal() gives focus trapping,
 * Escape-to-close, an inert page behind it and focus return to the menu
 * button. The slide in and out is all CSS (main.css, "NAV DRAWER").
 */
export function initNavDrawer() {
  const drawer = document.getElementById('nav-drawer');
  const toggle = document.querySelector('.nav-menu-toggle');
  if (!drawer || !toggle || typeof drawer.showModal !== 'function') return;

  const open = () => {
    drawer.showModal();
    toggle.setAttribute('aria-expanded', 'true');
  };

  const close = () => drawer.close();

  toggle.addEventListener('click', open);

  // Fires for every close path: close button, links, backdrop and Escape
  drawer.addEventListener('close', () => {
    toggle.setAttribute('aria-expanded', 'false');
  });

  drawer.addEventListener('click', (e) => {
    // The sheet's children cover its whole box, so a click whose target is
    // the dialog itself landed on the ::backdrop.
    if (e.target === drawer || e.target.closest('[data-close-drawer]')) close();
  });

  // The drawer only exists in the phone and tablet layout; close it if the
  // viewport grows past it.
  window.matchMedia('(min-width: 901px)').addEventListener('change', (e) => {
    if (e.matches && drawer.open) close();
  });
}
