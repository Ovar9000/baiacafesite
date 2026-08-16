import { menuData } from '../data/menuData.js';

export function initMenuExplorer() {
  const container = document.getElementById('menu-explorer-root');
  if (!container) return;

  let activeBoard = 'drinks'; // 'drinks' | 'food'
  let searchQuery = '';
  // Set of opened category IDs (default: empty = all collapsed for compact mobile viewing)
  let openCategories = new Set();

  const categoryIcons = {
    // Drinks
    'classic': '☕',
    'house-special': '⭐',
    'signature': '🌊',
    'blended': '🥤',
    'non-coffee': '🍵',
    'fruit-soda': '🍹',
    'iced-tea': '🧋',
    // Food
    'mirindal': '🧇',
    'burgers': '🍔',
    'sandwiches': '🥪',
    'rice-meals': '🍚',
    'pub': '🍗',
    'pasta': '🍝'
  };

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
        icon: categoryIcons[cat.id] || '✦',
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

    container.innerHTML = `
      <!-- Board Switcher Tabs -->
      <div class="board-switcher" id="menu-board-switcher">
        <button class="board-tab-btn ${activeBoard === 'drinks' ? 'active' : ''}" data-board="drinks">
          ☕ Board 2 — Drinks & Espresso
        </button>
        <button class="board-tab-btn ${activeBoard === 'food' ? 'active' : ''}" data-board="food">
          🍔 Board 1 — Food & Rice Meals
        </button>
      </div>

      <!-- Search Field & Expand/Collapse Toggle -->
      <div class="menu-controls-row">
        <div class="search-input-wrapper">
          <svg class="search-icon-svg" viewBox="0 0 24 24" width="20" height="20">
            <path d="M21.71 20.29l-5.4-5.39A7.9 7.9 0 0 0 18 10a8 8 0 1 0-8 8 7.9 7.9 0 0 0 4.9-1.69l5.39 5.4a1 1 0 0 0 1.42 0 1 1 0 0 0 0-1.42zM4 10a6 6 0 1 1 6 6 6 6 0 0 1-6-6z"/>
          </svg>
          <input 
            type="text" 
            class="menu-search-input" 
            placeholder="Search ${activeBoard === 'drinks' ? 'lattes, frappes, fruit sodas, iced teas...' : 'smash burgers, waffles, rice meals, pasta...'}"
            value="${searchQuery}"
            id="menu-search-field"
          />
        </div>

        <div class="menu-accordion-actions">
          <span class="total-items-badge">${totalCount} Items • Tap a category to view</span>
          <button class="toggle-all-btn" id="toggle-all-categories-btn">
            ${allExpanded ? 'Collapse All Categories' : 'Expand All Categories'}
          </button>
        </div>
      </div>

      <!-- Collapsible Accordion Category Groups -->
      <div class="menu-accordion-wrapper">
        ${groupedItems.length === 0 ? `
          <div style="text-align: center; padding: 48px; color: var(--text-muted); background: #FFFFFF; border-radius: 16px; border: 1.5px dashed rgba(22,37,92,0.15);">
            <h3 style="font-size: 1.25rem; color: var(--deep-navy); margin-bottom: 8px;">No items match "${searchQuery}"</h3>
            <p style="font-size: 0.9rem;">Try searching for another keyword or clear your search.</p>
          </div>
        ` : groupedItems.map(group => {
          // If searching, automatically expand matching categories
          const isOpen = isSearching ? true : openCategories.has(group.id);

          return `
            <div class="menu-accordion-card ${isOpen ? 'is-open' : ''}" id="cat-card-${group.id}">
              <button class="category-accordion-btn" data-category-id="${group.id}" aria-expanded="${isOpen}">
                <div class="category-title-left">
                  <span class="category-icon-emoji">${group.icon}</span>
                  <span class="category-title-text">${group.name}</span>
                  <span class="category-count-pill">${group.items.length} ${group.items.length === 1 ? 'item' : 'items'}</span>
                </div>
                <div class="category-toggle-indicator">
                  <span>${isOpen ? 'Hide' : 'View'}</span>
                  <span class="chevron-icon">▼</span>
                </div>
              </button>

              <div class="category-accordion-body">
                <div class="category-items-grid">
                  ${group.items.map(item => {
                    let priceDisplay = item.price ? `₱${item.price}` : '';
                    if (group.hasSizes || (!item.price && item.priceM)) {
                      priceDisplay = `M ₱${item.priceM} / L ₱${item.priceL}`;
                    }

                    let modifierTag = '';
                    if (group.hasHotCold) modifierTag = 'Hot or Cold';
                    else if (group.hasSizes) modifierTag = '16oz / 22oz';
                    else if (item.subcategory) modifierTag = item.subcategory;

                    return `
                      <div class="menu-card" data-item-id="${item.id}">
                        <div>
                          <div class="card-header-row">
                            <div class="item-name-group">
                              <h4 class="item-name">${item.name}</h4>
                              <div class="item-badges">
                                ${item.isSpecialty ? '<span class="badge-special">Specialty</span>' : ''}
                                ${item.isPopular ? '<span class="badge-pop">Best Seller</span>' : ''}
                              </div>
                            </div>
                            <div class="item-price-tag">${priceDisplay}</div>
                          </div>
                          <p class="item-desc">${item.description || 'Crafted fresh daily on the shore with premium ingredients.'}</p>
                        </div>

                        <div class="card-footer-tags">
                          <span class="item-cat-tag">${group.name}</span>
                          ${modifierTag ? `<span class="item-mod-tag">${modifierTag}</span>` : ''}
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Official Physical Menu Board Disclaimer -->
      <div class="menu-disclaimer-card">
        <div class="disclaimer-icon">⚠️</div>
        <div class="disclaimer-text">
          <h5>BAIA Cafe Board Notice</h5>
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
        openCategories.clear();
        searchQuery = '';
        render();
      });
    });

    // Accordion Header Buttons (Expand / Collapse)
    container.querySelectorAll('.category-accordion-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const catId = btn.dataset.categoryId;
        if (openCategories.has(catId)) {
          openCategories.delete(catId);
        } else {
          openCategories.add(catId);
        }
        render();
      });
    });

    // Toggle All Categories (Expand All / Collapse All)
    const toggleAllBtn = document.getElementById('toggle-all-categories-btn');
    if (toggleAllBtn) {
      toggleAllBtn.addEventListener('click', () => {
        const groupedItems = getGroupedItems();
        const allExpanded = groupedItems.every(g => openCategories.has(g.id));
        if (allExpanded) {
          openCategories.clear();
        } else {
          groupedItems.forEach(g => openCategories.add(g.id));
        }
        render();
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
  }

  // Initial render
  render();
}
