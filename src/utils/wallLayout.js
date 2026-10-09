/**
 * Coffee-cup photowall template: the ONE place the cup shape is defined.
 *
 * Cards fill slots in order: card 0 (the newest photo) takes the most central
 * slot, and the steam puffs come last. Desktop and mobile use the same card
 * list; mobile shows the first MOBILE_SLOTS.length cards in its smaller cup.
 * Because every card index maps to a fixed, unique cell, cards can never stack
 * and new photos never distort the silhouette: they take the front slots and
 * the oldest cards drop off the end (see communityWall.js).
 *
 *   Desktop 7×6                 Mobile 5×5
 *   . . s . s . .               . s s . .
 *   # # # # # # .               # # # # .
 *   # # # # # # h               # # # # h
 *   # # # # # # h               # # # # h
 *   . # # # # . .               . # # . .
 *   . # # # # . .
 */

export const DESKTOP_GRID = { cols: 7, rows: 6 };
export const MOBILE_GRID = { cols: 5, rows: 5 };

// [col, row], most prominent first. Last two are the steam puffs.
export const DESKTOP_SLOTS = [
  [3, 3], [4, 3], [3, 4], [4, 4],
  [2, 3], [5, 3], [2, 4], [5, 4],
  [3, 2], [4, 2], [3, 5], [4, 5],
  [2, 2], [5, 2], [2, 5], [5, 5],
  [1, 3], [6, 3], [1, 4], [6, 4],
  [3, 6], [4, 6], [1, 2], [6, 2],
  [2, 6], [5, 6],
  [7, 3], [7, 4], // handle
  [3, 1], [5, 1]  // steam
];

export const MOBILE_SLOTS = [
  [2, 3], [3, 3], [2, 4], [3, 4],
  [2, 2], [3, 2], [1, 3], [4, 3],
  [1, 4], [4, 4], [1, 2], [4, 2],
  [2, 5], [3, 5],
  [5, 3], [5, 4], // handle
  [2, 1], [3, 1]  // steam
];

export const WALL_SIZE = DESKTOP_SLOTS.length;
const STEAM_ROW = 1;
const ROTATIONS = ['-3deg', '2deg', '-1.5deg', '3deg', '-2.5deg', '1.5deg', '-1deg'];

/** Position + presentation for the card at `index` (0 = newest/most central). */
export function wallSlot(index = 0) {
  const d = DESKTOP_SLOTS[index];
  const m = MOBILE_SLOTS[index];
  return {
    gc: d ? d[0] : null,
    gr: d ? d[1] : null,
    mgc: m ? m[0] : null,
    mgr: m ? m[1] : null,
    rot: ROTATIONS[index % ROTATIONS.length],
    z: 1 + (index % 3),
    steam: Boolean(d && d[1] === STEAM_ROW),
    steamMobile: Boolean(m && m[1] === STEAM_ROW),
    mobileHidden: !m,
    hidden: !d
  };
}

/** Inline style + classes for a card at `index` (used for static HTML too). */
export function wallSlotAttrs(index) {
  const s = wallSlot(index);
  const vars = [
    s.gc && `--gc: ${s.gc}`, s.gr && `--gr: ${s.gr}`,
    s.mgc && `--mgc: ${s.mgc}`, s.mgr && `--mgr: ${s.mgr}`,
    `--rot: ${s.rot}`, `--z: ${s.z}`
  ].filter(Boolean);
  const classes = [
    s.steam && 'is-steam',
    s.steamMobile && 'is-steam-m',
    s.mobileHidden && 'is-mobile-hidden'
  ].filter(Boolean);
  return { style: vars.join('; ') + ';', classes };
}

const SLOT_CLASSES = ['is-steam', 'is-steam-m', 'is-mobile-hidden'];

/**
 * Lay out every card in `container` by its position in the DOM, and drop
 * any cards beyond WALL_SIZE (the oldest ones, since new cards are prepended).
 */
export function applyWallLayout(container) {
  if (!container) return 0;
  const cards = Array.from(container.querySelectorAll(':scope > .mosaic-photo-card'));
  cards.slice(WALL_SIZE).forEach((card) => card.remove());
  cards.slice(0, WALL_SIZE).forEach((card, i) => {
    const { style, classes } = wallSlotAttrs(i);
    card.setAttribute('style', style);
    card.classList.remove(...SLOT_CLASSES);
    if (classes.length) card.classList.add(...classes);
  });
  return Math.min(cards.length, WALL_SIZE);
}
