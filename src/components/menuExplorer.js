import { menuData } from '../data/menuData.js';
import { cartStore } from './cartStore.js';
import { motionSystem } from '../utils/motionSystem.js';

export function initMenuExplorer() {
  const container = document.getElementById('menu-explorer-root');
  if (!container) return;

  let activeBoard = 'drinks'; // 'drinks' | 'food'
  let searchQuery = '';
  let openCategories = new Set();

  function getTotalBoardItemsCount() {
    const list = menuData[activeBoard] || [];
    return list.reduce((sum, c) => sum + (c.items ? c.items.length : 0), 0);
  }

  function getGroupedItems() {
    const categories = menuData[activeBoard] || [];
    const q = searchQuery.toLowerCase().trim();

    return categories.map(cat => {
      let filteredItems = cat.items || [];
      if (q) {
        filteredItems = filteredItems.filter(item => 
          item.name.toLowerCase().includes(q) ||
          (item.description && item.description.toLowerCase().includes(q)) ||
          cat.category.toLowerCase().includes(q) ||
          (item.subcategory && item.subcategory.toLowerCase().includes(q))
        );
      }
      return {
        id: cat.id,
        name: cat.category,
        hasHotCold: cat.hasHotCold,
        hasSizes: cat.hasSizes,
        items: filteredItems,
        totalItemsCount: (cat.items || []).length
      };
    }).filter(group => !q || group.items.length > 0);
  }

  function render() {
    const totalCount = getTotalBoardItemsCount();
    const groupedItems = getGroupedItems();
    const isSearching = searchQuery.trim().length > 0;
    const allExpanded = groupedItems.length > 0 && groupedItems.every(g => openCategories.has(g.id) || isSearching);

    const drinkCount = menuData.drinks.reduce((s, c) => s + c.items.length, 0);
    const foodCount = menuData.food.reduce((s, c) => s + c.items.length, 0);

    container.innerHTML = `
      <!-- Board Switcher Tabs (Drinks First) -->
      <div class="board-switcher" id="menu-board-switcher" role="tablist" aria-label="Menu Boards">
        <button 
          role="tab" 
          aria-selected="${activeBoard === 'drinks'}" 
          class="board-tab-btn ${activeBoard === 'drinks' ? 'active' : ''}" 
          data-board="drinks"
          id="tab-drinks"
        >
          <span>Drinks &amp; Espresso</span>
          <span class="board-count-pill">${drinkCount} items</span>
        </button>
        <button 
          role="tab" 
          aria-selected="${activeBoard === 'food'}" 
          class="board-tab-btn ${activeBoard === 'food' ? 'active' : ''}" 
          data-board="food"
          id="tab-food"
        >
          <span>Food &amp; Kitchen Bites</span>
          <span class="board-count-pill">${foodCount} items</span>
        </button>
      </div>

      <!-- Search Field & Expand/Collapse Toggle -->
      <div class="menu-controls-row">
        <div class="search-input-wrapper">
          <svg class="search-icon-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M21.71 20.29l-5.4-5.39A7.9 7.9 0 0 0 18 10a8 8 0 1 0-8 8 7.9 7.9 0 0 0 4.9-1.69l5.39 5.4a1 1 0 0 0 1.42 0 1 1 0 0 0 0-1.42zM4 10a6 6 0 1 1 6 6 6 6 0 0 1-6-6z"/>
          </svg>
          <input 
            type="text" 
            class="menu-search-input" 
            placeholder="Search ${activeBoard === 'drinks' ? 'lattes, frappes, fruit sodas, iced teas...' : 'smash burgers, waffles, rice meals, pasta...'}"
            value="${searchQuery}"
            id="menu-search-field"
            aria-label="Search menu items"
          />
        </div>

        <div class="menu-accordion-actions">
          <span class="total-items-badge">${totalCount} Items • Tap category to expand</span>
          <button class="toggle-all-btn" id="toggle-all-categories-btn">
            ${allExpanded ? 'Collapse All' : 'Expand All'}
          </button>
        </div>
      </div>

      <!-- Collapsible Accordion Category Groups -->
      <div class="menu-accordion-wrapper">
        ${groupedItems.length === 0 ? `
          <div class="menu-no-results">
            <h3>No items match "${searchQuery}"</h3>
        ` : groupedItems.map(group => {
          const isOpen = isSearching ? true : openCategories.has(group.id);
          // Dynamically size the tasting notes to fill available space without awkward "+1 more"
          const maxAllowed = 8;
          let maxSneak = Math.min(group.items.length, maxAllowed);
          if (group.items.length - maxSneak === 1) {
            maxSneak = group.items.length;
          }
          const sneakPeekItems = group.items.slice(0, maxSneak);
          const remainingCount = group.items.length - maxSneak;

          let minPrice = Infinity;
          group.items.forEach(item => {
            const p = item.price || item.priceM;
            if (p && p < minPrice) minPrice = p;
          });
          const priceTeaserMarkup = minPrice !== Infinity ? `<span class="category-price-pill">From ₱${minPrice}</span>` : '';

          const previewCapsulesMarkup = `
            ${sneakPeekItems.map((item, idx) => {
              const isFeatured = item.isPopular || item.isSpecialty;
              const isLast = idx === sneakPeekItems.length - 1 && remainingCount <= 0;
              return `
                <span 
                  class="sneak-peek-pill ${isFeatured ? 'is-featured' : ''}" 
                  data-target-item-id="${item.id}"
                  data-parent-category-id="${group.id}"
                  title="Explore ${item.name}"
                >
                  ${isFeatured ? '<span class="note-star" aria-hidden="true">★</span>' : ''}
                  <span class="pill-name">${item.name}</span>
                </span>
                ${!isLast ? '<span class="tasting-dot" aria-hidden="true">·</span>' : ''}
              `;
            }).join('')}
            ${remainingCount > 0 ? `
              <span 
                class="tasting-more" 
                data-parent-category-id="${group.id}"
                title="View all ${group.items.length} items in ${group.name}"
              >
                +${remainingCount} more
              </span>
            ` : ''}
          `;

          return `
            <div class="menu-accordion-card ${isOpen ? 'is-open' : ''}" id="cat-card-${group.id}">
              <div 
                class="category-accordion-btn" 
                data-category-id="${group.id}" 
                role="button" 
                tabindex="0" 
                aria-expanded="${isOpen}"
                aria-controls="cat-body-${group.id}"
              >
                <div class="category-header-main">
                  <div class="category-title-left">
                    <h3 class="category-title-text">${group.name}</h3>
                    <span class="category-count-pill">${group.items.length} ${group.items.length === 1 ? 'item' : 'items'}</span>
                    ${priceTeaserMarkup}
                  </div>

                  <div class="category-sneak-peek-track" aria-label="Sneak peek of ${group.name}">
                    ${previewCapsulesMarkup}
                  </div>

                  <div class="category-toggle-indicator">
                    <span>${isOpen ? 'Hide' : 'View'}</span>
                    <span class="chevron-icon" aria-hidden="true">▼</span>
                  </div>
                </div>
              </div>

              <div class="category-accordion-body" id="cat-body-${group.id}" ${isOpen ? '' : 'hidden'}>
                <div class="category-items-grid">
                  ${group.items.map(item => {
                    let priceDisplay = item.price ? `₱${item.price}` : 'Ask Cashier';
                    let itemPrice = item.price || 0;
                    if (group.hasSizes || (!item.price && item.priceM)) {
                      priceDisplay = `M ₱${item.priceM} / L ₱${item.priceL}`;
                      itemPrice = item.priceM;
                    }

                    let modifierTag = '';
                    if (group.hasHotCold) modifierTag = 'Hot or Cold';
                    else if (group.hasSizes) modifierTag = 'Medium / Large';
                    else if (item.subcategory) modifierTag = item.subcategory;

                    return `
                      <article class="menu-card" data-item-id="${item.id}">
                        <div class="menu-card-main">
                          <div class="card-header-row">
                            <div class="item-name-group">
                              <h4 class="item-name">${item.name}</h4>
                              <div class="item-badges">
                                ${item.isSpecialty ? '<span class="badge-special">Specialty</span>' : ''}
                                ${item.isPopular ? '<span class="badge-pop">Popular</span>' : ''}
                              </div>
                            </div>
                            <div class="item-price-tag">${priceDisplay}</div>
                          </div>
                          <p class="item-desc">${item.description || 'Crafted fresh daily on the shore with premium ingredients.'}</p>
                        </div>

                        <div class="card-footer-action-row">
                          <div class="card-footer-tags">
                            <span class="item-cat-tag">${group.name}</span>
                            ${modifierTag ? `<span class="item-mod-tag">${modifierTag}</span>` : ''}
                          </div>
                          <button 
                            class="btn-add-item" 
                            data-add-id="${item.id}"
                            data-add-name="${item.name}"
                            data-add-price="${itemPrice}"
                            data-add-desc="${item.description || ''}"
                            aria-label="Add ${item.name} to order"
                          >
                            <span>${itemPrice > 0 ? '+ Order' : 'Inquire'}</span>
                          </button>
                        </div>
                      </article>
                    `;
                  }).join('')}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Add-Ons Section on Drinks Board -->
      ${activeBoard === 'drinks' && menuData.addOns ? `
        <div class="menu-addons-card">
          <h4 class="addons-title">Drink Customizations &amp; Add-ons</h4>
          <div class="addons-grid">
            ${menuData.addOns.map(addon => `
              <div class="addon-pill">
                <span class="addon-name">${addon.name}</span>
                <span class="addon-price">+₱${addon.price}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Official Physical Menu Board Notice -->
      <div class="menu-disclaimer-card">
        <div class="disclaimer-text">
          <p><strong>BAIA CAFE SHORE NOTICE</strong></p>
          <p>${menuData.boardDisclaimer}</p>
        </div>
      </div>
    `;

    attachEventListeners();
  }

  function attachEventListeners() {
    // Board Switcher Tabs
    container.querySelectorAll('.board-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeBoard = btn.dataset.board;
        searchQuery = '';
        openCategories = new Set();
        render();
      });
    });

    // Helper to sync Toggle All button text
    const syncToggleAllButton = () => {
      const toggleAllBtn = document.getElementById('toggle-all-categories-btn');
      if (toggleAllBtn) {
        const groupedItems = getGroupedItems();
        const allExpanded = groupedItems.length > 0 && groupedItems.every(g => openCategories.has(g.id));
        toggleAllBtn.textContent = allExpanded ? 'Collapse All' : 'Expand All';
      }
    };

    // Morph accordion pills into cards (and reverse) using View Transition API
    const toggleAccordion = (card, catId, willOpen, btn, indicatorText) => {
      if (!card) return;

      const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
      if (isMobile || !document.startViewTransition) {
        // Fallback / Mobile Viewports: standard instant toggle with clean CSS transitions
        card.querySelectorAll('.menu-card').forEach(c => c.classList.remove('morph-settled'));
        if (willOpen) {
          openCategories.add(catId);
          motionSystem.animateCategoryPillsFlight(card, true);
          card.classList.add('is-open');
          btn?.setAttribute('aria-expanded', 'true');
          if (indicatorText) indicatorText.textContent = 'Hide';
        } else {
          openCategories.delete(catId);
          motionSystem.animateCategoryPillsFlight(card, false);
          card.classList.remove('is-open');
          btn?.setAttribute('aria-expanded', 'false');
          if (indicatorText) indicatorText.textContent = 'View';
        }
        syncToggleAllButton();
        return;
      }

      // Cancel any ongoing transition on this card
      if (card._activeVT) {
        try {
          card._activeVT.skipTransition();
        } catch (_) {}
        card._activeVT = null;
      }

      const pills = Array.from(card.querySelectorAll('.category-sneak-peek-track .sneak-peek-pill')).slice(0, 5);
      const logo = document.querySelector('.brand-logo-img, .loyalty-logo-img');

      if (willOpen) {
        // Suppress brand logo during in-page accordion morph so it doesn't freeze the page for 1.5s
        if (logo) logo.style.viewTransitionName = 'none';

        pills.forEach((pill, idx) => {
          pill.style.viewTransitionName = `morph-${idx}`;
        });
        document.documentElement.classList.add('vt-morph-active');
        card.classList.add('vt-morphing');

        const transition = document.startViewTransition(() => {
          pills.forEach(p => { p.style.viewTransitionName = ''; });

          openCategories.add(catId);
          motionSystem.animateCategoryPillsFlight(card, true);
          card.classList.add('is-open');
          btn?.setAttribute('aria-expanded', 'true');
          if (indicatorText) indicatorText.textContent = 'Hide';
          syncToggleAllButton();

          const cards = Array.from(card.querySelectorAll('.category-items-grid .menu-card')).slice(0, pills.length);
          cards.forEach((itemCard, idx) => {
            itemCard.style.viewTransitionName = `morph-${idx}`;
            itemCard.setAttribute('data-vt-morph', 'true');
            itemCard.classList.add('morph-settled');
          });
        });

        card._activeVT = transition;

        const cleanup = () => {
          document.documentElement.classList.remove('vt-morph-active');
          card.classList.remove('vt-morphing');
          if (logo) logo.style.viewTransitionName = '';
          pills.forEach(p => { p.style.viewTransitionName = ''; });
          card.querySelectorAll('.menu-card').forEach(c => {
            c.style.viewTransitionName = '';
            c.removeAttribute('data-vt-morph');
            // Retain .morph-settled so CSS cascade animation doesn't re-trigger
          });
          card._activeVT = null;
        };

        transition.finished.then(cleanup, cleanup);
      } else {
        if (logo) logo.style.viewTransitionName = 'none';

        const cards = Array.from(card.querySelectorAll('.category-items-grid .menu-card')).slice(0, pills.length);
        cards.forEach((itemCard, idx) => {
          itemCard.style.viewTransitionName = `morph-${idx}`;
          itemCard.setAttribute('data-vt-morph', 'true');
        });
        document.documentElement.classList.add('vt-morph-active');
        card.classList.add('vt-morphing');

        const transition = document.startViewTransition(() => {
          cards.forEach(c => {
            c.style.viewTransitionName = '';
            c.classList.remove('morph-settled');
          });

          openCategories.delete(catId);
          motionSystem.animateCategoryPillsFlight(card, false);
          card.classList.remove('is-open');
          btn?.setAttribute('aria-expanded', 'false');
          if (indicatorText) indicatorText.textContent = 'View';
          syncToggleAllButton();

          pills.forEach((pill, idx) => {
            pill.style.viewTransitionName = `morph-${idx}`;
          });
        });

        card._activeVT = transition;

        const cleanup = () => {
          document.documentElement.classList.remove('vt-morph-active');
          card.classList.remove('vt-morphing');
          if (logo) logo.style.viewTransitionName = '';
          cards.forEach(c => {
            c.style.viewTransitionName = '';
            c.removeAttribute('data-vt-morph');
            c.classList.remove('morph-settled');
          });
          pills.forEach(p => {
            p.style.viewTransitionName = '';
          });
          card._activeVT = null;
        };

        transition.finished.then(cleanup, cleanup);
      }
    };

    // Accordion Header Buttons (Expand / Collapse with Smooth In-Place Animation & Capsule Jumps)
    container.querySelectorAll('.category-accordion-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        // If the click was on a sneak peek capsule or overflow pill, handle targeted jump
        const pill = e.target.closest('.sneak-peek-pill, .sneak-peek-overflow');
        if (pill) {
          e.stopPropagation();
          const catId = pill.dataset.parentCategoryId || btn.dataset.categoryId;
          const targetItemId = pill.dataset.targetItemId;
          const card = document.getElementById(`cat-card-${catId}`) || btn.closest('.menu-accordion-card');
          const indicatorText = btn.querySelector('.category-toggle-indicator span:first-child');

          // Ensure category is opened
          if (!card?.classList.contains('is-open')) {
            toggleAccordion(card, catId, true, btn, indicatorText);
          }

          // If a specific item was clicked, smooth-scroll to it and pulse-highlight it
          if (targetItemId) {
            setTimeout(() => {
              const targetEl = card?.querySelector(`[data-item-id="${targetItemId}"]`);
              if (targetEl) {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetEl.classList.remove('item-highlight-pulse');
                void targetEl.offsetWidth; // Force CSS reflow to re-trigger pulse
                targetEl.classList.add('item-highlight-pulse');
                setTimeout(() => {
                  targetEl.classList.remove('item-highlight-pulse');
                }, 1600);
              }
            }, 250);
          }
          return;
        }

        // Standard accordion header toggle
        const catId = btn.dataset.categoryId;
        const card = document.getElementById(`cat-card-${catId}`) || btn.closest('.menu-accordion-card');
        const indicatorText = btn.querySelector('.category-toggle-indicator span:first-child');
        const willOpen = !card?.classList.contains('is-open');

        toggleAccordion(card, catId, willOpen, btn, indicatorText);
      });

      // Keyboard accessibility (Enter / Space)
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.target.closest('.sneak-peek-pill, .sneak-peek-overflow')) return;
          e.preventDefault();
          btn.click();
        }
      });
    });

    // Toggle All Categories
    const toggleAllBtn = document.getElementById('toggle-all-categories-btn');
    if (toggleAllBtn) {
      toggleAllBtn.addEventListener('click', () => {
        const groupedItems = getGroupedItems();
        const allExpanded = groupedItems.length > 0 && groupedItems.every(g => openCategories.has(g.id));
        
        groupedItems.forEach(g => {
          const card = document.getElementById(`cat-card-${g.id}`);
          const btn = card?.querySelector('.category-accordion-btn');
          const indicatorText = btn?.querySelector('.category-toggle-indicator span:first-child');
          
          if (allExpanded) {
            openCategories.delete(g.id);
            motionSystem.animateCategoryPillsFlight(card, false);
            card?.querySelectorAll('.menu-card').forEach(c => c.classList.remove('morph-settled'));
            card?.classList.remove('is-open');
            btn?.setAttribute('aria-expanded', 'false');
            if (indicatorText) indicatorText.textContent = 'View';
          } else {
            openCategories.add(g.id);
            motionSystem.animateCategoryPillsFlight(card, true);
            card?.querySelectorAll('.menu-card').forEach(c => c.classList.remove('morph-settled'));
            card?.classList.add('is-open');
            btn?.setAttribute('aria-expanded', 'true');
            if (indicatorText) indicatorText.textContent = 'Hide';
          }
        });

        toggleAllBtn.textContent = allExpanded ? 'Expand All' : 'Collapse All';
      });
    }

    // Search Input
    const searchInput = document.getElementById('menu-search-field');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        render();
        const inputAfter = document.getElementById('menu-search-field');
        if (inputAfter) {
          inputAfter.focus();
          inputAfter.selectionStart = inputAfter.selectionEnd = inputAfter.value.length;
        }
      });
    }

    // Add to Order buttons
    container.querySelectorAll('.btn-add-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.addId;
        const name = btn.dataset.addName;
        const price = parseFloat(btn.dataset.addPrice) || 0;
        const description = btn.dataset.addDesc;

        cartStore.addItem({
          id,
          name,
          price,
          description
        });
      });
    });
  }

  // Initial render (ensures dynamic preview capsules & event listeners mount on both / and /menu/)
  render();
}
