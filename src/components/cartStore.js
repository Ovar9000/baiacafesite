class CartStore {
  constructor() {
    this.items = [];
    this.isDrawerOpen = false;
    this.orderType = 'Dine-In at Cafe';
    this.customerName = '';
    this.customerNotes = '';
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
    const price = item.calculatedPrice || item.price || item.priceM || 0;

    if (existingIndex > -1) {
      this.items[existingIndex].quantity += (item.quantity || 1);
    } else {
      this.items.push({
        ...item,
        key,
        quantity: item.quantity || 1,
        unitPrice: price
      });
    }

    this.showToast('Added to Order List', `${item.name} (${this.formatCurrency(price)})`, '☕');
    this.openDrawer();
  }

  addDoubleTroubleBundle() {
    const bundleKey = 'pairing-shore-favorites';
    const existing = this.items.find(i => i.key === bundleKey);
    if (existing) {
      existing.quantity += 1;
    } else {
      this.items.push({
        id: 'pairing-shore-favorites',
        key: bundleKey,
        name: '⚡ Popular Shore Pairing',
        description: 'BAIA Smash Burger + Sea Salt Latte (Iced) + Chili BBQ Fries',
        quantity: 1,
        unitPrice: 565,
        isBundle: true
      });
    }
    this.showToast('Shore Pairing Added!', 'BAIA Smash + Sea Salt Latte + Fries (₱565) added to your order list', '🍔');
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

  getTotals() {
    let subtotal = 0;
    let savings = 0;

    this.items.forEach(item => {
      subtotal += item.unitPrice * item.quantity;
      if (item.isBundle && item.discount) {
        savings += item.discount * item.quantity;
      }
    });

    const grandTotal = subtotal;

    return {
      subtotal,
      savings,
      grandTotal,
      itemCount: this.getItemCount()
    };
  }

  generateOrderMessage() {
    if (this.items.length === 0) return '';
    const totals = this.getTotals();
    const lines = [
      'Hi BAIA Cafe! 👋 I’d like to place an order ahead via messenger:',
      '',
      ...this.items.map(i => {
        const meta = [];
        if (i.temp) meta.push(i.temp);
        if (i.size) meta.push(`Size ${i.size}`);
        const metaStr = meta.length > 0 ? ` (${meta.join(', ')})` : '';
        return `• ${i.quantity}x ${i.name}${metaStr} — ${this.formatCurrency(i.unitPrice * i.quantity)}`;
      }),
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

  showToast(title, message, icon = '✦') {
    const toast = {
      id: Date.now() + Math.random(),
      title,
      message,
      icon
    };
    this.toasts.push(toast);
    this.notify();

    const toastContainer = document.getElementById('toast-container');
    if (toastContainer) {
      const toastEl = document.createElement('div');
      toastEl.className = 'toast-item';
      toastEl.setAttribute('role', 'alert');
      toastEl.innerHTML = `
        <div class="toast-icon" aria-hidden="true">${icon}</div>
        <div class="toast-content">
          <h4>${title}</h4>
          <p>${message}</p>
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
      this.notify();
    }, 3500);
  }
}

export const cartStore = new CartStore();
