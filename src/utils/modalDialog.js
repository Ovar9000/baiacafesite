/**
 * Native modal <dialog> helpers for the order sheet, the checkout review,
 * the drink options sheet and the photo lightbox.
 *
 * showModal() gives each of them the top layer, a focus trap, an inert page
 * behind, Esc / back-gesture closing and focus return to the button that
 * opened it, so none of that is hand-built any more. Scroll locking is CSS
 * (overscroll-behavior on the dialog and its ::backdrop), not overflow on body.
 *
 * Closing animates in every browser: the dialog gets [data-closing], its CSS
 * transitions to the closed look while it is still open, and close() runs once
 * those transitions finish. Entry is CSS @starting-style.
 */

const pointerOutside = (e, dialog) => {
  const r = dialog.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
};

export function openModal(dialog) {
  if (!dialog) return;
  // Reopened mid-close: cancel the close and stay open
  dialog.removeAttribute('data-closing');
  if (!dialog.open) dialog.showModal();
}

export async function closeModal(dialog) {
  if (!dialog?.open || dialog.hasAttribute('data-closing')) return;
  dialog.setAttribute('data-closing', '');
  // getAnimations() flushes style, so the exit transitions have started here
  const running = dialog.getAnimations({ subtree: true });
  if (running.length) {
    await Promise.race([
      Promise.allSettled(running.map((a) => a.finished)),
      new Promise((resolve) => setTimeout(resolve, 700))
    ]);
  }
  // openModal() ran while we waited
  if (!dialog.hasAttribute('data-closing')) return;
  dialog.removeAttribute('data-closing');
  dialog.close();
}

/**
 * Route Esc, the back gesture and tap-outside (closedby="any") through
 * closeModal so they animate too. `canClose` can veto, e.g. while a dropdown
 * inside the dialog is open.
 */
export function wireModal(dialog, { canClose } = {}) {
  if (!dialog || dialog.dataset.modalWired) return;
  dialog.dataset.modalWired = 'true';

  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (canClose && !canClose()) return;
    closeModal(dialog);
  });

  // Safari has no closedby yet: close on a press and release both outside
  // the box (a drag that ends on the backdrop doesn't count)
  if (dialog.getAttribute('closedby') === 'any' && !('closedBy' in HTMLDialogElement.prototype)) {
    let pressedOutside = false;
    dialog.addEventListener('pointerdown', (e) => { pressedOutside = pointerOutside(e, dialog); });
    dialog.addEventListener('pointerup', (e) => {
      if (pressedOutside && pointerOutside(e, dialog)) closeModal(dialog);
    });
  }
}

/** True while any modal dialog is up (toasts wait for it to close). */
export function modalIsOpen() {
  return !!document.querySelector('dialog:modal');
}
