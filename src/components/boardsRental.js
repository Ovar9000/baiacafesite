import { boardsData, cottageData } from '../data/boardsData.js';
import { showShowcaseToast } from './hero3D.js';

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
            <li>Snorkeling Goggles Rental: <strong>₱50.00</strong></li>
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

  // Render Boards Cards
  container.innerHTML = boardsData.map(board => `
    <div class="board-card" data-board-id="${board.id}">
      <div>
        <div class="board-photo-frame">
          <img src="${board.image}" alt="${board.name}" loading="lazy" />
        </div>
        <div class="board-top-row">
          <span class="board-type-tag">${board.type}</span>
          <span class="board-badge">${board.tag}</span>
        </div>
        <h4 class="board-name">${board.name}</h4>
        <p class="board-level">Level: <strong>${board.level}</strong></p>

        <ul class="board-specs-list">
          <li>Length: <strong>${board.length}</strong></li>
          ${board.features.map(f => `<li>${f}</li>`).join('')}
        </ul>
      </div>

      <div>
        <div class="board-pricing-row">
          <div class="price-unit">
            <h3>₱${board.rateHourly}</h3>
            <span>/ hour</span>
          </div>
          <div class="price-unit" style="text-align: right;">
            <h3>₱${board.rateDaily}</h3>
            <span>/ full day</span>
          </div>
        </div>

        <button class="btn-secondary-pill" style="width: 100%; justify-content: center;" onclick="alert('Board rentals are available walk-in or via Instagram inquiry @thebaiacafe 🏄‍♂️');">
          Inquire at Cafe Counter
        </button>
      </div>
    </div>
  `).join('');
}
