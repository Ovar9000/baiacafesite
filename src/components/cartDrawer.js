import { cartStore } from './cartStore.js';

export function initCartDrawer() {
  const backdrop = document.getElementById('cart-drawer-backdrop');
  const panel = document.getElementById('cart-drawer-panel');
  const itemsContainer = document.getElementById('drawer-items-list');
  const countTags = document.querySelectorAll('.cart-count-badge, .drawer-count-tag');
  const subtotalEl = document.getElementById('drawer-subtotal');
  const savingsRow = document.getElementById('drawer-savings-row');
  const savingsEl = document.getElementById('drawer-savings');
  const grandTotalEl = document.getElementById('drawer-grand-total');
  const checkoutBtn = document.getElementById('drawer-checkout-btn');
  const closeBtn = document.getElementById('drawer-close-btn');
  const spotButtons = document.querySelectorAll('.spot-btn');
  const clearBtn = document.getElementById('drawer-clear-btn');

  // Ensure initial inert state
  if (panel && !cartStore.isDrawerOpen) {
    panel.setAttribute('inert', '');
  }

  // Open / Close Handlers
  closeBtn?.addEventListener('click', () => cartStore.closeDrawer());
  backdrop?.addEventListener('click', () => cartStore.closeDrawer());

  // Escape key closes drawer
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && cartStore.isDrawerOpen) {
      cartStore.closeDrawer();
    }
  });

  // Global triggers for opening cart drawer
  document.querySelectorAll('[data-open-cart]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      cartStore.openDrawer();
    });
  });

  // Global promo triggers
  document.querySelectorAll('[data-order-bundle="double-trouble"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      cartStore.addDoubleTroubleBundle();
    });
  });

  document.querySelectorAll('[data-order-item="burger-smash"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      cartStore.addItem({
        id: 'burger-smash',
        name: 'BAIA Smash Burger',
        price: 230,
        description: 'Crispy double smash patty, cheddar, pickles & fries'
      });
    });
  });

  document.querySelectorAll('[data-order-drinks-filter]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const menuSection = document.getElementById('menu');
      if (menuSection) {
        menuSection.scrollIntoView({ behavior: 'smooth' });
        setTimeout(() => {
          const drinksTab = document.querySelector('.board-tab-btn[data-board="drinks"]');
          drinksTab?.click();
          const sodaBtn = document.querySelector('.category-accordion-btn[data-category-id="fruit-soda"]');
          if (sodaBtn && sodaBtn.getAttribute('aria-expanded') !== 'true') {
            sodaBtn.click();
          }
        }, 400);
      }
    });
  });

  // Order type options (Dine-in, Takeout, Cottage)
  spotButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      spotButtons.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      cartStore.orderType = btn.dataset.spot || 'Dine-In at Cafe';
      cartStore.showToast('Order Type Set', `${cartStore.orderType}`, '📍');
    });
  });

  // Clear Cart Button
  clearBtn?.addEventListener('click', () => {
    if (confirm('Clear all items from your order list?')) {
      cartStore.clearCart();
    }
  });

  // Checkout / Message Order Button
  checkoutBtn?.addEventListener('click', () => {
    const totals = cartStore.getTotals();
    if (totals.itemCount === 0) {
      cartStore.showToast('Order List is Empty', 'Add your favorite coffee or smash burger first!', 'ℹ️');
      return;
    }
    showCheckoutModal(totals);
  });

  // Re-render when store updates
  cartStore.subscribe((store) => {
    if (store.isDrawerOpen) {
      backdrop?.classList.add('active');
      panel?.classList.add('open');
      panel?.removeAttribute('inert');
      setTimeout(() => closeBtn?.focus(), 50);
    } else {
      backdrop?.classList.remove('active');
      panel?.classList.remove('open');
      panel?.setAttribute('inert', '');
    }

    const totalCount = store.getItemCount();
    countTags.forEach(tag => {
      tag.textContent = totalCount;
    });

    const totals = store.getTotals();
    if (subtotalEl) subtotalEl.textContent = store.formatCurrency(totals.subtotal);
    if (grandTotalEl) grandTotalEl.textContent = store.formatCurrency(totals.grandTotal);

    if (savingsRow && savingsEl) {
      if (totals.savings > 0) {
        savingsRow.style.display = 'flex';
        savingsEl.textContent = `-${store.formatCurrency(totals.savings)}`;
      } else {
        savingsRow.style.display = 'none';
      }
    }

    renderItems(store);
  });

  function renderItems(store) {
    if (!itemsContainer) return;

    if (store.items.length === 0) {
      itemsContainer.innerHTML = `
        <div class="empty-cart-state">
          <div class="empty-cart-icon" aria-hidden="true">☕</div>
          <h4>Your Order List is Empty</h4>
          <p>Explore our menu and build your order list to message directly via Facebook Messenger!</p>
          <button class="btn-story-pill" style="margin-top: 14px;" onclick="document.getElementById('menu').scrollIntoView({behavior:'smooth'}); cartStore.closeDrawer();">
            <span>Explore BAIA Menu</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      `;
      return;
    }

    itemsContainer.innerHTML = store.items.map(item => {
      const metaParts = [];
      if (item.temp) metaParts.push(item.temp);
      if (item.size) metaParts.push(`Size ${item.size}`);
      if (item.isBundle) metaParts.push('Popular Shore Pairing');

      return `
        <div class="cart-item-card" data-key="${item.key}">
          <div class="cart-item-top">
            <div>
              <p class="cart-item-name"><strong>${item.name}</strong></p>
              ${metaParts.length > 0 ? `<div class="cart-item-meta">${metaParts.join(' • ')}</div>` : ''}
            </div>
            <div class="cart-item-price">${store.formatCurrency(item.unitPrice * item.quantity)}</div>
          </div>

          <div class="cart-item-bottom">
            <div class="quantity-stepper" role="group" aria-label="Item quantity controls">
              <button class="btn-step" data-action="decrease" data-key="${item.key}" aria-label="Decrease quantity of ${item.name}">−</button>
              <span class="step-count" aria-live="polite">${item.quantity}</span>
              <button class="btn-step" data-action="increase" data-key="${item.key}" aria-label="Increase quantity of ${item.name}">+</button>
            </div>
            <button class="btn-item-remove" data-key="${item.key}" aria-label="Remove ${item.name} from order list">Remove</button>
          </div>
        </div>
      `;
    }).join('');

    // Attach step/remove listeners
    itemsContainer.querySelectorAll('.btn-step').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const delta = btn.dataset.action === 'increase' ? 1 : -1;
        cartStore.updateQuantity(key, delta);
      });
    });

    itemsContainer.querySelectorAll('.btn-item-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        cartStore.removeItem(key);
      });
    });
  }

  function showCheckoutModal(totals) {
    let modal = document.getElementById('checkout-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'checkout-modal';
      modal.className = 'modal-backdrop';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'checkout-modal-title');
      document.body.appendChild(modal);
    }

    const orderMsg = cartStore.generateOrderMessage();

    modal.innerHTML = `
      <div class="modal-dialog-card">
        <div class="modal-header">
          <div class="modal-badge">💬 Fast Dispatch via Messenger</div>
          <h3 id="checkout-modal-title" style="font-family: var(--font-display); font-size: 1.35rem; color: var(--deep-navy); margin-top: 6px;">
            Send Order to BAIA Cafe
          </h3>
        </div>

        <div class="modal-body-content">
          <div class="order-summary-box">
            <div class="summary-spot-line">
              <span>📍 Order Type:</span>
              <strong>${cartStore.orderType}</strong>
            </div>
            <div class="summary-items-list">
              ${cartStore.items.map(i => `
                <div class="summary-item-row">
                  <span>${i.quantity}x ${i.name}</span>
                  <span>${cartStore.formatCurrency(i.unitPrice * i.quantity)}</span>
                </div>
              `).join('')}
            </div>
            ${totals.savings > 0 ? `
              <div class="summary-savings-row">
                <span>Bundle Savings:</span>
                <span>-${cartStore.formatCurrency(totals.savings)}</span>
              </div>
            ` : ''}
            <div class="summary-total-row">
              <span>Estimated Total:</span>
              <strong>${cartStore.formatCurrency(totals.grandTotal)}</strong>
            </div>
          </div>

          <p style="font-size: 0.85rem; color: #475569; line-height: 1.45; margin: 12px 0;">
            All orders &amp; pickups are prioritized via <strong>Facebook Messenger</strong>. Click below to copy your order and chat directly with our counter team!
          </p>

          <div class="modal-action-buttons">
            <a href="https://m.me/thebaiacafe" target="_blank" rel="noopener" class="btn-primary-glow modal-btn send-fb-btn" style="justify-content: center; width: 100%; background: #0084FF; color: #FFFFFF; font-weight: 800; box-shadow: 0 4px 14px rgba(0, 132, 255, 0.4);">
              <span>💬 Send via Facebook Messenger (Recommended)</span>
              <span aria-hidden="true">↗</span>
            </a>
            <a href="https://instagram.com/thebaiacafe" target="_blank" rel="noopener" class="btn-secondary-pill modal-btn send-ig-btn" style="justify-content: center; width: 100%; border-color: #cbd5e1; color: #475569; font-size: 0.88rem;">
              <span>📸 Or Message via Instagram DM</span>
              <span aria-hidden="true">↗</span>
            </a>
            <button class="btn-secondary-pill modal-btn copy-order-btn" style="justify-content: center; width: 100%; border-color: var(--deep-navy); color: var(--deep-navy);">
              <span>📋 Copy Order Text</span>
            </button>
            <a href="tel:+639171234567" class="btn-secondary-pill modal-btn" style="justify-content: center; width: 100%; border-color: #94a3b8; color: #475569; font-size: 0.85rem;">
              <span>📞 Call Counter (+63 917 123 4567)</span>
            </a>
            <button class="btn-close-modal" id="close-checkout-modal-btn">Back to Edit</button>
          </div>
        </div>
      </div>
    `;

    modal.classList.add('active');

    // Clipboard copy helper
    const copyToClipboard = () => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(orderMsg);
        cartStore.showToast('Order Copied! 📋', 'Paste directly into Facebook Messenger or Instagram chat', '💬');
      }
    };

    modal.querySelector('.send-fb-btn')?.addEventListener('click', copyToClipboard);
    modal.querySelector('.send-ig-btn')?.addEventListener('click', copyToClipboard);
    modal.querySelector('.copy-order-btn')?.addEventListener('click', copyToClipboard);

    document.getElementById('close-checkout-modal-btn')?.addEventListener('click', () => {
      modal.classList.remove('active');
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
  }
}
