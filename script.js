/* ============================================
   FUKU COFFEE — STOREFRONT (API-driven)
   ============================================ */

const WA_NUMBER  = '919574323011';
const STORE_NAME = 'FUKU Coffee';
const RESELLER_KEY = 'fuku_reseller_ref';
// Reseller program paused for now: hides the "You're shopping with…" banner and
// stops attaching reseller credit to orders. Flip to true to re-enable.
const RESELLER_ENABLED = false;

let PRODUCTS = [];
window.__FUKU_PRODUCTS__ = PRODUCTS;

// ============================================
// RESELLER REF CAPTURE & BANNER
// ============================================
async function initReseller() {
  if (!RESELLER_ENABLED) return;   // paused — banner never shows
  const url = new URL(location.href);
  const ref = (url.searchParams.get('ref') || '').toUpperCase().trim();
  if (ref) {
    localStorage.setItem(RESELLER_KEY, ref);
    // clean URL without reload
    url.searchParams.delete('ref');
    history.replaceState({}, '', url.pathname + (url.search || '') + url.hash);
  }
  const saved = localStorage.getItem(RESELLER_KEY);
  if (!saved) return;
  try {
    const r = await fetch('/api/reseller/' + encodeURIComponent(saved)).then(r => r.json());
    if (r && r.name) {
      document.getElementById('rbName').textContent  = r.name;
      document.getElementById('rbCity').textContent  = r.city ? (' from ' + r.city) : '';
      document.getElementById('resellerBanner').hidden = false;
    } else {
      // unknown ref — purge it
      localStorage.removeItem(RESELLER_KEY);
    }
  } catch (e) { /* offline; banner stays hidden */ }
}
function dismissReseller() {
  document.getElementById('resellerBanner').hidden = true;
  localStorage.removeItem(RESELLER_KEY);
}
function currentResellerRef() {
  if (!RESELLER_ENABLED) return null;   // paused — don't attach reseller credit to orders
  return localStorage.getItem(RESELLER_KEY) || null;
}
window.currentResellerRef = currentResellerRef;

// ============================================
// FETCH PRODUCTS FROM API
// ============================================
async function loadProducts() {
  try {
    const res = await fetch('/api/products');
    PRODUCTS = await res.json();
    window.__FUKU_PRODUCTS__ = PRODUCTS;
    return PRODUCTS;
  } catch (e) {
    console.error('Failed to load products:', e);
    PRODUCTS = [];
    return [];
  }
}

// ============================================
// PRODUCT CARD HTML
// ============================================
function bagHTML(p) {
  return `
    <div class="bag-art bag-${p.bag_color}">
      <div class="bag-top"></div>
      <div class="bag-body">
        <span class="bag-blend">${p.short || ''}</span>
        ${p.sub ? `<span class="bag-blend-sub">${p.sub}</span>` : ''}
        <span class="bag-fuku">FUKU<small>coffee</small></span>
        <span class="bag-roast">${p.roast || ''}</span>
      </div>
    </div>
  `;
}

function artHTML(p) {
  // Prefer real product photo if available
  if (p.image_url) {
    return `<div class="pc-art pc-art-photo"><img src="${p.image_url}" alt="${p.name}" loading="lazy" /></div>`;
  }
  // Fallback CSS illustrations
  if (p.type === 'bag') {
    return `<div class="pc-art">${bagHTML(p)}</div>`;
  }
  if (p.type === 'bottle') {
    return `
      <div class="pc-art pc-art-cold">
        <div class="bottle-art">
          <div class="bottle-label">${p.label || 'COLD<br/>BREW'}</div>
        </div>
      </div>`;
  }
  if (p.type === 'combo') {
    const items = Array.isArray(p.combo_items) ? p.combo_items : [];
    let stack = '';
    items.forEach(item => {
      if (item === 'bottle') stack += '<div class="combo-bottle"></div>';
      if (item === 'tonic')  stack += '<div class="combo-tonic"></div>';
      if (item === 'jar')    stack += '<div class="combo-jar"></div>';
    });
    return `<div class="pc-art pc-art-combo"><div class="combo-stack">${stack}</div></div>`;
  }
  if (p.type === 'powder') {
    return `<div class="pc-art pc-art-powder"><div class="jar-art"><div class="jar-label">LIME<br/>POWDER</div></div></div>`;
  }
  return `<div class="pc-art"></div>`;
}

