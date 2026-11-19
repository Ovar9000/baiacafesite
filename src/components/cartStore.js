import { calculateDeliveryFee, getDeliveryZone } from '../data/deliveryZones.js';

class CartStore {
  constructor() {
    this.items = [];
    this.isDrawerOpen = false;
    this.orderType = 'Dine-In at Cafe';
    this.customerName = '';
    this.customerNotes = '';
    this.delivery = { zoneId: '', landmark: '', directions: '' };
    this.listeners = new Set();
    this.toasts = [];
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach(fn => fn(this));
  }

  openDrawer() {
    this.isDrawerOpen = true;
    this.notify();
  }

  closeDrawer() {
    this.isDrawerOpen = false;
    this.notify();
  }

  toggleDrawer() {
    this.isDrawerOpen = !this.isDrawerOpen;
    this.notify();
  }

  getItemKey(item) {
    const sizeStr = item.size || 'std';
    const tempStr = item.temp || 'std';
    const addOnIds = (item.addOns || []).map(a => a.id).sort().join(',');
    return `${item.id}-${sizeStr}-${tempStr}-${addOnIds}`;
  }

  addItem(item) {
    const key = this.getItemKey(item);
    const existingIndex = this.items.findIndex(i => i.key === key);
    const basePrice = item.price || item.priceM || 0;
    const addOnsTotal = (item.addOns || []).reduce((sum, a) => sum + (a.price || 0), 0);
    const price = item.calculatedPrice !== undefined ? item.calculatedPrice : (basePrice + addOnsTotal);

    if (existingIndex > -1) {
      this.items[existingIndex].quantity += (item.quantity || 1);
    } else {
      this.items.push({
        ...item,
        basePrice,
        addOns: item.addOns ? [...item.addOns] : [],
        key,
        quantity: item.quantity || 1,
        unitPrice: price
      });
    }

    const customizationNote = (item.addOns && item.addOns.length > 0) ? ` (+${item.addOns.length} add-on${item.addOns.length > 1 ? 's' : ''})` : '';
    // Stay on the menu: people often add several things in a row, so the
    // order sheet opens only when they ask for it (the View button or My Order)
    this.showToast('Added to your order', `${item.name}${customizationNote} · ${this.formatCurrency(price)}`, '✓', this.viewOrderAction());
    this.notify();
  }

  viewOrderAction() {
    return { label: 'View', onClick: () => this.openDrawer() };
  }

  toggleItemAddOn(key, addOn) {
    const itemIndex = this.items.findIndex(i => i.key === key);
    if (itemIndex === -1) return;

    const item = this.items[itemIndex];
    let newAddOns = [...(item.addOns || [])];
    const exists = newAddOns.some(a => a.id === addOn.id);

    if (exists) {
      newAddOns = newAddOns.filter(a => a.id !== addOn.id);
    } else {
      newAddOns.push(addOn);
    }

    const basePrice = item.basePrice || item.price || item.priceM || 0;
    const addOnsTotal = newAddOns.reduce((sum, a) => sum + (a.price || 0), 0);
    const newPrice = basePrice + addOnsTotal;

    const updatedItem = {
      ...item,
      basePrice,
      addOns: newAddOns,
      unitPrice: newPrice
    };
    updatedItem.key = this.getItemKey(updatedItem);

    // If an item with the new key already exists, merge them
    const conflictIndex = this.items.findIndex((it, idx) => idx !== itemIndex && it.key === updatedItem.key);
    if (conflictIndex > -1) {
      this.items[conflictIndex].quantity += item.quantity;
      this.items.splice(itemIndex, 1);
    } else {
      this.items[itemIndex] = updatedItem;
    }

    this.notify();
  }

