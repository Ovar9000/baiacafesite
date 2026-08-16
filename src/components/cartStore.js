class CartStore {
  constructor() {
    this.items = [];
    this.isDrawerOpen = false;
    this.orderType = 'shore-delivery';
    this.shoreSpot = 'Shore Towels / Umbrellas';
    this.customerName = '';
    this.customerPhone = '';
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

    this.showToast('Added to Shore Order', `${item.name} (${this.formatCurrency(price)})`, '☕');
    this.notify();
  }

  addDoubleTroubleBundle() {
    // Card 3 bundle: Smash Burger (230) + Sea Salt Latte (180) + Chili BBQ Fries (155) = 565 with 85 discount -> 480
    const bundleKey = 'bundle-double-trouble';
    const existing = this.items.find(i => i.key === bundleKey);
    if (existing) {
      existing.quantity += 1;
    } else {
      this.items.push({
        id: 'bundle-double-trouble',
        key: bundleKey,
        name: '⚡ Double Trouble Shore Combo',
        description: 'BAIA Smash Burger + Sea Salt Latte (Iced) + Chili BBQ Fries',
        quantity: 1,
        unitPrice: 480,
        originalPrice: 565,
        discount: 85,
        isBundle: true
      });
    }
    this.showToast('Beach Combo Added!', 'Double Trouble Bundle (₱480) added to cart', '🍔');
    this.notify();
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

    const deliveryFee = this.orderType === 'shore-delivery' ? 0 : 0; // Free delivery to shore!
    const grandTotal = subtotal + deliveryFee;

    return {
      subtotal,
      savings,
      deliveryFee,
      grandTotal,
      itemCount: this.getItemCount()
    };
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

    setTimeout(() => {
      this.toasts = this.toasts.filter(t => t.id !== toast.id);
      this.notify();
    }, 3500);
  }
}

export const cartStore = new CartStore();