function productCard(p) {
  const savePct = p.was && p.was > p.price ? Math.round(((p.was - p.price) / p.was) * 100) : 0;
  const catLabel = { beans: 'Coffee Beans', instant: 'Instant Coffee', coldbrew: 'Cold Brew' }[p.cat];
  const stockBadge = p.stock === 0
    ? `<span class="pc-badge" style="background:#9b1c2a">OUT OF STOCK</span>`
    : p.low_stock
      ? `<span class="pc-badge" style="background:#C2410C">ONLY ${p.stock} LEFT</span>`
      : p.badge ? `<span class="pc-badge">${p.badge}</span>` : '';

  return `
    <article class="product-card" data-id="${p.id}" data-cat="${p.cat}">
      ${artHTML(p)}
      ${stockBadge}
      ${savePct > 0 ? `<span class="pc-badge-save">−${savePct}%</span>` : ''}
      <div class="pc-meta">
        <span class="pc-cat">${catLabel || ''}</span>
        <h3 class="pc-name">${p.name}</h3>
        <p class="pc-desc">${p.description || ''}</p>
        <div class="pc-bottom">
          <div class="pc-price">
            <span class="now">₹${p.price.toLocaleString('en-IN')}</span>
            ${p.was && p.was > p.price ? `<span class="was">₹${p.was.toLocaleString('en-IN')}</span>` : ''}
          </div>
          <button class="pc-add" data-id="${p.id}" aria-label="Add to cart" title="Add to cart" ${p.stock === 0 ? 'disabled style="opacity:.35;cursor:not-allowed"' : ''}>+</button>
        </div>
      </div>
    </article>
  `;
}

function renderProducts() {
  const bsGrid     = document.getElementById('bsGrid');
  const beansGrid  = document.getElementById('beansGrid');
  const instantGrid= document.getElementById('instantGrid');
  const coldGrid   = document.getElementById('coldGrid');

  if (bsGrid)      bsGrid.innerHTML      = PRODUCTS.filter(p => p.bestseller).slice(0, 6).map(productCard).join('');
  if (beansGrid)   beansGrid.innerHTML   = PRODUCTS.filter(p => p.cat === 'beans').map(productCard).join('');
  if (instantGrid) instantGrid.innerHTML = PRODUCTS.filter(p => p.cat === 'instant').map(productCard).join('');
  if (coldGrid)    coldGrid.innerHTML    = PRODUCTS.filter(p => p.cat === 'coldbrew').map(productCard).join('');

  document.querySelectorAll('.pc-add').forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      addToCart(btn.dataset.id);
    });
  });
}

// ============================================
// CART
// ============================================
let cart = JSON.parse(localStorage.getItem('fuku_cart') || '[]');

function saveCart() {
  localStorage.setItem('fuku_cart', JSON.stringify(cart));
  updateCartUI();
}

function addToCart(id) {
  const product = PRODUCTS.find(p => p.id === id);
  if (!product) return;
  if (product.stock === 0) { showToast(`${product.name} is out of stock`); return; }
  const existing = cart.find(i => i.id === id);
  const currentQty = existing ? existing.qty : 0;
  if (currentQty + 1 > product.stock) {
    showToast(`Only ${product.stock} ${product.name} available`);
    return;
  }
  if (existing) existing.qty += 1;
  else cart.push({ id, qty: 1 });
  saveCart();
  showToast(`Added: ${product.name}`);
  bumpCart();
}

function removeFromCart(id) { cart = cart.filter(i => i.id !== id); saveCart(); }

function updateQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  const product = PRODUCTS.find(p => p.id === id);
  if (delta > 0 && product && item.qty + delta > product.stock) {
    showToast(`Only ${product.stock} in stock`);
    return;
  }
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter(i => i.id !== id);
  saveCart();
}

function cartTotal() {
  return cart.reduce((sum, i) => {
    const p = PRODUCTS.find(pr => pr.id === i.id);
    return sum + (p ? p.price * i.qty : 0);
  }, 0);
}

function cartCount() { return cart.reduce((sum, i) => sum + i.qty, 0); }

