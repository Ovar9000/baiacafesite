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

  // Close button, brand and section links
  drawer.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-drawer]')) close();
  });

  // Backdrop clicks: <dialog closedby="any"> handles them natively. Safari has
  // no closedby yet, so fall back to a press-and-release outside the sheet.
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    const outside = (e) => {
      const r = drawer.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    let pressedOutside = false;
    drawer.addEventListener('pointerdown', (e) => { pressedOutside = outside(e); });
    drawer.addEventListener('pointerup', (e) => { if (pressedOutside && outside(e)) close(); });
  }

  // The drawer only exists in the phone and tablet layout; close it if the
  // viewport grows past it.
  window.matchMedia('(min-width: 901px)').addEventListener('change', (e) => {
    if (e.matches && drawer.open) close();
  });
}
