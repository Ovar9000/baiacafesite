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
    this.showToast('Added to Order List', `${item.name}${customizationNote} (${this.formatCurrency(price)})`, '✓');
    this.openDrawer();
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
    this.showToast('Shore Pairing Added', 'Smash Burger, Sea Salt Latte & Fries added (₱565)', '✓');
    this.openDrawer();
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

  showToast(title, message, icon = '✓') {
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    const safeIcon = ['✓', '!', '×'].includes(icon) ? icon : '✓';
    const toast = {
      id: Date.now() + Math.random(),
      title,
      message,
      icon: safeIcon
    };
    this.toasts.push(toast);

    const toastContainer = document.getElementById('toast-container');
    if (toastContainer) {
      const toastEl = document.createElement('div');
      toastEl.className = 'toast-item';
      toastEl.setAttribute('role', 'alert');
      toastEl.innerHTML = `
        <div class="toast-icon" aria-hidden="true">${esc(safeIcon)}</div>
        <div class="toast-content">
          <h4>${esc(title)}</h4>
          <p>${esc(message)}</p>
        </div>
      `;
      toastContainer.appendChild(toastEl);

      setTimeout(() => {
        toastEl.style.opacity = '0';
        toastEl.style.transform = 'translateY(12px)';
        setTimeout(() => toastEl.remove(), 400);
      }, 3500);
    }

    setTimeout(() => {
      this.toasts = this.toasts.filter(t => t.id !== toast.id);
    }, 3500);
  }
}

export const cartStore = new CartStore();
