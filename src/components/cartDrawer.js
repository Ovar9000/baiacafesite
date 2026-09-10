import { cartStore } from './cartStore.js';
import { menuData, getAvailableDrinkAddOns } from '../data/menuData.js';
import {
  deliveryConfig,
  getDeliveryZone,
  isBatchEligible,
  validateDeliveryDetails,
  getDeliverySpeedNote,
  getSpeedLabel,
  DELIVERY_MIN_DIRECTIONS_LENGTH
} from '../data/deliveryZones.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

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
  const deliveryRoot = document.getElementById('delivery-details-root');
  const deliveryFeeRow = document.getElementById('drawer-delivery-row');
  const deliveryFeeLabel = document.getElementById('drawer-delivery-label');
  const deliveryFeeEl = document.getElementById('drawer-delivery-fee');

  // Field-level validation flags for the Delivery Details section (cleared on fix)
  let deliveryErrors = {};
  // Collapsed once the section first becomes valid, so the items list stays visible
  let deliveryCollapsed = false;
  let wasDeliveryValid = false;
  // Which custom dropdown menu is open ('zone' | 'landmark' | null)
  let openMenu = null;
  // Set when the expand toggle wants the next render to animate open
  let animateOpenOnRender = false;

  function prefersReducedMotion() {
    return typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Close an open delivery dropdown on outside tap or Escape (registered once)
  document.addEventListener('click', (e) => {
    if (openMenu && deliveryRoot && !deliveryRoot.contains(e.target)) {
      openMenu = null;
      renderDeliverySection(cartStore);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openMenu && deliveryRoot?.contains(document.activeElement)) {
      openMenu = null;
      renderDeliverySection(cartStore);
    }
  });

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
      // Notify so the Delivery Details section + fee rows render immediately
      cartStore.notify();
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
    if (cartStore.isDelivery()) {
      const v = validateDeliveryDetails(cartStore.delivery);
      if (!v.valid) {
        deliveryErrors = flagDeliveryErrors(cartStore.delivery);
        renderDeliverySection(cartStore);
        cartStore.showToast('Delivery Details Incomplete', v.error, '!');
        document.getElementById('delivery-zone-btn')?.focus();
        return;
      }
      deliveryErrors = {};
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

    if (deliveryFeeRow && deliveryFeeEl) {
      if (store.isDelivery() && totals.deliveryFee > 0) {
        const zone = getDeliveryZone(store.delivery.zoneId);
        deliveryFeeRow.style.display = 'flex';
        if (deliveryFeeLabel) deliveryFeeLabel.textContent = zone ? `Delivery Fee (${zone.name})` : 'Delivery Fee';
        deliveryFeeEl.textContent = store.formatCurrency(totals.deliveryFee);
      } else {
        deliveryFeeRow.style.display = 'none';
      }
    }

    if (savingsRow && savingsEl) {
      if (totals.savings > 0) {
        savingsRow.style.display = 'flex';
        savingsEl.textContent = `-${store.formatCurrency(totals.savings)}`;
      } else {
        savingsRow.style.display = 'none';
      }
    }

    renderItems(store);
    renderDeliverySection(store);
  });

  function flagDeliveryErrors(delivery) {
    const flags = {};
    const zone = getDeliveryZone(delivery.zoneId);
    if (!zone) {
      flags.zone = true;
    } else if (zone.landmarks.length > 0 && !zone.landmarks.includes(delivery.landmark)) {
      flags.landmark = true;
    }
    if ((delivery.directions || '').trim().length < DELIVERY_MIN_DIRECTIONS_LENGTH) {
      flags.directions = true;
    }
    if (isBatchEligible(delivery.zoneId) && delivery.speed !== 'standard' && delivery.speed !== 'batch') {
      flags.speed = true;
    }
    return flags;
  }

  function renderDeliverySection(store) {
    if (!deliveryRoot) return;
    if (!store.isDelivery()) {
      deliveryRoot.style.display = 'none';
      deliveryRoot.innerHTML = '';
      return;
    }
    deliveryRoot.style.display = 'block';

    const d = store.delivery;
    const zone = getDeliveryZone(d.zoneId);
    const landmarks = zone ? zone.landmarks : [];
    const totals = store.getTotals();

    // Auto-collapse the moment the section becomes valid (never auto-expand).
    // Only force-expand when there are checkout validation errors to show —
    // otherwise a manual collapse always wins, even on an incomplete form.
    const nowValid = validateDeliveryDetails(d).valid;
    const hasFieldErrors = Object.keys(deliveryErrors).length > 0;
    if (!nowValid) {
      wasDeliveryValid = false;
      if (hasFieldErrors) deliveryCollapsed = false;
    } else if (!wasDeliveryValid) {
      deliveryCollapsed = true;
      wasDeliveryValid = true;
    }

    const zoneOptions = deliveryConfig.zones.map((z) => {
      const feeHint = `from ₱${z.feeSchedule.baseFee}` + (typeof z.feeSchedule.maxFee === 'number' ? ` · max ₱${z.feeSchedule.maxFee}` : '');
      const selected = d.zoneId === z.id;
      return `
        <button type="button" class="dd-option${selected ? ' is-selected' : ''}" data-zone-id="${esc(z.id)}" role="option" aria-selected="${selected}">
          <span class="dd-check" aria-hidden="true">${selected ? '✓' : ''}</span>
          <span class="dd-label">${esc(z.fullName)}</span>
          <span class="dd-sub">${esc(feeHint)}</span>
        </button>`;
    }).join('');

    const landmarkOptions = !zone
      ? ''
      : landmarks.map((lm) => {
        const selected = d.landmark === lm;
        return `
          <button type="button" class="dd-option${selected ? ' is-selected' : ''}" data-landmark="${esc(lm)}" role="option" aria-selected="${selected}">
            <span class="dd-check" aria-hidden="true">${selected ? '✓' : ''}</span>
            <span class="dd-label">${esc(lm)}</span>
          </button>`;
      }).join('');

    const landmarkBtnLabel = !zone
      ? 'Select a zone first'
      : landmarks.length === 0
        ? 'No landmarks listed yet — describe the location below'
        : (d.landmark || 'Choose nearest landmark');
    const landmarkDisabled = !zone || landmarks.length === 0;

    const batchEligible = isBatchEligible(d.zoneId);
    const speedLabel = d.speed === 'batch' ? 'Batch' : d.speed === 'standard' ? 'Standard' : '';

    // Collapsed summary must never crash on an empty/unfinished form
    const summaryText = !zone
      ? 'Tap to set zone, landmark & directions'
      : `${zone.name} · ${d.landmark || '—'}${speedLabel ? ` · ${speedLabel}` : ''} · ${totals.deliveryFee > 0 ? store.formatCurrency(totals.deliveryFee) : '—'}`;

    const feePreview = (() => {
      if (!zone || totals.deliveryFee <= 0) return '';
      return `<div class="delivery-fee-preview">Delivery Fee (${esc(zone.name)}): ${esc(store.formatCurrency(totals.deliveryFee))}</div>`;
    })();

    const speedPicker = !batchEligible ? '' : `
        <div class="delivery-field${deliveryErrors.speed ? ' field-error' : ''}">
          <span class="delivery-label" id="delivery-speed-label">Delivery speed *</span>
          <div class="speed-options" role="radiogroup" aria-labelledby="delivery-speed-label">
            <button type="button" class="speed-btn${d.speed === 'standard' ? ' active' : ''}" data-speed="standard" role="radio" aria-checked="${d.speed === 'standard'}">
              <span class="speed-name">Standard</span>
              <span class="speed-sub">On the road ~30 min after order</span>
            </button>
            <button type="button" class="speed-btn${d.speed === 'batch' ? ' active' : ''}" data-speed="batch" role="radio" aria-checked="${d.speed === 'batch'}">
              <span class="speed-name">Batch · ½ price</span>
              <span class="speed-sub">Goes out with the next order</span>
            </button>
          </div>
        </div>`;

    deliveryRoot.innerHTML = `
      <div class="delivery-details-card${deliveryCollapsed ? ' is-collapsed' : ''}">
        ${deliveryCollapsed ? `
        <button type="button" class="delivery-details-toggle" id="delivery-toggle" aria-expanded="false" aria-label="Expand delivery details">
          <span class="delivery-details-title">Delivery Details${nowValid ? ' · ✓' : ''}</span>
          <span class="delivery-summary">${esc(summaryText)}</span>
          <span class="dd-toggle-chevron" aria-hidden="true">▾</span>
        </button>` : `
        <div class="delivery-details-title">Delivery Details${nowValid ? ' · ✓' : ''}</div>`}
        ${deliveryCollapsed ? '' : `
        <div class="delivery-collapse-body">
        <div class="delivery-collapse-inner">
        <div class="delivery-field${deliveryErrors.zone ? ' field-error' : ''}">
          <span class="delivery-label" id="delivery-zone-label">Delivery Zone *</span>
          <div class="dd-wrap${openMenu === 'zone' ? ' open' : ''}">
            <button type="button" class="dd-btn" id="delivery-zone-btn" aria-labelledby="delivery-zone-label delivery-zone-btn" aria-haspopup="listbox" aria-expanded="${openMenu === 'zone'}">
              <span class="dd-value${d.zoneId ? '' : ' is-placeholder'}">${esc(zone ? zone.fullName : 'Choose delivery zone')}</span>
              <span class="dd-chevron" aria-hidden="true">▾</span>
            </button>
            ${openMenu === 'zone' ? `<div class="dd-menu" role="listbox" aria-label="Delivery zone">${zoneOptions}</div>` : ''}
          </div>
        </div>
        <div class="delivery-field${deliveryErrors.landmark ? ' field-error' : ''}">
          <span class="delivery-label" id="delivery-landmark-label">Nearest Landmark${landmarks.length > 0 ? ' *' : ''}</span>
          <div class="dd-wrap${openMenu === 'landmark' ? ' open' : ''}">
            <button type="button" class="dd-btn" id="delivery-landmark-btn" aria-labelledby="delivery-landmark-label delivery-landmark-btn" aria-haspopup="listbox" aria-expanded="${openMenu === 'landmark'}"${landmarkDisabled ? ' disabled' : ''}>
              <span class="dd-value${d.landmark ? '' : ' is-placeholder'}">${esc(landmarkBtnLabel)}</span>
              <span class="dd-chevron" aria-hidden="true">▾</span>
            </button>
            ${openMenu === 'landmark' && !landmarkDisabled ? `<div class="dd-menu" role="listbox" aria-label="Nearest landmark">${landmarkOptions}</div>` : ''}
          </div>
        </div>
        <div class="delivery-field${deliveryErrors.directions ? ' field-error' : ''}">
          <label for="delivery-directions-input">Additional Directions *</label>
          <textarea id="delivery-directions-input" placeholder="e.g. Blue gate, 2nd house past the sari-sari store" aria-label="Additional delivery directions">${esc(d.directions || '')}</textarea>
        </div>
        ${speedPicker}
        ${feePreview}
        <div class="delivery-hint">Further updates and rider coordination will be handled through Messenger.</div>
        <button type="button" class="delivery-collapse-btn" id="delivery-toggle" aria-expanded="true">
          <span>Show less</span>
          <span class="dd-toggle-chevron" aria-hidden="true">▴</span>
        </button>
        </div>
        </div>
        `}
      </div>
    `;

    // Play the open animation when the expand toggle requested it
    if (animateOpenOnRender && !deliveryCollapsed) {
      animateOpenOnRender = false;
      const body = deliveryRoot.querySelector('.delivery-collapse-body');
      if (body && !prefersReducedMotion()) {
        body.classList.add('pre-open');
        requestAnimationFrame(() => requestAnimationFrame(() => body.classList.remove('pre-open')));
      }
    }

    deliveryRoot.querySelector('#delivery-toggle')?.addEventListener('click', () => {
      if (deliveryCollapsed) {
        // Expand: render open, then animate the body from closed → open
        deliveryCollapsed = false;
        animateOpenOnRender = true;
        renderDeliverySection(cartStore);
      } else {
        // Collapse: animate the body closed first, then swap to the summary row
        const card = deliveryRoot.querySelector('.delivery-details-card');
        const body = deliveryRoot.querySelector('.delivery-collapse-body');
        if (!card || !body || prefersReducedMotion()) {
          deliveryCollapsed = true;
          renderDeliverySection(cartStore);
          return;
        }
        card.classList.add('is-closing');
        openMenu = null;
        setTimeout(() => {
          deliveryCollapsed = true;
          renderDeliverySection(cartStore);
        }, 260);
      }
    });

    deliveryRoot.querySelector('#delivery-zone-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openMenu = openMenu === 'zone' ? null : 'zone';
      renderDeliverySection(cartStore);
      if (openMenu === 'zone') deliveryRoot.querySelector('#delivery-zone-btn')?.focus();
    });

    deliveryRoot.querySelector('#delivery-landmark-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openMenu = openMenu === 'landmark' ? null : 'landmark';
      renderDeliverySection(cartStore);
      if (openMenu === 'landmark') deliveryRoot.querySelector('#delivery-landmark-btn')?.focus();
    });

    deliveryRoot.querySelectorAll('[data-zone-id]').forEach((opt) => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        openMenu = null;
        delete deliveryErrors.zone;
        delete deliveryErrors.landmark;
        delete deliveryErrors.speed;
        const nextZone = opt.dataset.zoneId;
        // Batch zones require an explicit speed pick; Laurente is standard-only.
        cartStore.setDelivery({ zoneId: nextZone, landmark: '', speed: isBatchEligible(nextZone) ? '' : 'standard' });
      });
    });

    deliveryRoot.querySelectorAll('[data-landmark]').forEach((opt) => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        openMenu = null;
        delete deliveryErrors.landmark;
        cartStore.setDelivery({ landmark: opt.dataset.landmark });
      });
    });

    deliveryRoot.querySelectorAll('[data-speed]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        delete deliveryErrors.speed;
        cartStore.setDelivery({ speed: btn.dataset.speed });
      });
    });

    // Direct assignment without notify: avoids re-render (and focus loss) while typing.
    // Fee preview doesn't depend on directions, so nothing else needs updating.
    deliveryRoot.querySelector('#delivery-directions-input')?.addEventListener('input', (e) => {
      cartStore.delivery.directions = e.target.value;
      if ((e.target.value || '').trim().length >= DELIVERY_MIN_DIRECTIONS_LENGTH) {
        delete deliveryErrors.directions;
        e.target.closest('.delivery-field')?.classList.remove('field-error');
      }
    });
  }

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
          <button type="button" class="btn-story-pill" id="empty-cart-explore-btn" style="margin-top: 14px;">
            <span>Explore BAIA Menu</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      `;
      itemsContainer.querySelector('#empty-cart-explore-btn')?.addEventListener('click', () => {
        document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' });
        cartStore.closeDrawer();
      });
      return;
    }

    itemsContainer.innerHTML = store.items.map(item => {
      const metaParts = [];
      if (item.temp) metaParts.push(item.temp);
      if (item.size) metaParts.push(`Size ${item.size}`);
      if (item.isBundle) metaParts.push('Popular Shore Pairing');

      const availableAddOns = getAvailableDrinkAddOns(item.id);
      const hasCustomizations = availableAddOns.length > 0;
      const isDrink = item.isDrink || Boolean(item.temp || item.size || (item.addOns && item.addOns.length > 0));
      const addOnsList = item.addOns || [];
      const cleanKey = item.key.replace(/[^a-zA-Z0-9_-]/g, '_');

      return `
        <div class="cart-item-card" data-key="${esc(item.key)}">
          <div class="cart-item-top">
            <div>
              <p class="cart-item-name"><strong>${esc(item.name)}</strong></p>
              ${metaParts.length > 0 ? `<div class="cart-item-meta">${esc(metaParts.join(' • '))}</div>` : ''}
              ${addOnsList.length > 0 ? `
                <div class="cart-item-addons-list">
                  ${addOnsList.map(a => `
                    <span class="cart-addon-badge">
                      <span>+ ${esc(a.name)} (+₱${Number(a.price) || 0})</span>
                      <button type="button" class="btn-remove-addon" data-key="${esc(item.key)}" data-addon-id="${esc(a.id)}" aria-label="Remove ${esc(a.name)}">×</button>
                    </span>
                  `).join('')}
                </div>
              ` : ''}
            </div>
            <div class="cart-item-price">${esc(store.formatCurrency(item.unitPrice * item.quantity))}</div>
          </div>

          <div class="cart-item-bottom">
            <div class="cart-item-controls-left">
              <div class="quantity-stepper" role="group" aria-label="Item quantity controls">
                <button class="btn-step" data-action="decrease" data-key="${esc(item.key)}" aria-label="Decrease quantity of ${esc(item.name)}">−</button>
                <span class="step-count" aria-live="polite">${Number(item.quantity) || 0}</span>
                <button class="btn-step" data-action="increase" data-key="${esc(item.key)}" aria-label="Increase quantity of ${esc(item.name)}">+</button>
              </div>
              ${hasCustomizations ? `
                <button type="button" class="btn-cart-quick-addon" data-action="toggle-custom-popover" data-target="popover-${esc(cleanKey)}" aria-label="Customize add-ons for ${esc(item.name)}">
                  <span>+ Customize</span>
                </button>
              ` : ''}
            </div>
            <button class="btn-item-remove" data-key="${esc(item.key)}" aria-label="Remove ${esc(item.name)} from order list">Remove</button>
          </div>

          ${hasCustomizations ? `
            <div class="cart-addon-popover" id="popover-${esc(cleanKey)}" style="display: none;">
              <div class="cart-addon-popover-header">Drink Customizations &amp; Add-ons</div>
              <div class="cart-addon-popover-items">
                ${availableAddOns.map(addon => {
                  const hasIt = addOnsList.some(a => a.id === addon.id);
                  return `
                    <div class="cart-addon-popover-item ${hasIt ? 'is-active' : ''}" data-key="${esc(item.key)}" data-addon-id="${esc(addon.id)}" role="button" tabindex="0">
                      <span class="popover-item-name">${hasIt ? '✓ ' : '+ '}${esc(addon.name)}</span>
                      <strong class="popover-item-price">+₱${Number(addon.price) || 0}</strong>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}
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

    // Remove specific add-on from pill
    itemsContainer.querySelectorAll('.btn-remove-addon').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = btn.dataset.key;
        const addonId = btn.dataset.addonId;
        const found = (menuData.addOns || []).find(a => a.id === addonId) || { id: addonId, price: 0 };
        cartStore.toggleItemAddOn(key, found);
      });
    });

    // Toggle in-drawer add-ons popover
    itemsContainer.querySelectorAll('[data-action="toggle-custom-popover"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetId = btn.dataset.target;
        const pop = document.getElementById(targetId);
        if (pop) {
          const isOpen = pop.style.display === 'flex';
          itemsContainer.querySelectorAll('.cart-addon-popover').forEach(p => p.style.display = 'none');
          pop.style.display = isOpen ? 'none' : 'flex';
        }
      });
    });

    // Toggle add-on from popover
    itemsContainer.querySelectorAll('.cart-addon-popover-item').forEach(itemBtn => {
      const handleToggle = () => {
        const key = itemBtn.dataset.key;
        const addonId = itemBtn.dataset.addonId;
        const found = (menuData.addOns || []).find(a => a.id === addonId);
        if (found) {
          cartStore.toggleItemAddOn(key, found);
        }
      };
      itemBtn.addEventListener('click', handleToggle);
      itemBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleToggle();
        }
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

    const isDelOrder = cartStore.isDelivery();
    const delZone = isDelOrder ? getDeliveryZone(cartStore.delivery.zoneId) : null;
    const delZoneName = delZone ? delZone.name : '';
    const delLandmark = (cartStore.delivery.landmark || '').trim();
    const delDirections = (cartStore.delivery.directions || '').trim();
    const delLocation = delLandmark ? `Near ${delLandmark} — ${delDirections}` : delDirections;
    const delSpeed = cartStore.delivery.speed === 'batch' ? 'batch' : 'standard';
    const batchingNote = isDelOrder && delZoneName ? getDeliverySpeedNote(delZoneName, delSpeed) : '';

    modal.innerHTML = `
      <div class="modal-dialog-card checkout-modal-card">
        <div class="modal-header">
          <h3 id="checkout-modal-title" class="checkout-modal-title">
            Send Order to BAIA Cafe
          </h3>
          <button type="button" class="btn-archive-close modal-dialog-close-btn" id="modal-top-close-btn" aria-label="Close checkout modal">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div class="modal-body-content">
          <div class="order-summary-box">
            <div class="summary-spot-line">
              <span>Order Type:</span>
              <strong>${esc(cartStore.orderType)}</strong>
            </div>
            <div class="summary-items-list">
              ${cartStore.items.map(i => {
                const meta = [];
                if (i.temp) meta.push(i.temp);
                if (i.size) meta.push(`Size ${i.size}`);
                if (i.addOns && i.addOns.length > 0) {
                  i.addOns.forEach(a => meta.push(`+${a.name}`));
                }
                const metaStr = meta.length > 0 ? meta.join(', ') : '';
                return `
                  <div class="summary-item-row">
                    <div>
                      <span>${Number(i.quantity) || 0}x ${esc(i.name)}</span>
                      ${metaStr ? `<div class="summary-item-meta">${esc(metaStr)}</div>` : ''}
                    </div>
                    <span>${esc(cartStore.formatCurrency(i.unitPrice * i.quantity))}</span>
                  </div>
                `;
              }).join('')}
            </div>
            ${totals.savings > 0 ? `
              <div class="summary-savings-row">
                <span>Bundle Savings:</span>
                <span>-${cartStore.formatCurrency(totals.savings)}</span>
              </div>
            ` : ''}
            ${isDelOrder ? `
              <div class="summary-delivery-row">
                <span>Delivery Fee (${esc(delZoneName)}):</span>
                <span>${esc(cartStore.formatCurrency(totals.deliveryFee))}</span>
              </div>
              <div class="summary-delivery-row">
                <span>Delivery Zone:</span>
                <span>${esc(delZoneName)}</span>
              </div>
              <div class="summary-delivery-row">
                <span>Delivery Location:</span>
                <span>${esc(delLocation)}</span>
              </div>
              <div class="summary-delivery-row">
                <span>Delivery Speed:</span>
                <span>${esc(getSpeedLabel(delSpeed))}</span>
              </div>
            ` : ''}
            <div class="summary-total-row">
              <span>Estimated Total:</span>
              <strong>${cartStore.formatCurrency(totals.grandTotal)}</strong>
            </div>
          </div>

          ${isDelOrder && batchingNote ? `
            <div class="delivery-batching-note" id="modal-batching-note" style="display: none; margin-bottom: 10px;">
              ${esc(batchingNote)}
            </div>
          ` : ''}

          <div class="order-copy-notice">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Order is automatically copied — just paste &amp; send!</span>
          </div>

          <div class="modal-action-buttons">
            <button 
              type="button"
              class="btn-primary-glow modal-btn send-fb-btn" 
              id="modal-send-fb-btn"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true" style="display:inline-block; vertical-align: -2px; flex-shrink: 0;">
                <path d="M12 2C6.48 2 2 6.03 2 11C2 13.84 3.46 16.34 5.75 17.89V21.5L9.13 19.64C10.04 19.88 11 20 12 20C17.52 20 22 15.97 22 11C22 6.03 17.52 2 12 2ZM13.06 14.5L10.75 12.03L6.25 14.5L11.19 9.25L13.5 11.72L17.75 9.25L13.06 14.5Z" />
              </svg>
              <span id="modal-fb-btn-label">Open Messenger to Order</span>
              <span aria-hidden="true">↗</span>
            </button>

            <button 
              type="button"
              class="btn-copy-order-subtle" 
              id="modal-copy-order-btn"
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
        fbBtnLabel.textContent = '✓ Copied! Opening Messenger...';
        setTimeout(() => {
          fbBtnLabel.textContent = 'Open Messenger to Order';
        }, 4000);
      }
      if (isDelOrder && batchingNote) {
        modal.querySelector('#modal-batching-note')?.style.setProperty('display', 'block');
        cartStore.showToast('Order Copied to Clipboard!', batchingNote, '✓');
      } else {
        cartStore.showToast('Order Copied to Clipboard!', 'Opening Messenger — paste and send.', '✓');
      }
      window.open(messengerUrl, '_blank', 'noopener,noreferrer');
    });

    // Copy Order Text Only button handler
    const copyBtn = modal.querySelector('#modal-copy-order-btn');
    copyBtn?.addEventListener('click', () => {
      copyOrderToClipboard();
      const labelSpan = copyBtn.querySelector('span');
      if (labelSpan) {
        labelSpan.textContent = '✓ Order Copied to Clipboard!';
        copyBtn.style.color = '#15803D';
        setTimeout(() => {
          labelSpan.textContent = 'Copy Order Text Only';
          copyBtn.style.color = '';
        }, 3000);
      }
      cartStore.showToast('Order Copied!', 'Paste into Messenger or WhatsApp to order.', '✓');
    });

    // Optional click preview box if present
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
