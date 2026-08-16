import { menuData } from '../data/menuData.js';

export function initMenuExplorer() {
  const container = document.getElementById('menu-explorer-root');
  if (!container) return;

  let activeBoard = 'drinks'; // 'drinks' | 'food'
  let activeCategory = 'all';
  let searchQuery = '';

  function getCategories() {
    const list = menuData[activeBoard] || [];
    return list.map(c => ({ id: c.id, name: c.category }));
  }

  function getFilteredItems() {
    const categories = menuData[activeBoard] || [];
    let allItems = [];

    categories.forEach(cat => {
      if (activeCategory === 'all' || activeCategory === cat.id) {
        cat.items.forEach(item => {
          allItems.push({
            ...item,
            parentCategoryId: cat.id,
            parentCategoryName: cat.category,
            hasHotCold: cat.hasHotCold,
            hasSizes: cat.hasSizes
          });
        });
      }
    });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      allItems = allItems.filter(item => 
        item.name.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        item.parentCategoryName.toLowerCase().includes(q) ||
        (item.subcategory && item.subcategory.toLowerCase().includes(q))
      );
    }

    return allItems;
  }

  function render() {
    const categories = getCategories();
    const items = getFilteredItems();

    container.innerHTML = `
      <!-- Board Switcher Tabs -->
      <div class="board-switcher">
        <button class="board-tab-btn ${activeBoard === 'drinks' ? 'active' : ''}" data-board="drinks">
          ☕ Board 2 — Drinks & Espresso
        </button>
        <button class="board-tab-btn ${activeBoard === 'food' ? 'active' : ''}" data-board="food">
          🍔 Board 1 — Food & Rice Meals
        </button>
      </div>

      <!-- Controls: Search and Categories -->
      <div class="menu-controls-row">
        <div class="search-input-wrapper">
          <svg class="search-icon-svg" viewBox="0 0 24 24" width="18" height="18">
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

        <div class="category-filter-scroll">
          <button class="category-pill-btn ${activeCategory === 'all' ? 'active' : ''}" data-category="all">
            All ${activeBoard === 'drinks' ? 'Drinks' : 'Food'} (${items.length})
          </button>
          ${categories.map(cat => `
            <button class="category-pill-btn ${activeCategory === cat.id ? 'active' : ''}" data-category="${cat.id}">
              ${cat.name}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Typographic Menu Items Grid -->
      <div class="menu-items-grid">
        ${items.length === 0 ? `
          <div style="grid-column: 1 / -1; text-align: center; padding: 48px; color: var(--text-muted); background: #FFFFFF; border-radius: 16px;">
            <h3 style="font-size: 1.2rem; color: var(--deep-navy); margin-bottom: 8px;">No items match "${searchQuery}"</h3>
            <p style="font-size: 0.9rem;">Try searching for coffee, burger, pasta, or clear the search query.</p>
          </div>
        ` : items.map(item => {
          let priceDisplay = item.price ? `₱${item.price}` : '';
          if (item.hasSizes || (!item.price && item.priceM)) {
            priceDisplay = `M ₱${item.priceM} / L ₱${item.priceL}`;
          }

          let modifierTag = '';
          if (item.hasHotCold) modifierTag = 'Hot or Cold';
          else if (item.hasSizes) modifierTag = '16oz / 22oz';
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
                <span class="item-cat-tag">${item.parentCategoryName}</span>
                ${modifierTag ? `<span class="item-mod-tag">${modifierTag}</span>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Official Board Glassware / Pricing Disclaimer -->
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
    // Board Switcher
    container.querySelectorAll('.board-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeBoard = btn.dataset.board;
        activeCategory = 'all';
        searchQuery = '';
        render();
      });
    });

    // Category Filter Pills
    container.querySelectorAll('.category-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCategory = btn.dataset.category;
        render();
      });
    });

    // Search Field
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