function updateCartUI() {
  const count = cartCount();
  const total = cartTotal();
  const el = (id) => document.getElementById(id);
  if (el('cartCount'))       el('cartCount').textContent = count;
  if (el('cartCountInline')) el('cartCountInline').textContent = `(${count})`;
  if (el('cartSubtotal'))    el('cartSubtotal').textContent = `₹${total.toLocaleString('en-IN')}`;

  const body = el('cartBody');
  const foot = el('cartFoot');
  if (!body || !foot) return;

  if (cart.length === 0) {
    body.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">☕</div>
        <p>Your cart is empty.</p>
        <button class="btn btn-primary" id="cartShop">Start Shopping</button>
      </div>`;
    foot.hidden = true;
    document.getElementById('cartShop')?.addEventListener('click', () => {
      closeCart();
      document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' });
    });
  } else {
    body.innerHTML = cart.map(item => {
      const p = PRODUCTS.find(pr => pr.id === item.id);
      if (!p) return '';
      return `
        <div class="cart-item">
          <div class="cart-item-img">${p.short || 'FUKU'}</div>
          <div class="cart-item-info">
            <span class="cart-item-name">${p.name}</span>
            <span class="cart-item-meta">₹${p.price.toLocaleString('en-IN')} each</span>
            <div class="cart-item-controls">
              <button data-action="dec" data-id="${p.id}">−</button>
              <span>${item.qty}</span>
              <button data-action="inc" data-id="${p.id}">+</button>
            </div>
          </div>
          <div class="cart-item-right">
            <span class="cart-item-price">₹${(p.price * item.qty).toLocaleString('en-IN')}</span>
            <button class="cart-item-remove" data-action="remove" data-id="${p.id}">Remove</button>
          </div>
        </div>`;
    }).join('');
    foot.hidden = false;

    body.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const { action, id } = btn.dataset;
        if (action === 'inc') updateQty(id, +1);
        if (action === 'dec') updateQty(id, -1);
        if (action === 'remove') removeFromCart(id);
      });
    });
  }
}

function bumpCart() {
  const cartBtn = document.getElementById('cartBtn');
  if (!cartBtn) return;
  cartBtn.style.transform = 'scale(1.18)';
  setTimeout(() => { cartBtn.style.transform = ''; }, 180);
}

function openCart() {
  document.getElementById('cartDrawer')?.classList.add('open');
  document.getElementById('overlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeCart() {
  document.getElementById('cartDrawer')?.classList.remove('open');
  document.getElementById('overlay')?.classList.remove('open');
  document.body.style.overflow = '';
}

// Expose for chatbot
window.addToCart = addToCart;
window.openCart  = openCart;
window.cartTotal = cartTotal;

// ============================================
// CHECKOUT FLOW — Modal → validate → backend → WhatsApp
// ============================================

// Mirrors server.py shipping_for() so we can preview cost & zone in the UI.
// Delivery is charged by location and confirmed on WhatsApp — no free zone, no fixed fee.
function zoneFor(pincode) {
  const pc = String(pincode || '').trim();
  if (!/^\d{6}$/.test(pc))                          return { key: 'none',  fee: 0, label: '— enter pincode —' };
  if (pc.startsWith('395') || pc.startsWith('394')) return { key: 'surat', fee: 0, label: '🛵 Surat · delivery charged extra (as per distance)' };
  return                                                   { key: 'out',   fee: 0, label: '📦 Outside Surat · confirmed on WhatsApp' };
}

let LOC_COORDS = null;          // { lat, lng, accuracy } when shared

function openCheckoutModal() {
  if (cart.length === 0) { showToast('Your cart is empty'); return; }

  const modal = document.getElementById('checkoutModal');
  // Pre-fill from previous order if available
  const saved = JSON.parse(localStorage.getItem('fuku_customer') || '{}');
  document.getElementById('coName').value     = saved.name     || '';
  document.getElementById('coPhone').value    = saved.phone    || '';
  document.getElementById('coEmail').value    = saved.email    || '';
  document.getElementById('coAddress').value  = saved.address  || '';
  document.getElementById('coPincode').value  = saved.pincode  || '';
  document.getElementById('coNotes').value    = '';
  LOC_COORDS = null;
  document.getElementById('coLocResult').classList.remove('show');
  document.getElementById('coLocResult').innerHTML = '';

  renderCheckoutSummary();
  recalcCheckoutTotals();
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  // Defer focus so the modal animation runs
  setTimeout(() => document.getElementById('coName').focus(), 200);
}

function closeCheckoutModal() {
  document.getElementById('checkoutModal').hidden = true;
  document.body.style.overflow = '';
}

function renderCheckoutSummary() {
  const wrap = document.getElementById('coSummary');
  wrap.innerHTML = cart.map(i => {
    const p = PRODUCTS.find(pr => pr.id === i.id);
    if (!p) return '';
    return `
      <div class="co-summary-row">
        <span class="co-summary-name">${p.name}</span>
        <span class="co-summary-qty">× ${i.qty}</span>
        <span class="co-summary-price">₹${(p.price * i.qty).toLocaleString('en-IN')}</span>
      </div>
    `;
  }).join('');
}

function recalcCheckoutTotals() {
  const subtotal = cartTotal();
  const pincode  = document.getElementById('coPincode').value;
  const z = zoneFor(pincode);
  const pill = document.getElementById('coZonePill');
  pill.textContent = z.label;
  pill.className = 'co-zone-pill ' + (z.key === 'surat' ? 'zone-free' : z.key === 'out' ? 'zone-out' : '');

  const fee   = z.fee;
  const total = subtotal + fee;
  document.getElementById('coTotals').innerHTML = `
    <div class="co-total-row"><span>Subtotal</span><strong>₹${subtotal.toLocaleString('en-IN')}</strong></div>
    <div class="co-total-row"><span>Delivery</span><strong>Extra · by distance</strong></div>
    <div class="co-total-row total"><span>Total</span><strong>₹${total.toLocaleString('en-IN')} + delivery</strong></div>
  `;
}

async function shareLocation() {
  const btn = document.getElementById('coLocBtn');
  const result = document.getElementById('coLocResult');

  if (!('geolocation' in navigator)) {
    result.innerHTML = '⚠️ Your browser doesn\'t support location sharing.';
    result.classList.add('show');
    result.style.background = '#FEE2E2';
    result.style.color = '#991B1B';
    return;
  }

  btn.disabled = true;
  btn.querySelector('span').textContent = 'Getting location...';

  navigator.geolocation.getCurrentPosition(
    pos => {
      LOC_COORDS = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy),
      };
      const mapsUrl = `https://maps.google.com/?q=${LOC_COORDS.lat},${LOC_COORDS.lng}`;
      result.classList.add('show');
      result.style.background = '#DCFCE7';
      result.style.color = '#166534';
      result.innerHTML = `
        <span>✓</span>
        <div>
          <strong>Location captured</strong> · accuracy ±${LOC_COORDS.accuracy}m<br/>
          <a href="${mapsUrl}" target="_blank" rel="noopener">View on Google Maps ↗</a>
        </div>
      `;
      btn.disabled = false;
      btn.querySelector('span').textContent = '✓ Location shared — tap to update';
    },
    err => {
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Share My Location (Google Maps)';
      result.classList.add('show');
      result.style.background = '#FEE2E2';
      result.style.color = '#991B1B';
      const messages = {
        1: '🔒 Location blocked. Allow it in your browser settings to share GPS.',
        2: '📡 Couldn\'t get your location. Check your connection.',
        3: '⏱️ Location request timed out.',
      };
      result.textContent = messages[err.code] || ('Error: ' + err.message);
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
}

function validateCheckout() {
  const fields = [
    { id: 'coName',    msg: 'Please enter your full name' },
    { id: 'coPhone',   msg: 'Please enter a 10-digit mobile number', regex: /^[6-9]\d{9}$/ },
    { id: 'coAddress', msg: 'Please enter your delivery address' },
    { id: 'coPincode', msg: 'Please enter a valid 6-digit pincode', regex: /^\d{6}$/ },
  ];
  for (const f of fields) {
    const el = document.getElementById(f.id);
    const v = el.value.trim();
    el.classList.remove('invalid');
    if (!v) { el.classList.add('invalid'); el.focus(); showToast(f.msg); return false; }
    if (f.regex && !f.regex.test(v)) { el.classList.add('invalid'); el.focus(); showToast(f.msg); return false; }
  }
  return true;
}

async function submitCheckout(e) {
  e.preventDefault();
  if (!validateCheckout()) return;

  const name    = document.getElementById('coName').value.trim();
  const phone   = document.getElementById('coPhone').value.trim();
  const email   = document.getElementById('coEmail').value.trim();
  const address = document.getElementById('coAddress').value.trim();
  const pincode = document.getElementById('coPincode').value.trim();
  const notes   = document.getElementById('coNotes').value.trim();
  const fullAddress = `${address}, Pincode ${pincode}`;

  // Save for next time
  localStorage.setItem('fuku_customer', JSON.stringify({ name, phone, email, address, pincode }));

  const btn = document.getElementById('coSubmitBtn');
  btn.disabled = true;
  btn.style.opacity = '.75';
  const oldHTML = btn.innerHTML;
  btn.innerHTML = 'Placing order...';

  // Submit to backend
  let orderNo = null;
  let serverTotals = null;
  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: cart.map(i => ({ id: i.id, qty: i.qty })),
        customer_name:    name,
        customer_phone:   phone,
        customer_email:   email,
        shipping_address: fullAddress,
        notes:            notes + (LOC_COORDS ? ` | GPS: ${LOC_COORDS.lat},${LOC_COORDS.lng}` : ''),
        source: 'web',
        reseller_ref:     currentResellerRef(),
      }),
    });
    if (res.ok) {
      const data = await res.json();
      orderNo = data.order_no;
      serverTotals = data;
      showToast(`Order ${orderNo} created ✓`);
      // If a reseller is linked, fire off a 2nd tab that pre-fills a WA message to them
      if (data.reseller_notify_url) {
        setTimeout(() => window.open(data.reseller_notify_url, '_blank'), 800);
      }
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'Order issue — opening WhatsApp anyway');
    }
  } catch (err) {
    console.warn('Backend unreachable, falling back to WA only');
  }

  // Build WhatsApp message
  const subtotal = cartTotal();
  const z        = zoneFor(pincode);
  const shipping = serverTotals?.shipping ?? z.fee;
  const total    = serverTotals?.total ?? (subtotal + shipping);

  let msg = `Hi ${STORE_NAME}! 👋\nI'd like to place an order:\n\n`;
  cart.forEach((item, i) => {
    const p = PRODUCTS.find(pr => pr.id === item.id);
    if (!p) return;
    msg += `${i + 1}. ${p.name}\n   × ${item.qty}  =  ₹${(p.price * item.qty).toLocaleString('en-IN')}\n\n`;
  });
  msg += `*Subtotal: ₹${subtotal.toLocaleString('en-IN')}*\n`;
  msg += `*Delivery: Charged extra as per distance (confirmed on WhatsApp)*\n`;
  msg += `*Total: ₹${total.toLocaleString('en-IN')} + delivery*\n`;
  if (orderNo) msg += `Order No: *${orderNo}*\n`;
  msg += `\n👤 *Customer Details:*\n`;
  msg += `Name: ${name}\n`;
  msg += `Phone: +91 ${phone}\n`;
  if (email) msg += `Email: ${email}\n`;
  msg += `\n📍 *Delivery Address:*\n${address}\nPincode: ${pincode}\nZone: ${z.label}\n`;
  if (LOC_COORDS) {
    msg += `\n📍 *GPS Location:*\nhttps://maps.google.com/?q=${LOC_COORDS.lat},${LOC_COORDS.lng}\n(accuracy ±${LOC_COORDS.accuracy}m)\n`;
  }
  msg += `\n💰 *Payment:* 🌐 Online (UPI / Bank — please share details)\n`;
  if (notes) msg += `\n📝 *Notes:* ${notes}\n`;
  msg += `\nThanks! 🙏`;

  const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
  // This runs AFTER `await fetch(...)`, i.e. outside the click's user-gesture
  // context, so mobile browsers (and desktop popup blockers) block window.open()
  // and the redirect silently fails. Navigate directly on mobile (no popup to
  // block); keep the new-tab behaviour on desktop with a same-tab fallback.
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (isMobile) {
    window.location.href = url;
  } else {
    const waWin = window.open(url, '_blank');
    if (!waWin) window.location.href = url;
  }

  // Clear cart on success
  if (orderNo) {
    cart = [];
    saveCart();
    closeCheckoutModal();
    closeCart();
    await loadProducts();
    renderProducts();
  }
  btn.disabled = false;
  btn.style.opacity = '';
  btn.innerHTML = oldHTML;
}

