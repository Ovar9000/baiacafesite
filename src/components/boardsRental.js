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
            <a href="https://instagram.com/thebaiacafe" target="_blank" rel="noopener" class="btn-primary-glow">
              <span>Book Cottage via Instagram</span>
              <span>↗</span>
            </a>
            <a href="tel:+639171234567" class="btn-secondary-pill">
              <span>Call BAIA Desk</span>
            </a>
          </div>
        </div>

        <div class="cottage-image-frame">
          <img src="${cottageData.image}" alt="Barangay Laurente Floating Cottage with BAIA Cafe booking partner" />
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
        <button class="btn-primary-glow" style="width: 100%; justify-content: center; padding: 12px 20px; font-size: 0.9rem;" onclick="alert('Skimboards are complimentary and free to use for all BAIA cafe guests! Grab one at the cafe counter 🏄‍♂️');">
          Grab at Cafe Counter
        </button>
      `;
    } else if (item.status === 'soon') {
      pricingBoxHtml = `
        <div class="board-soon-box">
          <span class="soon-badge">✦ Arriving Soon ✦</span>
          <p class="soon-subtext">${item.priceSubtext}</p>
        </div>
      `;
      actionBtnHtml = `
        <a href="https://instagram.com/thebaiacafe" target="_blank" rel="noopener" class="btn-secondary-pill" style="width: 100%; justify-content: center; padding: 12px 20px; font-size: 0.9rem;">
          Inquire @thebaiacafe
        </a>
      `;
    } else {
      // Rental Gear (Snorkeling Mask)
      pricingBoxHtml = `
        <div class="gear-price-row">
          <div class="price-val">₱${item.ratePrice}</div>
          <span class="price-sub">${item.priceSubtext}</span>
        </div>
      `;
      actionBtnHtml = `
        <button class="btn-primary-glow" style="width: 100%; justify-content: center; padding: 12px 20px; font-size: 0.9rem;" onclick="alert('Snorkeling masks are available for rent at ₱50 at the BAIA Cafe counter 🤿');">
          Rent at Counter (₱50)
        </button>
      `;
    }

    return `
      <div class="board-card" data-board-id="${item.id}">
        <div>
          <div class="board-photo-frame">
            <img src="${item.image}" alt="${item.name}" loading="lazy" />
          </div>
          <div class="board-top-row">
            <span class="board-type-tag">${item.type}</span>
            <span class="board-badge" style="${item.isFree ? 'background: #10B981; color: #fff;' : (item.status === 'soon' ? 'background: var(--golden-amber); color: var(--deep-navy);' : 'background: var(--electric-blue); color: #fff;')}">${item.tag}</span>
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