  addDoubleTroubleBundle() {
    const pairingItems = [
      {
        id: 'burger-smash',
        name: 'BAIA Smash Burger',
        price: 230,
        description: 'Crispy double smash patty, cheddar, pickles & fries'
      },
      {
        id: 'special-seasalt',
        name: 'Sea Salt Latte',
        price: 180,
        temp: 'Iced',
        isDrink: true,
        description: 'Smooth iced latte crowned with savory sea salt foam'
      },
      {
        id: 'fries-chilibbq',
        name: 'Chili BBQ Fries',
        price: 155,
        description: 'Spicy kick BBQ seasoned fries'
      }
    ];

    pairingItems.forEach(item => {
      const key = this.getItemKey(item);
      const existingIndex = this.items.findIndex(i => i.key === key);
      const basePrice = item.price;
      if (existingIndex > -1) {
        this.items[existingIndex].quantity += 1;
      } else {
        this.items.push({
          ...item,
          basePrice,
          addOns: [],
          key,
          quantity: 1,
          unitPrice: basePrice
        });
      }
    });

    this.notify();
    this.showToast('Shore pairing added', 'Smash Burger, Sea Salt Latte & Fries · ₱565', '✓', this.viewOrderAction());
  }

  updateQuantity(key, delta) {
    const index = this.items.findIndex(i => i.key === key);
    if (index > -1) {
      this.items[index].quantity += delta;
      if (this.items[index].quantity <= 0) {
        this.items.splice(index, 1);
      }
      this.notify();
    }
  }

  removeItem(key) {
    this.items = this.items.filter(i => i.key !== key);
    this.notify();
  }

  clearCart() {
    this.items = [];
    this.notify();
  }