// ============================================
// TOAST
// ============================================
let toastTimer;
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

// ============================================
// NAV
// ============================================
function setupNav() {
  const toggle = document.getElementById('navToggle');
  const links  = document.getElementById('navLinks');
  toggle?.addEventListener('click', () => links.classList.toggle('open'));
  links?.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => links.classList.remove('open'));
  });
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => {
    if (!nav) return;
    nav.style.boxShadow = window.scrollY > 10 ? '0 4px 20px rgba(42, 8, 87, 0.06)' : 'none';
  });
}

// ============================================
// NEWSLETTER
// ============================================
function setupNewsletter() {
  const form = document.getElementById('newsForm');
  const note = document.getElementById('newsNote');
  form?.addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('newsEmail').value;
    note.textContent = `☕ You're in! We'll send the next drop to ${email}.`;
    form.reset();
    setTimeout(() => { note.textContent = ''; }, 5000);
  });
}

// ============================================
// SCROLL REVEAL
// ============================================
function setupReveal() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = 1;
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.product-card, .cat-card, .brew-card, .why-card, .rev-card, .roast-card').forEach(el => {
    el.style.opacity = 0;
    el.style.transform = 'translateY(24px)';
    el.style.transition = 'opacity 0.7s ease, transform 0.7s ease';
    observer.observe(el);
  });
}

