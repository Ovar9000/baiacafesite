import { boardsData, cottageData } from '../data/boardsData.js';

export function initBoardsRental() {
  const container = document.getElementById('boards-grid-root');
  const cottageContainer = document.getElementById('cottage-showcase-root');
  if (!container) return;

  // Render Floating Cottage Showcase Card
  if (cottageContainer) {
    cottageContainer.innerHTML = `
      <div class="cottage-showcase-box">
        <div>
          <span class="cottage-badge-tag">🌊 Official Booking Partner</span>
          <h3 class="cottage-title">${cottageData.title}</h3>
          <p class="cottage-partner">${cottageData.subtitle} • Operating ${cottageData.hours}</p>

          <div class="cottage-rates-grid">
            ${cottageData.rates.map(r => `
              <div class="rate-box">
                <div class="rate-group-title">${r.group} (${r.capacity})</div>
                <div class="rate-amount">₱${r.price.toLocaleString()}</div>
                <div class="rate-cap">${r.badge}</div>
              </div>
            `).join('')}
          </div>

          <ul class="cottage-perks-list">
            ${cottageData.features.map(f => `<li>${f}</li>`).join('')}
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
            src="${cottageData.image}" 
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

  // Render Gear & Boards Cards (Free Skimboard, ₱50 Mask, Soon Surfboard)
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
        <button class="btn-primary-glow" style="width: 100%; justify-content: center; padding: 12px 20px; font-size: 0.9rem;" onclick="alert('Skimboards are complimentary and free to use for all BAIA cafe guests! Grab one at the cafe counter.');">
          Grab at Cafe Counter
        </button>
      `;
    } else if (item.status === 'soon') {
      pricingBoxHtml = `
        <div class="board-soon-box">
          <span class="soon-badge">Arriving Soon</span>
          <p class="soon-subtext">${item.priceSubtext}</p>
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
          <div class="price-val">₱${item.ratePrice}</div>
          <span class="price-sub">${item.priceSubtext}</span>
        </div>
      `;
      actionBtnHtml = `
        <button class="btn-primary-glow" style="width: 100%; justify-content: center; padding: 12px 20px; font-size: 0.9rem;" onclick="alert('Snorkeling masks are available for rent at ₱50 at the BAIA Cafe counter.');">
          Rent at Counter (₱50)
        </button>
      `;
    }

    return `
      <div class="board-card" data-board-id="${item.id}">
        <div>
          <div class="board-photo-frame">
            <img src="${item.image}" alt="${item.name}" width="900" height="1200" loading="lazy" decoding="async" />
          </div>
          <div class="board-top-row">
            <span class="board-type-tag">${item.type}</span>
            <span class="board-badge" style="${item.isFree ? 'background: #064e3b; color: #6ee7b7; border: 1px solid #059669;' : (item.status === 'soon' ? 'background: #78350f; color: #fde68a; border: 1px solid #d97706;' : 'background: #1e3a8a; color: #93c5fd; border: 1px solid #3b82f6;')}">${item.tag}</span>
          </div>
          <h4 class="board-name">${item.name}</h4>
          <p class="board-level">Specification: <strong>${item.level}</strong></p>

          <ul class="board-specs-list">
            <li>Length / Fit: <strong>${item.length}</strong></li>
            ${item.features.map(f => `<li>${f}</li>`).join('')}
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
