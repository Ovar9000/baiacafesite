/**
 * BAIA Cafe — New Drops & Fresh Releases Component
 * 
 * Renders latest food & drink drops and upcoming beach events synced from Facebook.
 * Features:
 * - Dynamic category filtering (All, Food, Drinks, Events)
 * - Relative time stamps ("2 days ago", "Yesterday")
 * - 1-Click "Message to Order" integration with cartStore & Messenger
 * - Direct "View on Facebook ↗" links to original post
 * - Sleek card interactions and live sync status indicators
 */

import updatesData from '../data/updates.json';
import { cartStore } from './cartStore.js';

export function initNewDrops() {
  const container = document.getElementById('new-drops-root');
  if (!container) return;

  let activeCategory = 'all';

  function formatTimeAgo(isoString) {
    if (!isoString) return 'Recently';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'Recently';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return 'Just now';

    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 60) return diffMinutes <= 1 ? 'Just now' : `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 14) return '1 week ago';
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatEventDate(str) {
    if (!str) return '';
    if (/[a-zA-Z]/.test(str) && !str.includes('T')) return str;
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return str;
  }

  function render() {
    // Filter out mock items, keeping all real Facebook drops & events
    const rawItems = updatesData || [];
    const items = rawItems.filter(item => !String(item.id).startsWith('fb_post_'));
    const filteredItems = activeCategory === 'all' 
      ? items 
      : items.filter(item => item.category === activeCategory);

    const counts = {
      all: items.length,
      food: items.filter(i => i.category === 'food').length,
      drink: items.filter(i => i.category === 'drink').length,
      event: items.filter(i => i.category === 'event').length
    };

    container.innerHTML = `
      <div class="drops-header-block">
        <!-- Live Sync Status Pill -->
        <div class="drops-sync-badge" aria-label="Synced with Facebook">
          <span class="sync-live-dot" aria-hidden="true"></span>
          <span class="sync-label">LIVE SYNCED •</span>
          <a href="https://www.facebook.com/thebaiacafe" target="_blank" rel="noopener" class="sync-link">
            fb.com/thebaiacafe ↗
          </a>
        </div>

        <div class="drops-title-wrap">
          <span class="drops-script-accent">Fresh Out The Kitchen</span>
          <h2 class="drops-headline">
            <span class="wordmark">NEW DROPS</span>
            <span class="drops-amp">&amp;</span>
            <span class="wordmark">EVENTS</span>
          </h2>
          <p class="drops-subtitle">
            Artisanal flavor drops, limited kitchen specials, giveaways, and beachside happenings synced straight from our Facebook feed.
          </p>
        </div>

        <!-- Interactive Category Filter Tabs -->
        <div class="drops-filter-tabs" role="tablist" aria-label="Filter drops by category">
          <button class="drops-tab-btn ${activeCategory === 'all' ? 'is-active' : ''}" data-cat="all" role="tab" aria-selected="${activeCategory === 'all'}">
            <span>All Releases</span>
            <span class="tab-count-pill">${counts.all}</span>
          </button>
          <button class="drops-tab-btn ${activeCategory === 'food' ? 'is-active' : ''}" data-cat="food" role="tab" aria-selected="${activeCategory === 'food'}">
            <span>Food</span>
            <span class="tab-count-pill">${counts.food}</span>
          </button>
          <button class="drops-tab-btn ${activeCategory === 'drink' ? 'is-active' : ''}" data-cat="drink" role="tab" aria-selected="${activeCategory === 'drink'}">
            <span>Drinks</span>
            <span class="tab-count-pill">${counts.drink}</span>
          </button>
          <button class="drops-tab-btn ${activeCategory === 'event' ? 'is-active' : ''}" data-cat="event" role="tab" aria-selected="${activeCategory === 'event'}">
            <span>Events &amp; Giveaways</span>
            <span class="tab-count-pill">${counts.event}</span>
          </button>
        </div>
      </div>

      <!-- Drops Cards Grid -->
      <div class="drops-cards-grid">
        ${filteredItems.length === 0 ? `
          <div class="drops-empty-state">
            <h3>No drops in this category right now</h3>
            <p>Check back soon or follow our Facebook page for the next flavor drop.</p>
          </div>
        ` : filteredItems.map((item, index) => {
          const isFood = item.category === 'food';
          const isDrink = item.category === 'drink';
          const isEvent = item.category === 'event';

          const priceNum = item.price ? parseInt(item.price.replace(/[^\d]/g, ''), 10) : 0;
          const timeAgo = formatTimeAgo(item.published_at);

          // Event sub-types (strictly scoped to events)
          const isGiveaway = isEvent && (item.badge === 'Giveaway' || item.badge === 'Winner Awarded' || Boolean(item.winner) || /\b(giveaway|contest|guess)\b/i.test(item.title));
          const isGiveawayConcluded = isGiveaway && (item.status === 'concluded' || Boolean(item.winner) || item.badge === 'Winner Awarded');
          const isAdvisory = isEvent && !isGiveaway && (item.badge === '1-Day Advisory' || /\b(advisory|closure|weather)\b/i.test(item.title));

          let badgeClass = 'badge-drop';
          let badgeLabel = item.badge || (isFood ? 'Fresh Drop' : (isDrink ? 'Drink Drop' : 'New Drop'));
          let categoryLabel = item.category.toUpperCase();

          if (isFood) {
            badgeClass = 'badge-drop';
            badgeLabel = item.badge || 'Fresh Drop';
            categoryLabel = 'FOOD';
          } else if (isDrink) {
            badgeClass = 'badge-drop';
            badgeLabel = item.badge || 'Drink Drop';
            categoryLabel = 'DRINK';
          } else if (isEvent) {
            if (isGiveaway) {
              if (isGiveawayConcluded) {
                badgeClass = 'badge-winner';
                badgeLabel = 'Winner Awarded';
                categoryLabel = 'GIVEAWAY • CONCLUDED';
              } else {
                badgeClass = 'badge-giveaway';
                badgeLabel = 'Active Giveaway';
                categoryLabel = 'GIVEAWAY';
              }
            } else if (isAdvisory) {
              badgeClass = 'badge-advisory';
              badgeLabel = '1-Day Advisory';
              categoryLabel = 'ADVISORY';
            } else {
              badgeClass = 'badge-event';
              badgeLabel = item.badge || 'Live Event';
              categoryLabel = 'EVENT';
            }
          }

          return `
            <article class="drop-card drop-card-${item.category}" style="--stagger-index: ${index};" data-drop-id="${item.id}">
              <!-- Visual Media Area -->
              <div class="drop-media-frame">
                <img 
                  src="${item.image_url || './images/Baia%20skimboard%20and%20coffee.webp'}" 
                  alt="${item.title}" 
                  loading="lazy" 
                  decoding="async" 
                  class="drop-image"
                  onerror="this.src='./images/Baia%20skimboard%20and%20coffee.webp';"
                />
                
                <!-- Floating Category & Live Drop Badge -->
                <div class="drop-badge-row">
                  <span class="drop-pill-badge ${badgeClass}">
                    ${badgeLabel}
                  </span>
                  <span class="drop-time-pill" title="${item.published_at}">
                    ${timeAgo}
                  </span>
                </div>

                ${item.winner ? `
                  <div class="drop-date-tag tag-winner">
                    Winner: ${item.winner}
                  </div>
                ` : (item.price ? `
                  <div class="drop-price-tag">
                    ${item.price}
                  </div>
                ` : (item.event_date ? `
                  <div class="drop-date-tag">
                    ${formatEventDate(item.event_date)}
                  </div>
                ` : (isAdvisory ? `
                  <div class="drop-date-tag tag-advisory">
                    Reopened Next Day
                  </div>
                ` : '')))}
              </div>

              <!-- Content Area -->
              <div class="drop-content-body">
                <div class="drop-meta-line">
                  <span class="drop-category-label">${categoryLabel}</span>
                  ${item.winner ? `<span class="drop-date-label status-winner">Winner: ${item.winner}</span>` : (item.event_date ? `<span class="drop-date-label">${formatEventDate(item.event_date)}</span>` : (isAdvisory ? `<span class="drop-date-label status-open">Open Regular Hours</span>` : ''))}
                </div>

                <h3 class="drop-card-title">${item.title}</h3>
                <p class="drop-card-desc">${item.description}</p>

                <!-- Actions Footer -->
                <div class="drop-card-actions">
                  ${!isEvent && priceNum > 0 ? `
                    <button class="btn-drop-order" data-order-drop="${item.id}" data-title="${encodeURIComponent(item.title)}" data-price="${priceNum}">
                      <span>Message to Order (${item.price})</span>
                    </button>
                  ` : (isGiveaway ? `
                    ${isGiveawayConcluded ? `
                      <a href="${item.permalink || 'https://facebook.com/thebaiacafe'}" target="_blank" rel="noopener" class="btn-drop-order btn-drop-winner">
                        <span>View Winner on FB</span>
                        <span aria-hidden="true">↗</span>
                      </a>
                    ` : `
                      <a href="${item.permalink || 'https://facebook.com/thebaiacafe'}" target="_blank" rel="noopener" class="btn-drop-order btn-drop-giveaway">
                        <span>Enter Giveaway on FB</span>
                        <span aria-hidden="true">→</span>
                      </a>
                    `}
                  ` : (isAdvisory ? `
                    <a href="https://m.me/thebaiacafe" target="_blank" rel="noopener" class="btn-drop-order">
                      <span>Message Cafe</span>
                    </a>
                  ` : (isEvent ? `
                    <a href="https://m.me/thebaiacafe" target="_blank" rel="noopener" class="btn-drop-order btn-drop-rsvp">
                      <span>RSVP via Messenger</span>
                      <span aria-hidden="true">→</span>
                    </a>
                  ` : `
                    <a href="https://m.me/thebaiacafe" target="_blank" rel="noopener" class="btn-drop-order">
                      <span>Message Cafe</span>
                    </a>
                  `)))}

                  ${item.permalink ? `
                    <a href="${item.permalink}" target="_blank" rel="noopener" class="btn-drop-fb" title="View original post on Facebook" aria-label="View original Facebook post">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                      </svg>
                      <span class="fb-text">Post ↗</span>
                    </a>
                  ` : ''}
                </div>
              </div>
            </article>
          `;
        }).join('')}
      </div>

      <!-- Bottom Facebook Live Anchor -->
      <div class="drops-footer-banner">
        <div class="footer-banner-text">
          <strong>Got a craving for something custom?</strong>
          <span>Message the BAIA kitchen directly on Facebook Messenger for custom orders, catering, and beach table holds.</span>
        </div>
        <a href="https://m.me/thebaiacafe" target="_blank" rel="noopener" class="btn-banner-messenger">
          <span>Chat on Messenger</span>
          <span aria-hidden="true">→</span>
        </a>
      </div>
    `;

    // Attach Category Tab Listeners
    container.querySelectorAll('.drops-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const cat = e.currentTarget.dataset.cat;
        if (cat && cat !== activeCategory) {
          activeCategory = cat;
          render();
        }
      });
    });

    // Attach Order Buttons to CartStore
    container.querySelectorAll('[data-order-drop]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = btn.dataset.orderDrop;
        const title = decodeURIComponent(btn.dataset.title || 'New BAIA Special');
        const price = parseInt(btn.dataset.price || '0', 10);

        cartStore.addItem({
          id: `drop-${id}`,
          name: title,
          price: price,
          calculatedPrice: price,
          quantity: 1,
          description: 'New Facebook Release Drop'
        });
      });
    });
  }

  // Initial Render
  render();
}
