import { menuData, getAvailableDrinkAddOns, shouldOpenDrinkCustomizer } from '../data/menuData.js';
import { cartStore } from './cartStore.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const BOARD_LABELS = { drinks: 'Drinks', food: 'Food' };

/** Lowest price in a category, for the "From ₱…" line */
function fromPrice(items) {
  const prices = items.map((i) => i.price || i.priceM).filter(Boolean);
  return prices.length ? Math.min(...prices) : null;
}

/** What a category lets you choose, shown once in its header instead of on every item */
function categoryNote(cat) {
  if (cat.hasHotCold) return 'Hot or iced';
  if (cat.hasSizes) return 'Medium or large';
  return '';
}

/**
 * BAIA menu: Drinks / Food switch, a row of category tabs (one category at a
 * time, so the section stays short on the homepage), compact item rows, and
 * search across both boards. Drinks with options open a sheet
 * (openDrinkCustomizer); everything else adds in one tap.
 *
 * Other scripts can open a category with:
 *   window.dispatchEvent(new CustomEvent('baia:show-menu', { detail: { board, category } }))
 */
export function initMenuExplorer() {
  const container = document.getElementById('menu-explorer-root');
  if (!container) return;

  let activeBoard = 'drinks';
  const activeCategory = {
    drinks: menuData.drinks[0]?.id,
    food: menuData.food[0]?.id
  };
  let searchQuery = '';

  // ---- Markup ------------------------------------------------------------

  function itemRow(item, cat, board) {
    const sized = cat.hasSizes || (!item.price && item.priceM);
    const price = sized ? item.priceM : item.price || 0;
    const priceText = sized
      ? `M ₱${item.priceM} · L ₱${item.priceL}`
      : price > 0 ? `₱${price}` : 'Ask us';
    const flag = item.isSpecialty ? 'Specialty' : item.isPopular ? 'Popular' : '';

    return `
      <li class="mx-row" data-item-id="${escapeHtml(item.id)}">
        <div class="mx-row-text">
          <p class="mx-row-name">
            ${escapeHtml(item.name)}
            ${flag ? `<span class="mx-flag">${flag}</span>` : ''}
          </p>
          ${item.description ? `<p class="mx-row-desc">${escapeHtml(item.description)}</p>` : ''}
          <p class="mx-row-price">${escapeHtml(priceText)}</p>
        </div>
        <button
          type="button"
          class="mx-add ${price > 0 ? '' : 'mx-add--ask'}"
          data-add-id="${escapeHtml(item.id)}"
          data-add-name="${escapeHtml(item.name)}"
          data-add-price="${escapeHtml(String(price))}"
          data-add-desc="${escapeHtml(item.description || '')}"
          data-add-board="${board}"
          data-category-id="${escapeHtml(cat.id)}"
          data-has-hot-cold="${cat.hasHotCold ? 'true' : 'false'}"
          data-has-sizes="${cat.hasSizes ? 'true' : 'false'}"
          data-price-m="${escapeHtml(String(item.priceM || ''))}"
          data-price-l="${escapeHtml(String(item.priceL || ''))}"
          aria-label="${price > 0 ? `Add ${escapeHtml(item.name)} to your order` : `Ask about ${escapeHtml(item.name)} on Messenger`}"
        >
          ${price > 0
            ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>'
            : 'Ask'}
        </button>
      </li>
    `;
  }

  function categoryBlock(cat, board, items, { showBoard = false } = {}) {
    const from = fromPrice(cat.items || []);
    const meta = [
      showBoard ? BOARD_LABELS[board] : '',
      `${items.length} ${items.length === 1 ? 'item' : 'items'}`,
      categoryNote(cat),
      from && !showBoard ? `from ₱${from}` : ''
    ].filter(Boolean).join(' · ');

    return `
      <section class="mx-category" aria-label="${escapeHtml(cat.category)}">
        <header class="mx-category-head">
          <h3 class="mx-category-title">${escapeHtml(cat.category)}</h3>
          <p class="mx-category-meta">${escapeHtml(meta)}</p>
        </header>
        <ul class="mx-list">
          ${items.map((item) => itemRow(item, cat, board)).join('')}
        </ul>
      </section>
    `;
  }

  function searchResults(q) {
    const blocks = [];
    for (const board of ['drinks', 'food']) {
      for (const cat of menuData[board]) {
        const items = (cat.items || []).filter((item) =>
          item.name.toLowerCase().includes(q) ||
          (item.description || '').toLowerCase().includes(q) ||
          cat.category.toLowerCase().includes(q) ||
          (item.subcategory || '').toLowerCase().includes(q)
        );
        if (items.length) blocks.push(categoryBlock(cat, board, items, { showBoard: true }));
      }
    }
    return blocks.length
      ? blocks.join('')
      : `<div class="mx-empty"><p class="mx-empty-title">Nothing matches "${escapeHtml(searchQuery)}"</p><p>Try another word, or ask us on Messenger.</p></div>`;
  }

  // The shell (board switch, search field, notes) renders once; the tabs and
  // results below it update in place, so typing never re-creates the field
  // (which would flicker the keyboard on phones).
  function render() {
    container.innerHTML = `
      <div class="mx-top">
        <div class="mx-board" role="tablist" aria-label="Menu board">
          ${['drinks', 'food'].map((board) => `
            <button type="button" role="tab" class="mx-board-btn" data-board="${board}">
              ${BOARD_LABELS[board]}
            </button>
          `).join('')}
        </div>

        <label class="mx-search">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><line x1="16.5" y1="16.5" x2="21" y2="21"></line></svg>
          <input type="search" id="menu-search-field" placeholder="Search drinks and food" aria-label="Search the menu" autocomplete="off" />
          <button type="button" class="mx-search-clear" aria-label="Clear search" hidden>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="10" opacity="0.35"></circle><path d="M9 9l6 6M15 9l-6 6" stroke="#fff" stroke-width="2" stroke-linecap="round"></path></svg>
          </button>
        </label>
      </div>

      <div class="mx-body"></div>

      <div class="menu-disclaimer-card">
        <div class="disclaimer-text">
          <p><strong>Good to know</strong></p>
          <p>${escapeHtml(menuData.boardDisclaimer)}</p>
        </div>
      </div>
    `;

    attachShellListeners();
    renderBody();
  }

  // Board or search changed: rebuild the tab row and the results
  function renderBody() {
    const q = searchQuery.toLowerCase().trim();
    const categories = menuData[activeBoard] || [];
    const current = currentCategory();

    container.querySelectorAll('.mx-board-btn').forEach((btn) => {
      const on = btn.dataset.board === activeBoard;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', String(on));
    });
    container.querySelector('.mx-search-clear').hidden = !q;

    container.querySelector('.mx-body').innerHTML = `
      ${q ? '' : `
        <!-- Category tabs: a glass capsule that pins under the header while
             you browse; the lens glides to the selected category -->
        <div class="mx-chips-bar">
          <div class="mx-chips" role="tablist" aria-label="${BOARD_LABELS[activeBoard]} categories">
            <span class="mx-chip-lens" aria-hidden="true"></span>
            ${categories.map((cat) => `
              <button type="button" role="tab" class="mx-chip ${cat.id === current?.id ? 'active' : ''}" data-category-id="${escapeHtml(cat.id)}" aria-selected="${cat.id === current?.id}">
                ${escapeHtml(cat.category)}
              </button>
            `).join('')}
          </div>
        </div>
      `}

      <div class="mx-results" aria-live="polite"></div>
    `;

    container.querySelectorAll('.mx-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        // If the tabs are pinned under the header, bring the new category's top into view
        const pinned = container.querySelector('.mx-chips-bar')?.getBoundingClientRect().top <= 140;
        selectCategory(chip.dataset.categoryId, { scroll: pinned });
      });
    });

    renderResults();
    // Place the lens without animating it in from the left edge
    moveLens({ instant: true });
  }

  function currentCategory() {
    const categories = menuData[activeBoard] || [];
    return categories.find((c) => c.id === activeCategory[activeBoard]) || categories[0];
  }

  function renderResults() {
    const q = searchQuery.toLowerCase().trim();
    const current = currentCategory();
    container.querySelector('.mx-results').innerHTML =
      q ? searchResults(q) : current ? categoryBlock(current, activeBoard, current.items || []) : '';
    attachAddListeners();
  }

  // The glass lens sits behind the selected tab and glides between them
  function moveLens({ instant = false } = {}) {
    const chips = container.querySelector('.mx-chips');
    const lens = container.querySelector('.mx-chip-lens');
    const chip = container.querySelector('.mx-chip.active');
    if (!chips || !lens || !chip) return;
    if (instant) lens.style.transition = 'none';
    lens.style.setProperty('--lens-x', `${chip.offsetLeft}px`);
    lens.style.setProperty('--lens-w', `${chip.offsetWidth}px`);
    lens.classList.add('is-visible');
    if (instant) {
      void lens.offsetWidth;
      lens.style.transition = '';
    }
    chips.scrollTo({ left: chip.offsetLeft - (chips.clientWidth - chip.offsetWidth) / 2, behavior: instant ? 'auto' : 'smooth' });
  }

  // Same board, another category: only the lens moves and the results swap
  function selectCategory(categoryId, { scroll = false } = {}) {
    if (!menuData[activeBoard].some((c) => c.id === categoryId)) return;
    activeCategory[activeBoard] = categoryId;
    container.querySelectorAll('.mx-chip').forEach((chip) => {
      const on = chip.dataset.categoryId === categoryId;
      chip.classList.toggle('active', on);
      chip.setAttribute('aria-selected', String(on));
    });
    moveLens();
    renderResults();
    if (scroll) {
      container.querySelector('.mx-chips-bar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function showCategory(board, categoryId, { scroll = false } = {}) {
    const boardChanged = board && menuData[board] && board !== activeBoard;
    if (boardChanged) activeBoard = board;
    if (categoryId && menuData[activeBoard].some((c) => c.id === categoryId)) {
      activeCategory[activeBoard] = categoryId;
    }
    if (searchQuery) {
      searchQuery = '';
      container.querySelector('#menu-search-field').value = '';
      renderBody();
    } else if (boardChanged || !container.querySelector('.mx-chips')) {
      renderBody();
    } else {
      selectCategory(activeCategory[activeBoard]);
    }
    if (scroll) {
      container.querySelector('.mx-chips-bar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ---- Events ------------------------------------------------------------

  function attachShellListeners() {
    container.querySelectorAll('.mx-board-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.board === activeBoard && !searchQuery) return;
        showCategory(btn.dataset.board);
      });
    });

    const searchInput = container.querySelector('#menu-search-field');
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderBody();
    });

    container.querySelector('.mx-search-clear').addEventListener('click', () => {
      searchQuery = '';
      searchInput.value = '';
      renderBody();
      searchInput.focus();
    });
  }

  function attachAddListeners() {
    container.querySelectorAll('.mx-add').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.addId;
        const name = btn.dataset.addName;
        const price = parseFloat(btn.dataset.addPrice) || 0;
        const description = btn.dataset.addDesc;
        const categoryId = btn.dataset.categoryId;
        const board = btn.dataset.addBoard;
        const hasHotCold = btn.dataset.hasHotCold === 'true';
        const hasSizes = btn.dataset.hasSizes === 'true';
        const priceM = parseFloat(btn.dataset.priceM) || price;
        const priceL = parseFloat(btn.dataset.priceL) || price;

        if (price === 0) {
          // Inquiry item (e.g. craft beer)
          window.open('https://m.me/thebaiacafe', '_blank', 'noopener');
          return;
        }

        const drinkItem = { id, name, price, priceM, priceL, description, hasHotCold, hasSizes, categoryId };

        if (board === 'drinks' && shouldOpenDrinkCustomizer(drinkItem, categoryId)) {
          openDrinkCustomizer(drinkItem);
        } else {
          // Food items or fixed drinks (fruit sodas, iced teas): one tap adds
          cartStore.addItem({ id, name, price, description, isDrink: board === 'drinks', categoryId });
          btn.classList.remove('is-added');
          void btn.offsetWidth;
          btn.classList.add('is-added');
        }
      });
    });
  }

  window.addEventListener('baia:show-menu', (e) => {
    const { board, category } = e.detail || {};
    showCategory(board, category, { scroll: true });
  });

  // ---- Drink options sheet ----------------------------------------------

  function openDrinkCustomizer(itemData) {
    let modal = document.getElementById('drink-customizer-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'drink-customizer-modal';
      modal.className = 'modal-backdrop drink-customizer-backdrop';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'drink-customizer-title');
      document.body.appendChild(modal);
    }

    const hasHotCold = itemData.hasHotCold;
    const hasSizes = itemData.hasSizes;
    const priceM = itemData.priceM || itemData.price || 0;
    const priceL = itemData.priceL || (itemData.price ? itemData.price + 20 : 0);
    const addOnsList = getAvailableDrinkAddOns(itemData.id);

    let selectedTemp = hasHotCold ? 'Iced' : null;
    let selectedSize = hasSizes ? 'M' : null;
    const selectedAddOns = new Set();
    let quantity = 1;

    const unitPrice = () => {
      const base = hasSizes ? (selectedSize === 'L' ? priceL : priceM) : itemData.price || 0;
      return base + addOnsList.filter((a) => selectedAddOns.has(a.id)).reduce((sum, a) => sum + (Number(a.price) || 0), 0);
    };

    const segmented = (name, options, selected) => `
      <div class="cz-seg" role="radiogroup" data-seg="${name}">
        ${options.map((o) => `
          <button type="button" role="radio" class="cz-seg-btn ${o.value === selected ? 'active' : ''}" data-value="${o.value}" aria-checked="${o.value === selected}">
            <span>${o.label}</span>${o.sub ? `<small>${o.sub}</small>` : ''}
          </button>
        `).join('')}
      </div>
    `;

    modal.innerHTML = `
      <div class="modal-dialog-card drink-customizer-card">
        <div class="cz-grabber" aria-hidden="true"></div>
        <div class="cz-head">
          <div>
            <h3 id="drink-customizer-title" class="cz-title">${escapeHtml(itemData.name)}</h3>
            ${itemData.description ? `<p class="cz-desc">${escapeHtml(itemData.description)}</p>` : ''}
          </div>
          <button type="button" class="cz-close" id="customizer-close-btn" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        ${hasHotCold ? `
          <p class="cz-label">Temperature</p>
          ${segmented('temp', [{ value: 'Iced', label: 'Iced' }, { value: 'Hot', label: 'Hot' }], selectedTemp)}
        ` : ''}

        ${hasSizes ? `
          <p class="cz-label">Size</p>
          ${segmented('size', [{ value: 'M', label: 'Medium', sub: `16 oz · ₱${priceM}` }, { value: 'L', label: 'Large', sub: `22 oz · ₱${priceL}` }], selectedSize)}
        ` : ''}

        ${addOnsList.length ? `
          <p class="cz-label">Add-ons <span>Optional</span></p>
          <ul class="cz-addons">
            ${addOnsList.map((a) => `
              <li>
                <button type="button" class="cz-addon" data-addon-id="${escapeHtml(a.id)}" role="checkbox" aria-checked="false">
                  <span class="cz-addon-name">${escapeHtml(a.name)}</span>
                  <span class="cz-addon-price">+₱${Number(a.price) || 0}</span>
                  <span class="cz-check" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 12.5 10 17 19 7.5"></polyline></svg>
                  </span>
                </button>
              </li>
            `).join('')}
          </ul>
        ` : ''}

        <div class="cz-foot">
          <div class="cz-stepper" role="group" aria-label="Quantity">
            <button type="button" id="customizer-qty-minus" aria-label="Decrease quantity">−</button>
            <span class="cz-qty" aria-live="polite">1</span>
            <button type="button" id="customizer-qty-plus" aria-label="Increase quantity">+</button>
          </div>
          <button type="button" class="cz-submit" id="customizer-submit-btn">
            Add to order · <span class="cz-total"></span>
          </button>
        </div>
      </div>
    `;

    // Update in place, so the segmented highlights slide instead of redrawing
    const totalEl = modal.querySelector('.cz-total');
    const qtyEl = modal.querySelector('.cz-qty');
    const refresh = () => {
      totalEl.textContent = `₱${(unitPrice() * quantity).toLocaleString()}`;
      qtyEl.textContent = String(quantity);
    };

    modal.querySelectorAll('.cz-seg').forEach((seg) => {
      seg.querySelectorAll('.cz-seg-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          seg.querySelectorAll('.cz-seg-btn').forEach((b) => {
            b.classList.toggle('active', b === btn);
            b.setAttribute('aria-checked', String(b === btn));
          });
          if (seg.dataset.seg === 'temp') selectedTemp = btn.dataset.value;
          if (seg.dataset.seg === 'size') selectedSize = btn.dataset.value;
          refresh();
        });
      });
    });

    modal.querySelectorAll('.cz-addon').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.addonId;
        const on = !selectedAddOns.has(id);
        if (on) selectedAddOns.add(id);
        else selectedAddOns.delete(id);
        btn.classList.toggle('is-checked', on);
        btn.setAttribute('aria-checked', String(on));
        refresh();
      });
    });

    modal.querySelector('#customizer-qty-minus').addEventListener('click', () => {
      if (quantity > 1) quantity -= 1;
      refresh();
    });
    modal.querySelector('#customizer-qty-plus').addEventListener('click', () => {
      quantity += 1;
      refresh();
    });

    modal.querySelector('#customizer-submit-btn').addEventListener('click', () => {
      cartStore.addItem({
        id: itemData.id,
        name: itemData.name,
        price: hasSizes ? (selectedSize === 'L' ? priceL : priceM) : itemData.price || 0,
        description: itemData.description,
        temp: selectedTemp,
        size: selectedSize,
        addOns: addOnsList.filter((a) => selectedAddOns.has(a.id)),
        quantity,
        isDrink: true,
        categoryId: itemData.categoryId
      });
      closeModal();
    });

    const onKey = (e) => {
      if (e.key === 'Escape') closeModal();
    };

    function closeModal() {
      modal.classList.remove('active');
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    }

    modal.querySelector('#customizer-close-btn').addEventListener('click', closeModal);
    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };

    refresh();
    // Next frame, so the sheet animates in from its closed position
    requestAnimationFrame(() => modal.classList.add('active'));
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
  }

  render();
  // Tab widths change as web fonts arrive and when the window resizes
  document.fonts?.ready?.then(() => moveLens({ instant: true }));
  window.addEventListener('resize', () => moveLens({ instant: true }), { passive: true });
}
