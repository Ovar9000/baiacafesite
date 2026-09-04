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
      cartStore.showToast('Order Type Set', `${cartStore.orderType}`);
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
      cartStore.showToast('Order List is Empty', 'Add your favorite coffee or smash burger first.');
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
          <div class="empty-cart-icon" aria-hidden="true">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 8h1a4 4 0 1 1 0 8h-1"></path>
              <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"></path>
              <line x1="6" y1="2" x2="6" y2="4"></line>
              <line x1="10" y1="2" x2="10" y2="4"></line>
              <line x1="14" y1="2" x2="14" y2="4"></line>
            </svg>
          </div>
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
    const encodedOrder = encodeURIComponent(orderMsg);
    const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
    const messengerUrl = isMobile 
      ? `https://m.me/thebaiacafe?text=${encodedOrder}` 
      : `https://www.facebook.com/messages/t/thebaiacafe?text=${encodedOrder}`;

    modal.innerHTML = `
      <div class="modal-dialog-card">
        <div class="modal-header" style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;">
          <div>
            <div class="modal-badge">Direct Dispatch via Messenger</div>
            <h3 id="checkout-modal-title" style="font-family: var(--font-display); font-size: 1.3rem; color: var(--deep-navy); margin: 6px 0 2px;">
              Send Order to BAIA Cafe
            </h3>
            <p style="font-size: 0.8rem; color: #64748b; margin: 0;">
              Pickups &amp; dine-in orders are confirmed via Messenger.
            </p>
          </div>
          <button type="button" class="btn-archive-close modal-dialog-close-btn" id="modal-top-close-btn" aria-label="Close checkout modal">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div class="modal-body-content">
          <div class="order-summary-box">
            <div class="summary-spot-line">
              <span>Order Type:</span>
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

          <!-- Step Guidance for Web & Mobile Clarity -->
          <div class="order-dispatch-guide-strip">
            <div class="dispatch-step-item">
              <span class="step-num">1</span>
              <span>Tap <strong>Open Messenger</strong> (automatically copies your order)</span>
            </div>
            <div class="dispatch-step-item">
              <span class="step-num">2</span>
              <span>In Messenger chat, press <strong style="color: #1E4AFF; background: #DBEAFE; padding: 2px 6px; border-radius: 4px; font-family: var(--font-mono);">Ctrl + V</strong> (Paste) &amp; Send!</span>
            </div>
          </div>

          <!-- Live Order Text Preview Box for Web & Desktop Transparency -->
          <div style="margin: 10px 0 4px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-size: 0.75rem; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">
                Order Message Preview
              </span>
              <span style="font-size: 0.72rem; color: #94a3b8;">Click to copy manually</span>
            </div>
            <div class="order-message-preview" id="order-msg-preview-box" title="Click to copy order text" style="cursor: pointer;">${orderMsg}</div>
          </div>

          <div class="modal-action-buttons">
            <button 
              type="button"
              class="btn-primary-glow modal-btn send-fb-btn" 
              id="modal-send-fb-btn"
              style="justify-content: center; width: 100%; background: #0084FF; color: #FFFFFF; font-weight: 800; box-shadow: 0 4px 14px rgba(0, 132, 255, 0.4); border: none; cursor: pointer;"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true" style="display:inline-block; vertical-align: -2px;">
                <path d="M12 2C6.48 2 2 6.03 2 11C2 13.84 3.46 16.34 5.75 17.89V21.5L9.13 19.64C10.04 19.88 11 20 12 20C17.52 20 22 15.97 22 11C22 6.03 17.52 2 12 2ZM13.06 14.5L10.75 12.03L6.25 14.5L11.19 9.25L13.5 11.72L17.75 9.25L13.06 14.5Z" />
              </svg>
              <span id="modal-fb-btn-label">Open Facebook Messenger &amp; Order</span>
              <span aria-hidden="true">↗</span>
            </button>

            <button 
              type="button"
              class="btn-secondary-pill modal-btn copy-order-btn" 
              id="modal-copy-order-btn"
              style="justify-content: center; width: 100%; border-color: var(--deep-navy); color: var(--deep-navy); font-weight: 700;"
            >
              <span>Copy Order Text Only</span>
            </button>
          </div>
        </div>
      </div>
    `;

    modal.classList.add('active');

    // Rock-solid Synchronous Clipboard Copy Helper
    const copyOrderToClipboard = () => {
      let copied = false;
      try {
        const textarea = document.createElement('textarea');
        textarea.value = orderMsg;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        textarea.setAttribute('readonly', '');
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, 99999);
        copied = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch (e) {
        copied = false;
      }

      if (navigator.clipboard && window.isSecureContext) {
        try {
          navigator.clipboard.writeText(orderMsg).catch(() => {});
          copied = true;
        } catch (e) {}
      }
      return copied;
    };

    // Send via FB button handler
    const sendFbBtn = modal.querySelector('#modal-send-fb-btn');
    const fbBtnLabel = modal.querySelector('#modal-fb-btn-label');
    sendFbBtn?.addEventListener('click', () => {
      copyOrderToClipboard();
      if (fbBtnLabel) {
        fbBtnLabel.textContent = '✓ Copied! Opening Messenger (Paste with Ctrl+V)';
        setTimeout(() => {
          fbBtnLabel.textContent = 'Open Facebook Messenger & Order';
        }, 5000);
      }
      cartStore.showToast('Order Copied to Clipboard!', 'Press Ctrl+V (or Paste) in Messenger to send.', '✓');
      window.open(messengerUrl, '_blank', 'noopener,noreferrer');
    });

    // Copy Order Text Only button handler
    const copyBtn = modal.querySelector('#modal-copy-order-btn');
    copyBtn?.addEventListener('click', () => {
      copyOrderToClipboard();
      const labelSpan = copyBtn.querySelector('span');
      if (labelSpan) {
        labelSpan.textContent = '✓ Order Text Copied!';
        copyBtn.style.borderColor = '#15803D';
        copyBtn.style.color = '#15803D';
        setTimeout(() => {
          labelSpan.textContent = 'Copy Order Text Only';
          copyBtn.style.borderColor = 'var(--deep-navy)';
          copyBtn.style.color = 'var(--deep-navy)';
        }, 3000);
      }
      cartStore.showToast('Order Copied!', 'Paste into Messenger or WhatsApp to order.', '✓');
    });

    // Click Preview Box to copy
    const previewBox = modal.querySelector('#order-msg-preview-box');
    previewBox?.addEventListener('click', () => {
      copyOrderToClipboard();
      cartStore.showToast('Order Copied!', 'Order message copied to clipboard.', '✓');
    });

    // Close handlers with smooth exit
    const closeModal = () => {
      modal.classList.remove('active');
    };

    modal.querySelector('#modal-top-close-btn')?.addEventListener('click', closeModal);

    modal.onclick = (e) => {
      if (e.target === modal) {
        closeModal();
      }
    };
  }
}
