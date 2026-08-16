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

  if (!panel) return;

  // Open / Close Handlers
  closeBtn?.addEventListener('click', () => cartStore.closeDrawer());
  backdrop?.addEventListener('click', () => cartStore.closeDrawer());

  // Global triggers for opening cart drawer
  document.querySelectorAll('[data-open-cart]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      cartStore.openDrawer();
    });
  });

  // Delivery spot buttons
  spotButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      spotButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      cartStore.shoreSpot = btn.dataset.spot;
      cartStore.showToast('Delivery Spot Updated', `Delivering to ${cartStore.shoreSpot}`, '📍');
    });
  });

  // Checkout Button
  checkoutBtn?.addEventListener('click', () => {
    const totals = cartStore.getTotals();
    if (totals.itemCount === 0) {
      cartStore.showToast('Cart is Empty', 'Add your favorite coffee or burger first!', 'ℹ️');
      return;
    }

    // Show Confirmation Modal
    showCheckoutModal(totals);
  });

  // Re-render when store updates
  cartStore.subscribe((store) => {
    // Drawer open/close state
    if (store.isDrawerOpen) {
      backdrop?.classList.add('active');
      panel?.classList.add('open');
    } else {
      backdrop?.classList.remove('active');
      panel?.classList.remove('open');
    }

    // Update count badges
    const totalCount = store.getItemCount();
    countTags.forEach(tag => {
      tag.textContent = totalCount;
    });

    // Update totals
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

    // Render Items
    renderItems(store);
  });

  function renderItems(store) {
    if (!itemsContainer) return;

    if (store.items.length === 0) {
      itemsContainer.innerHTML = `
        <div class="empty-cart-state">
          <div class="empty-cart-icon">☕</div>
          <h4>Your Shore Bag is Empty</h4>
          <p>Explore our drinks and food menu to fuel your beach session!</p>
          <button class="btn-story-pill" style="margin-top: 10px;" onclick="document.getElementById('menu').scrollIntoView({behavior:'smooth'});">
            View BAIA Menu
          </button>
        </div>
      `;
      return;
    }

    itemsContainer.innerHTML = store.items.map(item => {
      const metaParts = [];
      if (item.temp) metaParts.push(item.temp);
      if (item.size) metaParts.push(`Size ${item.size}`);
      if (item.isBundle) metaParts.push('Beachside Combo Special (Save ₱85)');

      return `
        <div class="cart-item-card" data-key="${item.key}">
          <div class="cart-item-top">
            <div>
              <h5 class="cart-item-name">${item.name}</h5>
              ${metaParts.length > 0 ? `<div class="cart-item-meta">${metaParts.join(' • ')}</div>` : ''}
            </div>
            <div class="cart-item-price">${store.formatCurrency(item.unitPrice * item.quantity)}</div>
          </div>

          <div class="cart-item-bottom">
            <div class="quantity-stepper">
              <button class="btn-step" data-action="decrease" data-key="${item.key}">−</button>
              <span class="step-count">${item.quantity}</span>
              <button class="btn-step" data-action="increase" data-key="${item.key}">+</button>
            </div>
            <button class="btn-item-remove" data-key="${item.key}">Remove</button>
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
    const modal = document.getElementById('checkout-success-modal');
    if (!modal) return;

    const orderNum = Math.floor(1000 + Math.random() * 9000);
    const modalContent = document.getElementById('checkout-modal-details');
    if (modalContent) {
      modalContent.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="font-size: 3.2rem; margin-bottom: 8px;">🏄‍♂️⚡</div>
          <h4 style="font-family: var(--font-display); font-size: 1.5rem; font-weight: 900; color: var(--deep-navy);">
            Order #${orderNum} Confirmed!
          </h4>
          <p style="font-size: 0.9rem; color: #475569; margin-top: 4px;">
            Delivering right to <strong>${cartStore.shoreSpot}</strong>
          </p>
        </div>

        <div style="background: var(--sand-light); border-radius: var(--radius-md); padding: 16px; margin-bottom: 20px; font-family: var(--font-mono); font-size: 0.85rem;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-weight: 700;">
            <span>${totals.itemCount} Items</span>
            <span>${cartStore.formatCurrency(totals.grandTotal)}</span>
          </div>
          <div style="color: #64748b; font-size: 0.75rem;">
            Estimated Shore Delivery: <strong>10–15 mins</strong>
          </div>
        </div>

        <button class="btn-primary-glow" style="width: 100%; justify-content: center;" id="modal-close-done-btn">
          Back to Bay
        </button>
      `;
    }

    cartStore.closeDrawer();
    modal.classList.add('active');
    backdrop?.classList.add('active');

    document.getElementById('modal-close-done-btn')?.addEventListener('click', () => {
      modal.classList.remove('active');
      backdrop?.classList.remove('active');
      cartStore.clearCart();
    });
  }
}