// ============================================
// SUBSCRIPTION (WhatsApp checkout flow)
// ============================================
const SUB_PLANS = {
  weekly:   { label: 'Weekly',    freq: 'every 7 days',  price: 450 },
  biweekly: { label: 'Bi-Weekly', freq: 'every 14 days', price: 500 },
  monthly:  { label: 'Monthly',   freq: 'every 30 days', price: 950 },
};
function setupSubscriptions() {
  document.querySelectorAll('.sub-btn').forEach(btn => {
    btn.addEventListener('click', () => startSubscription(btn.dataset.plan));
  });
}
function startSubscription(plan) {
  const p = SUB_PLANS[plan];
  if (!p) return;
  const ref = currentResellerRef();
  let msg = `Hi ${STORE_NAME}! ☕\n\nI'd like to start a *${p.label}* subscription:\n`;
  msg += `Plan: ${p.label} (${p.freq})\n`;
  msg += `Price: ₹${p.price} / delivery\n`;
  if (ref) msg += `Reseller code: ${ref}\n`;
  msg += `\nPlease share the next steps. Thanks!`;
  // Also record on the backend (best-effort, non-blocking)
  fetch('/api/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan, notes: ref ? `via reseller ${ref}` : '' }),
  }).catch(() => {});
  window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ============================================
