import { boardsData, cottageData } from '../data/boardsData.js';

const escBoards = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const safeImgBoards = (u, fb = './images/Baia%20skimboard%20and%20coffee.webp') => {
  if (typeof u !== 'string') return fb;
  const t = u.trim();
  if (t.startsWith('/') || t.startsWith('./') || t.startsWith('images/')) return t;
  return t.startsWith('https://') ? t : fb;
};

export function initBoardsRental() {
  const container = document.getElementById('boards-grid-root');
  const cottageContainer = document.getElementById('cottage-showcase-root');
  if (!container) return;

  // Render Floating Cottage Showcase Card if empty
  if (cottageContainer && cottageContainer.children.length === 0) {
    cottageContainer.innerHTML = `
      <div class="cottage-showcase-box">
        <div>
          <span class="cottage-badge-tag">Official Booking Partner</span>
          <h3 class="cottage-title">${escBoards(cottageData.title)}</h3>
          <p class="cottage-partner">${escBoards(cottageData.subtitle)} • Operating ${escBoards(cottageData.hours)}</p>

          <div class="cottage-rates-grid">
            ${cottageData.rates.map(r => `
              <div class="rate-box">
                <div class="rate-group-title">${escBoards(r.group)} (${escBoards(r.capacity)})</div>
                <div class="rate-amount">₱${Number(r.price).toLocaleString()}</div>
                <div class="rate-cap">${escBoards(r.badge)}</div>
              </div>
            `).join('')}
          </div>

          <ul class="cottage-perks-list">
            ${cottageData.features.map(f => `<li>${escBoards(f)}</li>`).join('')}
            <li>Snorkeling Mask Rental: <strong>₱50.00</strong></li>
          </ul>

          <div class="cottage-actions">
            <a href="https://m.me/thebaiacafe" target="_blank" rel="noopener" class="btn-primary-glow" style="background: #0084FF;">
              <span>Book via Facebook Messenger</span>
              <span aria-hidden="true">↗</span>
            </a>
            <a href="https://instagram.com/thebaiacafe" target="_blank" rel="noopener" class="btn-secondary-pill">
              <span>View Photos @thebaiacafe</span>
            </a>
          </div>
        </div>

        <div class="cottage-image-frame">
          <img 
            src="${safeImgBoards(cottageData.image)}" 
            alt="Barangay Laurente Floating Cottage with BAIA Cafe booking partner" 
            width="1200" 
            height="630" 
            loading="lazy" 
            decoding="async" 
          />
        </div>
      </div>
    `;
  }

  // Render Gear & Boards Cards (Free Skimboard, ₱50 Mask, Soon Surfboard) if empty
  if (container && container.children.length === 0) {
    container.innerHTML = boardsData.map(item => {
    let actionBtnHtml = '';
    let pricingBoxHtml = '';

    if (item.isFree) {
      pricingBoxHtml = `
        <div class="gear-price-row free-row">
          <div class="price-val-free">FREE</div>
          <span class="price-sub-free">Complimentary for Cafe Guests</span>
        </div>
      `;
      actionBtnHtml = `
        <button type="button" class="btn-primary-glow" style="width: 100%; justify-content: center; padding: 12px 20px; font-size: 0.9rem;" data-board-alert="skim">
          Grab at Cafe Counter
        </button>
      `;
    } else if (item.status === 'soon') {
      pricingBoxHtml = `
        <div class="board-soon-box">
          <span class="soon-badge">Arriving Soon</span>
          <p class="soon-subtext">${escBoards(item.priceSubtext)}</p>
        </div>
      `;
      actionBtnHtml = `
        <a href="https://m.me/thebaiacafe" target="_blank" rel="noopener" class="btn-secondary-pill" style="width: 100%; justify-content: center; padding: 12px 20px; font-size: 0.9rem;">
          Inquire via Facebook Messenger
        </a>
      `;
    } else {
      pricingBoxHtml = `
        <div class="gear-price-row">
          <div class="price-val">₱${escBoards(item.ratePrice)}</div>
          <span class="price-sub">${escBoards(item.priceSubtext)}</span>
        </div>
      `;
      actionBtnHtml = `
        <button type="button" class="btn-primary-glow" style="width: 100%; justify-content: center; padding: 12px 20px; font-size: 0.9rem;" data-board-alert="mask">
          Rent at Counter (₱50)
        </button>
      `;
    }

    return `
      <div class="board-card" data-board-id="${escBoards(item.id)}">
        <div>
          <div class="board-photo-frame">
            <img src="${safeImgBoards(item.image)}" alt="${escBoards(item.name)}" width="900" height="1200" loading="lazy" decoding="async" />
          </div>
          <div class="board-top-row">
            <span class="board-type-tag">${escBoards(item.type)}</span>
            <span class="board-badge" style="${item.isFree ? 'background: #064e3b; color: #6ee7b7; border: 1px solid #059669;' : (item.status === 'soon' ? 'background: #78350f; color: #fde68a; border: 1px solid #d97706;' : 'background: #1e3a8a; color: #93c5fd; border: 1px solid #3b82f6;')}">${escBoards(item.tag)}</span>
          </div>
          <h4 class="board-name">${escBoards(item.name)}</h4>
          <p class="board-level">Specification: <strong>${escBoards(item.level)}</strong></p>

          <ul class="board-specs-list">
            <li>Length / Fit: <strong>${escBoards(item.length)}</strong></li>
            ${item.features.map(f => `<li>${escBoards(f)}</li>`).join('')}
          </ul>
        </div>

        <div>
          ${pricingBoxHtml}
          ${actionBtnHtml}
        </div>
      </div>
    `;
  }).join('');
  }

  // CSP-safe click handlers (no inline onclick)
  container.querySelectorAll('[data-board-alert]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.getAttribute('data-board-alert');
      alert(
        kind === 'mask'
          ? 'Snorkeling masks are available for rent at ₱50 at the BAIA Cafe counter.'
          : 'Skimboards are complimentary and free to use for all BAIA cafe guests! Grab one at the cafe counter.'
      );
    });
  });
}
