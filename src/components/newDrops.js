/**
 * BAIA Cafe — "What's New" strip
 *
 * Shows the latest few food & drink drops and beach events synced from
 * Facebook, near the end of the homepage. The full feed lives on Facebook.
 * Features:
 * - Relative time stamps ("2 days ago", "Yesterday")
 * - 1-Click "Add to Order" integration with cartStore & Messenger
 * - Direct "View on Facebook ↗" links to original post
 * - Sleek card interactions and live sync status indicators
 */

import updatesData from '../data/updates.json';
import { cartStore } from './cartStore.js';
import { escapeHtml, sanitizeUrl, sanitizeImageUrl } from '../utils/sanitize.js';
import { whenNear } from '../utils/whenNear.js';

export function initNewDrops() {
  const container = document.getElementById('new-drops-root');
  if (!container) return;

  // The homepage shows only the newest few; the rest are a tap away on Facebook.
  const LATEST_COUNT = 3;

  // Time-sensitive cards stop showing once they're stale, so a one-day
  // closure notice can't linger on the homepage for weeks.
  const DAY_MS = 24 * 60 * 60 * 1000;
  const ADVISORY_TTL_DAYS = 3;
  const PAST_EVENT_TTL_DAYS = 7;

  function parseDate(str) {
    if (!str) return null;
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  function isAdvisoryItem(item) {
    return item.category === 'event' &&
      (item.badge === '1-Day Advisory' || /\b(advisory|closure|weather)\b/i.test(item.title || ''));
  }

  // Same-day café news ("Full house today") from the sync: shown briefly, never as a drop.
  function isUpdateItem(item) {
    return item.badge === 'Cafe Update';
  }

  function isGiveawayItem(item) {
    return item.category === 'event' &&
      (item.badge === 'Giveaway' || item.badge === 'Winner Awarded' || Boolean(item.winner) || /\b(giveaway|contest|guess)\b/i.test(item.title || ''));
  }

  function isExpired(item) {
    const now = Date.now();
    const anchor = parseDate(item.event_date) || parseDate(item.published_at);
    if (!anchor) return false;
    const ageDays = (now - anchor.getTime()) / DAY_MS;
    if (isAdvisoryItem(item) || isUpdateItem(item)) return ageDays > ADVISORY_TTL_DAYS;
    if (item.category === 'event' && !isGiveawayItem(item) && parseDate(item.event_date)) {
      return ageDays > PAST_EVENT_TTL_DAYS;
    }
    return false;
  }

  const keepItem = (item) => !String(item.id).startsWith('fb_post_') && !isExpired(item);

  let currentItems = (updatesData || []).filter(keepItem);

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
    const publishedAt = (item) => parseDate(item.published_at)?.getTime() || 0;
    const filteredItems = [...currentItems]
      .sort((a, b) => publishedAt(b) - publishedAt(a))
      .slice(0, LATEST_COUNT);

    container.innerHTML = `
      <div class="drops-header-block">
        <h2 class="drops-headline">What's new</h2>
        <p class="drops-subtitle">
          The latest from the kitchen and the shore.
          <a href="https://www.facebook.com/thebaiacafe" target="_blank" rel="noopener" class="drops-more-link">More on Facebook <span aria-hidden="true">&#8599;</span></a>
        </p>
      </div>

      <!-- Drops Cards Carousel Reel Wrapper -->
      <div class="drops-reel-wrapper">
        <div class="drops-cards-grid" id="drops-cards-track">
          ${filteredItems.length === 0 ? `
          <div class="drops-empty-state">
            <h3>Nothing new this week</h3>
            <p>Follow our Facebook page for the next drop.</p>
          </div>
        ` : filteredItems.map((item, index) => {
          const isFood = item.category === 'food';
          const isDrink = item.category === 'drink';
          const isEvent = item.category === 'event';

          const priceNum = item.price ? parseInt(item.price.replace(/[^\d]/g, ''), 10) : 0;
          const timeAgo = formatTimeAgo(item.published_at);

          // Event sub-types (strictly scoped to events)
          const isGiveaway = isGiveawayItem(item);
          const eventDate = parseDate(item.event_date);
          const isDatePast = Boolean(eventDate && eventDate < new Date());
          const isUpcomingEvent = Boolean(eventDate && !isDatePast);
          const isGiveawayConcluded = isGiveaway && (item.status === 'concluded' || Boolean(item.winner) || item.badge === 'Winner Awarded' || isDatePast);
          const isAdvisory = !isGiveaway && isAdvisoryItem(item);

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
            } else if (isUpdateItem(item)) {
              badgeClass = 'badge-advisory';
              badgeLabel = 'Cafe Update';
              categoryLabel = 'UPDATE';
            } else if (item.badge === 'New at BAIA') {
              badgeClass = 'badge-event';
              badgeLabel = 'New at BAIA';
              categoryLabel = 'NEWS';
            } else {
              badgeClass = 'badge-event';
              badgeLabel = item.badge || 'Live Event';
              categoryLabel = 'EVENT';
            }
          }

          return `
            <article class="drop-card drop-card-${item.category}" style="--stagger-index: ${index};" data-drop-id="${escapeHtml(item.id)}">
              <!-- Visual Media Area -->
              <div class="drop-media-frame">
                <img 
                  src="${sanitizeImageUrl(item.image_url)}" 
                  alt="${escapeHtml(item.title)}" 
                  loading="lazy" 
                  decoding="async" 
                  class="drop-image"
                  data-fallback-src="./images/Baia%20skimboard%20and%20coffee.webp"
                />
                
                <!-- Floating Category & Live Drop Badge -->
                <div class="drop-badge-row">
                  <span class="drop-pill-badge ${badgeClass}">
                    ${escapeHtml(badgeLabel)}
                  </span>
                  <span class="drop-time-pill" title="${escapeHtml(item.published_at)}">
                    ${escapeHtml(timeAgo)}
                  </span>
                </div>

                ${!isEvent && item.price ? `
                  <div class="drop-price-tag">
                    ${escapeHtml(item.price)}
                  </div>
                ` : ''}
              </div>

              <!-- Content Area -->
              <div class="drop-content-body">
                <div class="drop-meta-line">
                  <span class="drop-category-label">${escapeHtml(categoryLabel)}</span>
                  ${(isGiveaway && isGiveawayConcluded) ? `<span class="drop-date-label status-winner">${item.winner ? `Winner: ${escapeHtml(item.winner)}` : 'Winner announced'}</span>` : (item.winner ? `<span class="drop-date-label status-winner">Winner: ${escapeHtml(item.winner)}</span>` : (item.event_date ? `<span class="drop-date-label">${escapeHtml(formatEventDate(item.event_date))}</span>` : (isAdvisory ? `<span class="drop-date-label status-open">Open Regular Hours</span>` : '')))}
                </div>

                <h3 class="drop-card-title">${escapeHtml(item.title)}</h3>
                <p class="drop-card-desc">${escapeHtml(item.description)}</p>

                <!-- Actions Footer -->
                <div class="drop-card-actions">
                  ${!isEvent && priceNum > 0 ? `
                    <button class="btn-drop-order" data-order-drop="${escapeHtml(item.id)}" data-title="${encodeURIComponent(item.title)}" data-price="${priceNum}">
                      <span>Add to order (${escapeHtml(item.price)})</span>
                    </button>
                  ` : (isGiveaway ? `
                    ${isGiveawayConcluded ? `
                      <a href="${sanitizeUrl(item.permalink || 'https://facebook.com/thebaiacafe', 'https://facebook.com/thebaiacafe')}" target="_blank" rel="noopener" class="btn-drop-order btn-drop-winner">
                        <span>View winner</span>
                        <span aria-hidden="true">↗</span>
                      </a>
                    ` : `
                      <a href="${sanitizeUrl(item.permalink || 'https://facebook.com/thebaiacafe', 'https://facebook.com/thebaiacafe')}" target="_blank" rel="noopener" class="btn-drop-order btn-drop-giveaway">
                        <span>Enter giveaway</span>
                        <span aria-hidden="true">→</span>
                      </a>
                    `}
                  ` : (/baia\.cafe\/card/i.test(item.description || '') ? `
                    <a href="/card/" class="btn-drop-order">
                      <span>Get your card</span>
                      <span aria-hidden="true">→</span>
                    </a>
                  ` : (isUpcomingEvent && !isAdvisory ? `
                    <a href="https://m.me/thebaiacafe" target="_blank" rel="noopener" class="btn-drop-order btn-drop-rsvp">
                      <span>RSVP on Messenger</span>
                      <span aria-hidden="true">→</span>
                    </a>
                  ` : `
                    <a href="https://m.me/thebaiacafe" target="_blank" rel="noopener" class="btn-drop-order">
                      <span>Message us</span>
                    </a>
                  `)))}

                  ${item.permalink ? `
                    <a href="${sanitizeUrl(item.permalink, 'https://facebook.com/thebaiacafe')}" target="_blank" rel="noopener" class="btn-drop-fb" title="View original post on Facebook" aria-label="View original Facebook post">
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
      </div>
    `;

    // CSP-safe image fallback (no inline onerror)
    container.querySelectorAll('img[data-fallback-src]').forEach((img) => {
      img.addEventListener('error', () => {
        const fb = img.getAttribute('data-fallback-src');
        if (fb && img.src !== fb && !img.dataset.fbk) {
          img.dataset.fbk = '1';
          img.src = fb;
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

  // 1. Instant Initial Render from cached/bundled updates
  render();

  // 2. Background Real-time Hydration from Supabase drops table
  async function hydrateFromSupabase() {
    try {
      const { supabase } = await import('../lib/supabaseClient.js');
      const { data: dbDrops, error } = await supabase
        .from('drops')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(30);

      if (!error && dbDrops && dbDrops.length > 0) {
        const validDbDrops = dbDrops.filter(keepItem);
        if (validDbDrops.length > 0) {
          // Check if data is different before re-rendering
          const currentIds = currentItems.map(i => i.id).join(',');
          const newIds = validDbDrops.map(i => i.id).join(',');
          if (currentIds !== newIds || validDbDrops.length !== currentItems.length) {
            currentItems = validDbDrops;
            render();
          }
        }
      }
    } catch (e) {
      // Graceful fallback to initial bundled data
    }
  }

  // The Supabase client is ~200 KB; fetch it only as the visitor nears this section.
  whenNear(container, hydrateFromSupabase);
}