  getItemCount() {
    return this.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  isDelivery() {
    return this.orderType === 'Delivery';
  }

  setDelivery(patch) {
    this.delivery = { ...this.delivery, ...(patch || {}) };
    this.notify();
  }

  clearDelivery() {
    this.delivery = { zoneId: '', landmark: '', directions: '' };
    this.notify();
  }

  getDeliveryFee() {
    if (!this.isDelivery()) return 0;
    return calculateDeliveryFee(this.delivery.zoneId, this.getItemCount());
  }

  getTotals() {
    let subtotal = 0;
    let savings = 0;

    this.items.forEach(item => {
      subtotal += item.unitPrice * item.quantity;
      if (item.isBundle && item.discount) {
        savings += item.discount * item.quantity;
      }
    });

    const deliveryFee = this.getDeliveryFee();
    const grandTotal = subtotal + deliveryFee;

    return {
      subtotal,
      savings,
      deliveryFee,
      grandTotal,
      itemCount: this.getItemCount()
    };
  }

  generateOrderMessage() {
    if (this.items.length === 0) return '';
    const totals = this.getTotals();
    const itemLines = this.items.map(i => {
      const meta = [];
      if (i.temp) meta.push(i.temp);
      if (i.size) meta.push(`Size ${i.size}`);
      if (i.addOns && i.addOns.length > 0) {
        i.addOns.forEach(a => meta.push(`+ ${a.name}`));
      }
      const metaStr = meta.length > 0 ? ` (${meta.join(', ')})` : '';
      return `• ${i.quantity}x ${i.name}${metaStr} — ${this.formatCurrency(i.unitPrice * i.quantity)}`;
    });

    if (this.isDelivery()) {
      const zone = getDeliveryZone(this.delivery.zoneId);
      const zoneName = zone ? zone.name : 'Delivery Area';
      const landmark = (this.delivery.landmark || '').trim();
      const directions = (this.delivery.directions || '').trim();
      const location = landmark ? `Near ${landmark} — ${directions}` : directions;
      const lines = [
        'Hi BAIA Cafe, I would like to place an order for delivery via Messenger:',
        '',
        ...itemLines,
        '',
        `Subtotal: ${this.formatCurrency(totals.subtotal)}`,
        `Delivery Fee (${zoneName}): ${this.formatCurrency(totals.deliveryFee)}`,
        `Estimated Total: ${this.formatCurrency(totals.grandTotal)}`,
        'Order Type: Delivery',
        `Delivery Zone: ${zoneName}`,
        `Delivery Location: ${location}`,
        '',
        'Thank you!'
      ].filter(Boolean);
      return lines.join('\n');
    }

    const lines = [
      'Hi BAIA Cafe, I would like to place an order ahead via Messenger:',
      '',
      ...itemLines,
      '',
      totals.savings > 0 ? `Bundle Savings: -${this.formatCurrency(totals.savings)}` : null,
      `Estimated Total: ${this.formatCurrency(totals.grandTotal)}`,
      `Order Type: ${this.orderType}`,
      '',
      'Thank you!'
    ].filter(Boolean);

    return lines.join('\n');
  }

  formatCurrency(val) {
    return `₱${val.toLocaleString()}`;
  }

  /**
   * Shows a banner at the top. `action` ({ label, onClick }) adds a button,
   * e.g. View to open the order sheet.
   */
  showToast(title, message, icon = '✓', action = null) {
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    const safeIcon = ['✓', '!', '×'].includes(icon) ? icon : '✓';
    const toast = {
      id: Date.now() + Math.random(),
      title,
      message,
      icon: safeIcon
    };
    // Not while a modal dialog is up: the page behind it is inert, so the
    // banner would be missed. Show it once that dialog closes (e.g. "Added to
    // your order" after the drink options sheet).
    const openDialog = document.querySelector('dialog:modal');
    if (openDialog) {
      openDialog.addEventListener('close', () => this.showToast(title, message, icon, action), { once: true });
      return;
    }

    this.toasts.push(toast);

    // The container is a popover="manual" region (index.html): top layer,
    // no light dismiss, one place for every banner
    const toastContainer = document.getElementById('toast-container');
    if (toastContainer) {
      const returnFocus = document.activeElement;
      const toastEl = document.createElement('div');
      toastEl.className = safeIcon === '✓' ? 'toast-item' : 'toast-item is-warning';
      toastEl.innerHTML = `
        <div class="toast-icon" aria-hidden="true">${esc(safeIcon)}</div>
        <div class="toast-content">
          <h4>${esc(title)}</h4>
          <p>${esc(message)}</p>
        </div>
        ${action ? `<button type="button" class="toast-action">${esc(action.label)}</button>` : ''}
        <button type="button" class="toast-close" aria-label="Dismiss">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      `;

      let timer = 0;
      const dismiss = ({ moveFocus = false } = {}) => {
        clearTimeout(timer);
        if (!toastEl.isConnected) return;
        // Dismissed from the keyboard: focus goes to the next banner, or back
        if (moveFocus) {
          const next = [...toastContainer.children].find((el) => el !== toastEl);
          (next?.querySelector('.toast-close') || (returnFocus?.isConnected ? returnFocus : null))?.focus();
        }
        toastEl.classList.add('is-leaving');
        const done = () => {
          toastEl.remove();
          this.toasts = this.toasts.filter(t => t.id !== toast.id);
          if (!toastContainer.children.length && toastContainer.matches(':popover-open')) {
            toastContainer.hidePopover();
          }
        };
        const leaving = toastEl.getAnimations();
        if (leaving.length) Promise.allSettled(leaving.map((a) => a.finished)).then(done);
        else done();
      };
      // Time out, but never while focus is on one of its buttons
      const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (toastEl.contains(document.activeElement)) return;
          dismiss();
        }, 4000);
      };
      toastEl.addEventListener('focusout', (e) => {
        if (!toastEl.contains(e.relatedTarget)) schedule();
      });

      toastEl.querySelector('.toast-close').addEventListener('click', () => dismiss({ moveFocus: true }));
      if (action) {
        toastEl.querySelector('.toast-action').addEventListener('click', () => {
          action.onClick();
          dismiss();
        });
      }

      // Adding several things in a row: keep at most two banners on screen
      while (toastContainer.children.length >= 2) toastContainer.firstElementChild.remove();
      toastContainer.appendChild(toastEl);
      if (toastContainer.popover && !toastContainer.matches(':popover-open')) {
        toastContainer.showPopover();
      }
      schedule();

      // Read it out: the visible text only, plus a hint when there's a button
      const spoken = `${title}. ${message}${action ? '. Actions available.' : ''}`;
      if (typeof document.ariaNotify === 'function') {
        document.ariaNotify(spoken);
      } else {
        const announcer = document.getElementById('toast-announcer');
        if (announcer) {
          announcer.textContent = '';
          requestAnimationFrame(() => { announcer.textContent = spoken; });
        }
      }
    }
  }
}

export const cartStore = new CartStore();