// QUICK-ORDER STICKY BAR (mobile)
// ============================================
function setupQuickBar() {
  const bar = document.getElementById('quickBar');
  if (!bar) return;
  // Use the first bestseller as the quick-order target
  const top = PRODUCTS.find(p => p.bestseller && p.in_stock) || PRODUCTS.find(p => p.in_stock);
  if (!top) { bar.hidden = true; return; }
  document.getElementById('qbName').textContent  = top.name;
  document.getElementById('qbPrice').textContent = `₹${top.price.toLocaleString('en-IN')} · tap to checkout`;
  document.getElementById('qbCta').onclick = () => {
    addToCart(top.id);
    setTimeout(() => { if (window.openCheckoutModal) openCheckoutModal(); }, 200);
  };
  // Tapping the product info also adds + opens checkout
  document.getElementById('qbProduct').onclick = () => {
    document.getElementById('qbCta').click();
  };
}

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  await loadProducts();
  renderProducts();
  setupQuickBar();
  updateCartUI();
  setupNav();
  setupNewsletter();
  setupSubscriptions();
  setupReveal();
  initReseller();
  document.getElementById('rbClose')?.addEventListener('click', dismissReseller);

  document.getElementById('cartBtn')?.addEventListener('click', openCart);
  document.getElementById('cartClose')?.addEventListener('click', closeCart);
  document.getElementById('overlay')?.addEventListener('click', closeCart);
  document.getElementById('checkoutBtn')?.addEventListener('click', openCheckoutModal);

  // Checkout modal
  document.getElementById('checkoutCloseBtn')?.addEventListener('click', closeCheckoutModal);
  document.getElementById('checkoutBackdrop')?.addEventListener('click', closeCheckoutModal);
  document.getElementById('checkoutForm')?.addEventListener('submit', submitCheckout);
  document.getElementById('coLocBtn')?.addEventListener('click', shareLocation);
  document.getElementById('coPincode')?.addEventListener('input', recalcCheckoutTotals);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!document.getElementById('checkoutModal').hidden) closeCheckoutModal();
      else closeCart();
    }
  });
});
