/* ============================================
   FUKU COFFEE — ADMIN APP
   ============================================ */

const TOKEN_KEY = 'fuku_admin_token';
const USER_KEY  = 'fuku_admin_user';
let TOKEN = localStorage.getItem(TOKEN_KEY) || null;
let CURRENT_USER = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
let TEAM = [];   // cached list of team members

const COLORS = {
  purple:   '#4A1A8E',
  purpleL:  '#7B47C9',
  purpleVL: '#B697E0',
  green:    '#16A34A',
  orange:   '#EA580C',
  blue:     '#2563EB',
  red:      '#DC2626',
  yellow:   '#CA8A04',
  ink:      '#1A0F2E',
  ink3:     '#6B5A85',
};

const PURPLE_PALETTE = ['#3B0B6E','#4A1A8E','#5B2BAA','#7B47C9','#B697E0','#D4BFEC','#EFE6FA'];

let charts = {};

// ============================================
// API helper
// ============================================
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
  const res = await fetch(path, { ...opts, headers });
  if (res.status === 401) {
    logout();
    throw new Error('Unauthorized');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

// ============================================
// LOGIN / LOGOUT
// ============================================
function showLogin() {
  document.getElementById('loginScreen').hidden = false;
  document.getElementById('app').hidden = true;
}
async function showApp() {
  document.getElementById('loginScreen').hidden = true;
  document.getElementById('app').hidden = false;
  try { TEAM = await api('/api/admin/team'); } catch (e) { TEAM = []; }
  renderCurrentUser();
  loadDashboard();
}
function renderCurrentUser() {
  const el = document.getElementById('currentUserBox');
  if (el && CURRENT_USER) {
    const superTag = CURRENT_USER.is_super ? '<span class="cu-super">🛡️ SUPER</span>' : '';
    el.innerHTML = `
      <div class="cu-avatar ${CURRENT_USER.is_super ? 'is-super' : ''}">${(CURRENT_USER.name || '?')[0]}</div>
      <div class="cu-info">
        <strong>${CURRENT_USER.name || CURRENT_USER.username} ${superTag}</strong>
        <span>${CURRENT_USER.role || ''}</span>
      </div>`;
  }
  // Apply super-only visibility everywhere
  document.body.classList.toggle('is-super', !!(CURRENT_USER && CURRENT_USER.is_super));
}
function logout() {
  TOKEN = null;
  CURRENT_USER = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  showLogin();
}

async function doLogin() {
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  const err = document.getElementById('loginError');
  err.textContent = '';
  console.log('[FUKU] Attempting login as:', u);
  if (!u || !p) {
    err.textContent = 'Please enter both username and password.';
    return;
  }
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      err.textContent = d.error || `Login failed (${res.status}). Make sure you opened http://localhost:8765/admin in a regular browser.`;
      console.error('[FUKU] Login failed:', res.status, d);
      return;
    }
    const data = await res.json();
    TOKEN = data.token;
    CURRENT_USER = { username: data.username, name: data.name, role: data.role, is_super: !!data.is_super };
    localStorage.setItem(TOKEN_KEY, TOKEN);
    localStorage.setItem(USER_KEY, JSON.stringify(CURRENT_USER));
    console.log('[FUKU] Login successful as', data.name, data.is_super ? '🛡️ SUPER' : '');
    showApp();
  } catch (e) {
    err.textContent = 'Cannot reach server. Open this page at http://localhost:8765/admin (not via file:// or preview).';
    console.error('[FUKU] Login error:', e);
  }
}

document.getElementById('loginForm').addEventListener('submit', e => {
  e.preventDefault();
  doLogin();
});
// Defensive: also fire on direct button click (some sandboxed envs swallow form submit)
document.querySelector('#loginForm button[type="submit"]').addEventListener('click', e => {
  e.preventDefault();
  doLogin();
});

// One-click quick login
document.getElementById('quickLoginBtn').addEventListener('click', () => {
  document.getElementById('loginUser').value = 'aakash';
  document.getElementById('loginPass').value = 'Aakash@2026';
  doLogin();
});

document.getElementById('logoutBtn').addEventListener('click', logout);

// ============================================
// VIEW ROUTER
// ============================================
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const view = link.dataset.view;
    document.querySelectorAll('.nav-link').forEach(n => n.classList.toggle('active', n === link));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.dataset.view === view));
    switch (view) {
      case 'dashboard': loadDashboard(); break;
      case 'orders':    loadOrders(); break;
      case 'stock':     loadStock(); break;
      case 'products':  loadProducts(); break;
      case 'accounts':       loadAccounts(); break;
      case 'team':           loadTeam(); break;
      case 'resellers':      loadResellers(); break;
      case 'subscriptions':  loadSubscriptions(); break;
      case 'social':         loadSocial(); break;
      case 'chats':          loadChats(); break;
      case 'reports':        loadReports(); break;
      case 'settings':       loadSettings(); break;
    }
  });
});

// ============================================
// HELPERS
// ============================================
const INR = n => '₹' + Number(n || 0).toLocaleString('en-IN');
const intf = n => Number(n || 0).toLocaleString('en-IN');
const sourceTag = s => `<span class="source-tag source-${s}">${s}</span>`;
const statusPill = s => `<span class="pill pill-${s}">${s}</span>`;
function teamName(id) {
  if (!id) return '—';
  const m = TEAM.find(t => t.id === id);
  return m ? m.name : id;
}
function teamTag(id) {
  if (!id) return '<span class="team-tag team-tag-none">—</span>';
  const m = TEAM.find(t => t.id === id) || { name: id };
  return `<span class="team-tag team-${id}">${m.name}</span>`;
}
function paymentPill(method, status) {
  const m = method || 'pending';
  const s = status || 'unpaid';
  const methodIcon = m === 'cash' ? '💵' : m === 'online' ? '🌐' : '⏳';
  const cls = s === 'paid' ? 'paid' : (s === 'refunded' ? 'refunded' : 'unpaid');
  return `<span class="pay-pill pay-${cls}" title="${m} · ${s}">${methodIcon} ${m === 'pending' ? 'pending' : m} · ${s}</span>`;
}
function teamOptions(selectedId, extraOption) {
  let opts = '<option value="">— none —</option>';
  if (extraOption && !TEAM.find(t => t.id === extraOption)) {
    opts += `<option value="${extraOption}">${extraOption}</option>`;
  }
  TEAM.forEach(t => {
    opts += `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${t.name} — ${t.role}</option>`;
  });
  return opts;
}

function formatDate(d) {
  const dt = new Date(d.replace(' ', 'T') + (d.includes('Z') ? '' : 'Z'));
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' · ' +
         dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function shortDate(d) {
  const dt = new Date(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function chartBase(opts = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: COLORS.ink3, font: { size: 11, family: 'Inter' } } },
      tooltip: {
        backgroundColor: COLORS.ink,
        titleFont: { family: 'Inter', size: 12, weight: 600 },
        bodyFont:  { family: 'Inter', size: 12 },
        padding: 10, cornerRadius: 8,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: COLORS.ink3, font: { size: 11, family: 'Inter' } },
      },
      y: {
        grid: { color: '#F0EAF8' },
        ticks: { color: COLORS.ink3, font: { size: 11, family: 'Inter' } },
        beginAtZero: true,
      },
    },
    ...opts,
  };
}

// ============================================
// DASHBOARD
// ============================================
async function loadDashboard() {
  try {
    const summary = await api('/api/admin/sales/summary');
    animateValue('kpiTodayRev',    summary.today.revenue, '₹');
    document.getElementById('kpiTodayOrders').textContent = summary.today.orders;
    animateValue('kpiWeekRev',     summary.week.revenue,  '₹');
    document.getElementById('kpiWeekOrders').textContent  = summary.week.orders;
    animateValue('kpiMonthRev',    summary.month.revenue, '₹');
    document.getElementById('kpiMonthOrders').textContent = summary.month.orders;
    animateValue('kpiAOV',         Math.round(summary.avg_order_value), '₹');
    document.getElementById('kpiPending').textContent     = summary.pending_orders;
    document.getElementById('kpiLow').textContent         = summary.low_stock_count;
    document.getElementById('kpiOOS').textContent         = summary.out_of_stock_count;

    loadInsights();
    loadNotifications();

    // Sidebar badges
    const ob = document.getElementById('navOrdersBadge');
    ob.textContent = summary.pending_orders ? summary.pending_orders : '';
    const sb = document.getElementById('navStockBadge');
    const stockAlert = summary.low_stock_count + summary.out_of_stock_count;
    sb.textContent = stockAlert ? stockAlert : '';

    document.getElementById('lastUpdated').textContent =
      new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  } catch (e) { showToast(e.message); }

  await drawSalesChart('daily');
  await drawTopProducts();
  await drawCategoryMix();
  await loadRecentOrders();
}

document.getElementById('refreshBtn').addEventListener('click', loadDashboard);

document.querySelectorAll('#salesTabs .tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('#salesTabs .tab').forEach(t => t.classList.toggle('active', t === tab));
    drawSalesChart(tab.dataset.range);
  });
});

async function drawSalesChart(range) {
  destroyChart('sales');
  let labels = [], rev = [], orders = [];

  if (range === 'daily') {
    const data = await api('/api/admin/sales/daily?days=30');
    labels = data.map(d => shortDate(d.date));
    rev    = data.map(d => d.revenue);
    orders = data.map(d => d.order_count);
  } else if (range === 'weekly') {
    const data = await api('/api/admin/sales/weekly?weeks=12');
    labels = data.map(d => d.wk);
    rev    = data.map(d => d.revenue);
    orders = data.map(d => d.order_count);
  } else {
    const data = await api('/api/admin/sales/monthly?months=12');
    labels = data.map(d => d.month);
    rev    = data.map(d => d.revenue);
    orders = data.map(d => d.order_count);
  }

  const ctx = document.getElementById('salesChart').getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 320);
  grad.addColorStop(0, 'rgba(74, 26, 142, 0.35)');
  grad.addColorStop(1, 'rgba(74, 26, 142, 0)');

  charts.sales = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Revenue (₹)',
          data: rev,
          borderColor: COLORS.purple,
          backgroundColor: grad,
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: COLORS.purple,
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
          yAxisID: 'y',
        },
        {
          label: 'Orders',
          data: orders,
          borderColor: COLORS.orange,
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [4, 4],
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 5,
          yAxisID: 'y1',
        },
      ],
    },
    options: chartBase({
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { grid: { display: false }, ticks: { color: COLORS.ink3, font: { size: 10.5 }, maxRotation: 0 } },
        y: {
          position: 'left',
          grid: { color: '#F0EAF8' },
          ticks: { color: COLORS.ink3, font: { size: 11 }, callback: v => '₹' + (v / 1000).toFixed(0) + 'k' },
          beginAtZero: true,
        },
        y1: {
          position: 'right',
          grid: { display: false },
          ticks: { color: COLORS.ink3, font: { size: 11 } },
          beginAtZero: true,
        },
      },
    }),
  });
}

async function drawTopProducts() {
  destroyChart('top');
  const data = await api('/api/admin/sales/top-products');
  const labels = data.map(d => d.product_name.replace(/—.*$/, '').trim().substring(0, 18));
  const units  = data.map(d => d.units_sold);

  charts.top = new Chart(document.getElementById('topProductsChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Units',
        data: units,
        backgroundColor: PURPLE_PALETTE,
        borderRadius: 6,
      }],
    },
    options: chartBase({
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: '#F0EAF8' }, ticks: { color: COLORS.ink3, font: { size: 11 } }, beginAtZero: true },
        y: { grid: { display: false }, ticks: { color: COLORS.ink3, font: { size: 11 } } },
      },
    }),
  });
}

async function drawCategoryMix() {
  destroyChart('cat');
  const data = await api('/api/admin/sales/by-category');
  const labels = data.map(d => ({ beans: 'Coffee Beans', instant: 'Instant', coldbrew: 'Cold Brew' }[d.category] || d.category));
  const rev    = data.map(d => d.revenue);

  charts.cat = new Chart(document.getElementById('catChart'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: rev,
        backgroundColor: [COLORS.purple, COLORS.purpleL, COLORS.orange],
        borderColor: '#fff',
        borderWidth: 3,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: { position: 'bottom', labels: { color: COLORS.ink3, font: { size: 12, family: 'Inter' }, padding: 14 } },
        tooltip: {
          backgroundColor: COLORS.ink, padding: 10, cornerRadius: 8,
          callbacks: { label: ctx => `${ctx.label}: ${INR(ctx.parsed)}` },
        },
      },
    },
  });
}

async function loadRecentOrders() {
  const orders = await api('/api/admin/orders?limit=10');
  const tbody = document.querySelector('#recentOrdersTable tbody');
  tbody.innerHTML = orders.map(o => `
    <tr>
      <td><span class="order-no">${o.order_no}</span></td>
      <td>
        <div class="customer-name">${o.customer_name || '—'}</div>
        <div class="customer-meta">${o.customer_phone || ''}</div>
      </td>
      <td class="num">${o.items.reduce((s, i) => s + i.qty, 0)}</td>
      <td class="num">${INR(o.total)}</td>
      <td>${statusPill(o.status)}</td>
      <td>${sourceTag(o.source)}</td>
      <td>${formatDate(o.created_at)}</td>
    </tr>
  `).join('');
}

// ============================================
// ORDERS VIEW
// ============================================
async function loadOrders() {
  const status = document.getElementById('orderFilter').value;
  const q = status ? `?limit=200&status=${status}` : '?limit=200';
  const orders = await api('/api/admin/orders' + q);
  const tbody = document.querySelector('#ordersTable tbody');
  tbody.innerHTML = orders.map(o => `
    <tr data-order-id="${o.id}">
      <td><span class="order-no">${o.order_no}</span></td>
      <td>
        <div class="customer-name">${o.customer_name || '—'}</div>
        <div class="customer-meta">${o.customer_phone || ''} ${o.customer_email ? '· ' + o.customer_email : ''}</div>
      </td>
      <td class="num">${o.items.reduce((s, i) => s + i.qty, 0)}</td>
      <td class="num">${INR(o.total)}</td>
      <td>${paymentPill(o.payment_method, o.payment_status)}</td>
      <td>
        <select class="status-select" data-id="${o.id}">
          ${['pending','confirmed','shipped','delivered','cancelled'].map(s =>
            `<option value="${s}" ${s===o.status?'selected':''}>${s}</option>`
          ).join('')}
        </select>
      </td>
      <td>${sourceTag(o.source)}</td>
      <td>${formatDate(o.created_at)}</td>
      <td><button class="btn-ghost view-order-btn" data-id="${o.id}">View</button></td>
    </tr>
  `).join('') || `<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--ink-3)">No orders</td></tr>`;

  tbody.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      try {
        await api(`/api/admin/orders/${sel.dataset.id}/status`, {
          method: 'PUT',
          body: JSON.stringify({ status: sel.value }),
        });
        showToast('Order status updated');
        loadDashboard();
      } catch (e) { showToast(e.message); }
    });
  });

  tbody.querySelectorAll('.view-order-btn').forEach(btn => {
    btn.addEventListener('click', () => showOrderModal(btn.dataset.id));
  });
}

document.getElementById('orderFilter').addEventListener('change', loadOrders);
document.getElementById('refreshOrdersBtn').addEventListener('click', loadOrders);

let CURRENT_ORDER = null;
let MODAL_MODE = 'view';   // 'view' | 'edit'

async function showOrderModal(id) {
  CURRENT_ORDER = await api(`/api/admin/orders/${id}`);
  MODAL_MODE = 'view';
  renderOrderModal();
  document.getElementById('orderModal').hidden = false;
}

function renderOrderModal() {
  const o = CURRENT_ORDER;
  document.getElementById('orderModalTitle').textContent =
    o.order_no + (MODAL_MODE === 'edit' ? ' · Editing' : '');

  if (MODAL_MODE === 'view') {
    document.getElementById('orderModalBody').innerHTML = `
      <div class="modal-row"><span class="ml">Customer</span><span class="mv">${o.customer_name || '—'}</span></div>
      <div class="modal-row"><span class="ml">Phone</span><span class="mv">${o.customer_phone || '—'}</span></div>
      <div class="modal-row"><span class="ml">Email</span><span class="mv">${o.customer_email || '—'}</span></div>
      <div class="modal-row"><span class="ml">Address</span><span class="mv">${o.shipping_address || '—'}</span></div>
      <div class="modal-row"><span class="ml">Status</span><span class="mv">${statusPill(o.status)}</span></div>
      <div class="modal-row"><span class="ml">Source</span><span class="mv">${sourceTag(o.source)}</span></div>
      <div class="modal-row"><span class="ml">Notes</span><span class="mv">${o.notes || '—'}</span></div>
      <div class="modal-row"><span class="ml">Created</span><span class="mv">${formatDate(o.created_at)}</span></div>
      <div class="modal-row"><span class="ml">Coffee Handled</span><span class="mv">${teamTag(o.coffee_handled_by)}</span></div>
      <div class="modal-items">
        ${o.items.map(i => `
          <div class="modal-item">
            <span>${i.product_name}</span>
            <span class="mi-qty">× ${i.qty}</span>
            <span class="mi-price">${INR(i.line_total)}</span>
          </div>
        `).join('')}
      </div>
      <div class="modal-row" style="margin-top:14px"><span class="ml">Subtotal</span><span class="mv">${INR(o.subtotal)}</span></div>
      <div class="modal-row"><span class="ml">Shipping</span><span class="mv">${o.shipping ? INR(o.shipping) : 'FREE'}</span></div>
      ${o.discount ? `<div class="modal-row"><span class="ml">Discount</span><span class="mv">− ${INR(o.discount)}</span></div>` : ''}
      <div class="modal-row"><span class="ml" style="font-weight:700;color:var(--ink)">TOTAL</span><span class="mv" style="font-family:var(--font-disp);font-size:20px;font-weight:800">${INR(o.total)}</span></div>

      ${renderPaymentSection(o)}

      ${renderPorterSection(o)}

      <div class="form-actions" style="margin-top:18px">
        <button type="button" class="btn-ghost" id="orderInvoiceBtn">🧾 Invoice</button>
        <button type="button" class="btn-primary-modal" id="orderEditBtn">✏️ Edit Order</button>
      </div>
    `;
    document.getElementById('orderEditBtn').addEventListener('click', enterEditMode);
    document.getElementById('orderInvoiceBtn').addEventListener('click', () => openInvoice(o));
    wirePaymentHandlers();
    wirePorterHandlers();
  } else {
    renderEditMode();
  }
}

async function enterEditMode() {
  // make sure we have products
  if (!window.__FUKU_PRODUCTS__ || !window.__FUKU_PRODUCTS__.length) {
    window.__FUKU_PRODUCTS__ = await api('/api/products');
  }
  MODAL_MODE = 'edit';
  renderOrderModal();
}

function renderEditMode() {
  const o = CURRENT_ORDER;
  const products = window.__FUKU_PRODUCTS__ || [];
  const itemsHtml = o.items.map(i => editItemRow(i.product_id, i.qty, i.product_name, i.unit_price)).join('');
  const addOpts = products.map(p =>
    `<option value="${p.id}" data-price="${p.price}">${p.name} — ₹${p.price} (stock: ${p.stock})</option>`
  ).join('');

  document.getElementById('orderModalBody').innerHTML = `
    <div class="form-row">
      <label>Customer Name</label>
      <input type="text" id="edCustomerName" value="${escapeAttr(o.customer_name || '')}" />
    </div>
    <div class="form-row">
      <label>Phone</label>
      <input type="text" id="edCustomerPhone" value="${escapeAttr(o.customer_phone || '')}" />
    </div>
    <div class="form-row">
      <label>Email</label>
      <input type="text" id="edCustomerEmail" value="${escapeAttr(o.customer_email || '')}" />
    </div>
    <div class="form-row">
      <label>Shipping Address</label>
      <input type="text" id="edShippingAddress" value="${escapeAttr(o.shipping_address || '')}" />
    </div>
    <div class="form-row form-row-two">
      <div>
        <label>Status</label>
        <select id="edStatus">
          ${['pending','confirmed','shipped','delivered','cancelled'].map(s =>
            `<option value="${s}" ${s===o.status?'selected':''}>${s}</option>`
          ).join('')}
        </select>
      </div>
      <div>
        <label>Discount (₹)</label>
        <input type="number" id="edDiscount" min="0" value="${o.discount || 0}" />
      </div>
    </div>
    <div class="form-row">
      <label>Notes</label>
      <input type="text" id="edNotes" value="${escapeAttr(o.notes || '')}" />
    </div>
    <div class="form-row">
      <label>Coffee Handled By</label>
      <select id="edCoffeeBy">${teamOptions(o.coffee_handled_by)}</select>
    </div>
    <div class="form-row">
      <label>Payment Method</label>
      <select id="edPaymentMethod">
        <option value="pending" ${o.payment_method === 'pending' || !o.payment_method ? 'selected' : ''}>Pending (not set)</option>
        <option value="cash"    ${o.payment_method === 'cash'    ? 'selected' : ''}>💵 Cash</option>
        <option value="online"  ${o.payment_method === 'online'  ? 'selected' : ''}>🌐 Online (UPI / Card / Bank)</option>
      </select>
    </div>

    <div class="edit-items-section">
      <div class="edit-items-head">
        <h4>Line Items</h4>
        <div class="edit-add-row">
          <select id="edAddProduct">${addOpts}</select>
          <button type="button" class="btn-ghost" id="edAddBtn">+ Add Item</button>
        </div>
      </div>
      <div id="edItemsList">${itemsHtml}</div>
    </div>

    <div class="modal-row" style="margin-top:18px" id="edSubtotalRow"></div>
    <div class="modal-row" id="edShippingRow"></div>
    <div class="modal-row" id="edTotalRow"></div>

    <div class="form-actions" style="margin-top:18px">
      <button type="button" class="btn-ghost" id="orderCancelBtn">Cancel</button>
      <button type="button" class="btn-primary-modal" id="orderSaveBtn">💾 Save Changes</button>
    </div>
  `;

  // wire item row handlers
  attachItemHandlers();
  recalcTotals();

  document.getElementById('edAddBtn').addEventListener('click', () => {
    const sel = document.getElementById('edAddProduct');
    const opt = sel.options[sel.selectedIndex];
    const pid = sel.value;
    if (!pid) return;
    if (document.querySelector(`.ed-item-row[data-pid="${pid}"]`)) {
      // already exists — bump qty
      const inp = document.querySelector(`.ed-item-row[data-pid="${pid}"] .ed-qty`);
      inp.value = parseInt(inp.value, 10) + 1;
      recalcTotals();
      return;
    }
    const product = products.find(p => p.id === pid);
    const row = document.createElement('div');
    row.innerHTML = editItemRow(pid, 1, product.name, product.price);
    document.getElementById('edItemsList').appendChild(row.firstElementChild);
    attachItemHandlers();
    recalcTotals();
  });

  document.getElementById('orderCancelBtn').addEventListener('click', () => {
    MODAL_MODE = 'view';
    renderOrderModal();
  });
  document.getElementById('orderSaveBtn').addEventListener('click', saveOrderEdits);
  document.querySelectorAll('#orderModal input, #orderModal select').forEach(el => {
    el.addEventListener('input', recalcTotals);
    el.addEventListener('change', recalcTotals);
  });
}

function editItemRow(pid, qty, name, unitPrice) {
  return `
    <div class="ed-item-row" data-pid="${pid}" data-price="${unitPrice}">
      <span class="ed-item-name">${name}</span>
      <span class="ed-unit">₹${unitPrice}</span>
      <input type="number" class="ed-qty" min="1" value="${qty}" />
      <span class="ed-line-total">${INR(unitPrice * qty)}</span>
      <button type="button" class="ed-remove" title="Remove">✕</button>
    </div>
  `;
}

function attachItemHandlers() {
  document.querySelectorAll('.ed-item-row .ed-qty').forEach(inp => {
    inp.oninput = () => {
      const row = inp.closest('.ed-item-row');
      const price = parseInt(row.dataset.price, 10);
      const q = Math.max(1, parseInt(inp.value, 10) || 1);
      row.querySelector('.ed-line-total').textContent = INR(price * q);
      recalcTotals();
    };
  });
  document.querySelectorAll('.ed-item-row .ed-remove').forEach(btn => {
    btn.onclick = () => {
      btn.closest('.ed-item-row').remove();
      recalcTotals();
    };
  });
}

function recalcTotals() {
  const rows = document.querySelectorAll('.ed-item-row');
  let subtotal = 0;
  rows.forEach(r => {
    const price = parseInt(r.dataset.price, 10);
    const qty = Math.max(1, parseInt(r.querySelector('.ed-qty').value, 10) || 1);
    subtotal += price * qty;
  });
  const discount = parseInt(document.getElementById('edDiscount')?.value || 0, 10);
  const shipping = subtotal >= 999 ? 0 : 80;
  const total = Math.max(0, subtotal + shipping - discount);
  document.getElementById('edSubtotalRow').innerHTML =
    `<span class="ml">Subtotal</span><span class="mv">${INR(subtotal)}</span>`;
  document.getElementById('edShippingRow').innerHTML =
    `<span class="ml">Shipping</span><span class="mv">${shipping ? INR(shipping) : 'FREE'}</span>`;
  document.getElementById('edTotalRow').innerHTML =
    `<span class="ml" style="font-weight:700;color:var(--ink)">TOTAL</span><span class="mv" style="font-family:var(--font-disp);font-size:20px;font-weight:800">${INR(total)}</span>`;
}

async function saveOrderEdits() {
  const items = Array.from(document.querySelectorAll('.ed-item-row')).map(r => ({
    id: r.dataset.pid,
    qty: Math.max(1, parseInt(r.querySelector('.ed-qty').value, 10) || 1),
  }));
  if (!items.length) { showToast('Order must have at least one item'); return; }

  const body = {
    customer_name:      document.getElementById('edCustomerName').value.trim(),
    customer_phone:     document.getElementById('edCustomerPhone').value.trim(),
    customer_email:     document.getElementById('edCustomerEmail').value.trim(),
    shipping_address:   document.getElementById('edShippingAddress').value.trim(),
    notes:              document.getElementById('edNotes').value.trim(),
    status:             document.getElementById('edStatus').value,
    discount:           parseInt(document.getElementById('edDiscount').value, 10) || 0,
    coffee_handled_by:  document.getElementById('edCoffeeBy').value || null,
    payment_method:     document.getElementById('edPaymentMethod').value,
    items,
  };

  try {
    const r = await api(`/api/admin/orders/${CURRENT_ORDER.id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    showToast('Order updated');
    CURRENT_ORDER = r.order;
    MODAL_MODE = 'view';
    renderOrderModal();
    // refresh orders + dashboard in background
    loadOrders();
    loadDashboard();
  } catch (e) { showToast(e.message); }
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// ============================================
// PAYMENT CONFIRMATION
// ============================================
function renderPaymentSection(o) {
  const isPaid = o.payment_status === 'paid';
  const handler = TEAM.find(t => t.is_payment_handler) || { name: 'Nisarg', id: 'nisarg' };
  if (isPaid) {
    return `
      <section class="pay-card pay-card-paid">
        <header class="porter-head">
          <div>
            <h4>💰 Payment</h4>
            <p>Confirmed by ${teamName(o.payment_confirmed_by)} · ${o.payment_confirmed_at ? formatDate(o.payment_confirmed_at) : '—'}</p>
          </div>
          <span class="porter-badge porter-badge-done">paid · ${o.payment_method || ''}</span>
        </header>
        <div class="porter-grid">
          <div><span class="ml">Method</span><span class="mv">${o.payment_method === 'cash' ? '💵 Cash' : '🌐 Online'}</span></div>
          <div><span class="ml">Reference</span><span class="mv">${o.payment_reference ? `<code>${o.payment_reference}</code>` : '—'}</span></div>
          <div><span class="ml">Confirmed By</span><span class="mv">${teamTag(o.payment_confirmed_by)}</span></div>
          <div><span class="ml">Confirmed At</span><span class="mv">${o.payment_confirmed_at ? formatDate(o.payment_confirmed_at) : '—'}</span></div>
        </div>
      </section>
    `;
  }
  return `
    <section class="pay-card">
      <header class="porter-head">
        <div>
          <h4>💰 Payment Pending</h4>
          <p>To be confirmed by ${handler.name} — choose method</p>
        </div>
        <span class="porter-badge porter-badge-idle">unpaid</span>
      </header>
      <div class="pay-form">
        <div class="pay-method-toggle">
          <label class="pay-method-opt ${(o.payment_method || 'pending') === 'cash' ? 'selected' : ''}">
            <input type="radio" name="payMethod" value="cash" ${o.payment_method === 'cash' ? 'checked' : ''} />
            💵 Cash
          </label>
          <label class="pay-method-opt ${o.payment_method === 'online' ? 'selected' : ''}">
            <input type="radio" name="payMethod" value="online" ${o.payment_method === 'online' ? 'checked' : ''} />
            🌐 Online (UPI / Card / Bank)
          </label>
        </div>
        <div class="form-row" id="payRefRow" style="display:${o.payment_method === 'online' ? 'flex' : 'none'}">
          <label>UPI / Transaction reference (optional)</label>
          <input type="text" id="payReference" placeholder="e.g. UPI ID, last 6 digits…" />
        </div>
        <div class="form-row">
          <label>Confirmed by</label>
          <select id="payConfirmedBy">
            ${teamOptions(handler.id)}
          </select>
        </div>
        <div class="form-actions" style="margin-top:6px">
          <button type="button" class="btn-primary-modal" id="confirmPaymentBtn">✓ Mark as Paid</button>
        </div>
      </div>
    </section>
  `;
}

function wirePaymentHandlers() {
  const o = CURRENT_ORDER;
  const $ = id => document.getElementById(id);
  // toggle reference field on method change
  document.querySelectorAll('input[name="payMethod"]').forEach(r => {
    r.addEventListener('change', () => {
      document.querySelectorAll('.pay-method-opt').forEach(o => o.classList.remove('selected'));
      r.closest('.pay-method-opt').classList.add('selected');
      const refRow = $('payRefRow');
      if (refRow) refRow.style.display = r.value === 'online' ? 'flex' : 'none';
    });
  });

  $('confirmPaymentBtn')?.addEventListener('click', async () => {
    const sel = document.querySelector('input[name="payMethod"]:checked');
    if (!sel) { showToast('Pick a payment method (Cash or Online)'); return; }
    const reference = $('payReference')?.value.trim() || '';
    const confirmedBy = $('payConfirmedBy').value;
    try {
      const r = await api(`/api/admin/orders/${o.id}/payment`, {
        method: 'POST',
        body: JSON.stringify({
          payment_method: sel.value,
          confirmed_by: confirmedBy,
          payment_reference: reference,
        }),
      });
      CURRENT_ORDER = r.order;
      showToast(`Payment confirmed by ${teamName(confirmedBy)}`);
      renderOrderModal();
      loadOrders();
    } catch (e) { showToast(e.message); }
  });
}

// ============================================
// TEAM VIEW
// ============================================
async function loadTeam() {
  const stats = await api('/api/admin/team/stats');
  TEAM = stats;  // refresh cache

  const totalCapital = stats.reduce((s, t) => s + (t.invested_amount || 0), 0);
  const totalEquity  = stats.reduce((s, t) => s + (t.equity_pct || 0), 0);

  const grid = document.getElementById('teamGrid');
  grid.innerHTML = `
    <article class="team-card team-card-summary">
      <div class="team-avatar">💼</div>
      <h3>Capital Stack</h3>
      <p class="team-role">Total invested by partners</p>
      <ul class="team-stats">
        <li><span>Total capital</span><strong>${INR(totalCapital)}</strong></li>
        <li><span>Equity allocated</span><strong>${totalEquity.toFixed(1)}%</strong></li>
        <li><span>Partners</span><strong>${stats.length}</strong></li>
      </ul>
    </article>
  ` + stats.map(t => {
    const role = (t.role || '').toLowerCase();
    let icon = '👤';
    if (t.is_coffee_handler) icon = '☕';
    else if (t.is_payment_handler) icon = '💰';
    else if (/strateg/.test(role)) icon = '🧭';
    else if (/marketing|operations/.test(role)) icon = '📣';
    return `
      <article class="team-card team-card-${t.id}">
        <div class="team-avatar">${icon}</div>
        <h3>${t.name}</h3>
        <p class="team-role">${t.role || ''}</p>
        <ul class="team-stats">
          <li>
            <span>Invested</span>
            <strong class="ti-edit" data-id="${t.id}" data-field="invested_amount" data-type="money">${INR(t.invested_amount || 0)}</strong>
          </li>
          <li>
            <span>Equity %</span>
            <strong class="ti-edit" data-id="${t.id}" data-field="equity_pct" data-type="pct">${(t.equity_pct || 0).toFixed(1)}%</strong>
          </li>
          <li><span>Orders entered</span><strong>${intf(t.orders_entered)}</strong></li>
          <li><span>Revenue booked</span><strong>${INR(t.revenue_entered)}</strong></li>
          ${t.is_coffee_handler  ? `<li><span>Coffee handled</span><strong>${intf(t.orders_coffee)}</strong></li>` : ''}
          ${t.is_payment_handler ? `<li><span>Payments confirmed</span><strong>${intf(t.payments_confirmed)}</strong></li>` : ''}
          ${t.is_payment_handler ? `<li><span>Collected</span><strong>${INR(t.revenue_collected)}</strong></li>` : ''}
        </ul>
      </article>
    `;
  }).join('');

  // Click-to-edit invested_amount / equity_pct — super only
  grid.querySelectorAll('.ti-edit').forEach(el => {
    if (!(CURRENT_USER && CURRENT_USER.is_super)) {
      el.style.borderBottom = 'none';
      el.title = 'Super admin only — ask Aakash';
      return;
    }
    el.style.cursor = 'pointer';
    el.title = 'Click to edit';
    el.addEventListener('click', async () => {
      const { id, field, type } = el.dataset;
      const cur = type === 'money'
        ? prompt(`New investment amount for ${id} (₹, no commas):`, '0')
        : prompt(`New equity % for ${id} (e.g. 12.5):`, '0');
      if (cur === null) return;
      const val = type === 'money' ? parseInt(cur, 10) : parseFloat(cur);
      if (Number.isNaN(val) || val < 0) { showToast('Invalid number'); return; }
      try {
        await api(`/api/admin/team/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ [field]: val }),
        });
        showToast(`${id} updated`);
        loadTeam();
      } catch (e) { showToast(e.message); }
    });
  });

  const tbody = document.querySelector('#teamTable tbody');
  tbody.innerHTML = stats.map(t => `
    <tr>
      <td><div class="customer-name">${t.name}</div><div class="customer-meta">${t.id}</div></td>
      <td>${t.role || '—'}</td>
      <td class="num">${intf(t.orders_entered)}</td>
      <td class="num">${INR(t.revenue_entered)}</td>
      <td class="num">${t.is_coffee_handler ? intf(t.orders_coffee) : '—'}</td>
      <td class="num">${t.is_payment_handler ? intf(t.payments_confirmed) : '—'}</td>
      <td class="num">${t.is_payment_handler ? INR(t.revenue_collected) : '—'}</td>
    </tr>
  `).join('');
}
document.getElementById('refreshTeamBtn')?.addEventListener('click', loadTeam);

// ============================================
// ANIMATED KPI COUNTERS
// ============================================
function animateValue(id, end, prefix = '') {
  const el = document.getElementById(id);
  if (!el) return;
  const startText = (el.textContent || '').replace(/[^\d]/g, '');
  const start = parseInt(startText, 10) || 0;
  const dur = 700;
  const t0 = performance.now();
  function step(t) {
    const p = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    const v = Math.round(start + (end - start) * eased);
    el.textContent = prefix + v.toLocaleString('en-IN');
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ============================================
// SMART INSIGHTS
// ============================================
async function loadInsights() {
  try {
    const ins = await api('/api/admin/insights');
    const wrap = document.getElementById('insightsList');
    if (!wrap) return;
    wrap.innerHTML = ins.map(i => `
      <article class="insight insight-${i.severity}">
        <div class="insight-icon">${i.icon}</div>
        <div class="insight-body">
          <strong>${i.title}</strong>
          <span>${i.detail}</span>
        </div>
      </article>
    `).join('');
  } catch (e) {}
}

// ============================================
// NOTIFICATIONS BELL
// ============================================
async function loadNotifications() {
  try {
    const notes = await api('/api/admin/notifications');
    const badge = document.getElementById('notifBadge');
    const list  = document.getElementById('notifList');
    const count = document.getElementById('notifCount');
    if (notes.length) {
      badge.textContent = notes.length;
      badge.style.display = 'flex';
    } else { badge.style.display = 'none'; }
    count.textContent = notes.length + ' item' + (notes.length === 1 ? '' : 's');
    list.innerHTML = notes.length ? notes.map(n => `
      <button class="notif-item notif-${n.severity}" data-view="${n.view}">
        <span class="notif-icon">${n.icon}</span>
        <span class="notif-text">
          <strong>${n.title}</strong>
          <small>${n.detail}</small>
        </span>
        <span class="notif-go">→</span>
      </button>
    `).join('') : `<div class="notif-empty">🎉 All clear — nothing needs your attention.</div>`;
    list.querySelectorAll('.notif-item').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('notifPop').hidden = true;
        const link = document.querySelector(`.nav-link[data-view="${btn.dataset.view}"]`);
        if (link) link.click();
      });
    });
  } catch (e) {}
}
document.getElementById('notifBell')?.addEventListener('click', e => {
  e.stopPropagation();
  const pop = document.getElementById('notifPop');
  pop.hidden = !pop.hidden;
});
document.addEventListener('click', e => {
  const pop = document.getElementById('notifPop');
  if (pop && !pop.hidden && !pop.contains(e.target) && !e.target.closest('#notifBell')) {
    pop.hidden = true;
  }
});

// ============================================
// COMMAND PALETTE  (⌘K)
// ============================================
const CMDK_COMMANDS = [
  { id:'go-dashboard', icon:'📊', title:'Go to Dashboard', kind:'nav', target:'dashboard' },
  { id:'go-orders',    icon:'🛒', title:'Go to Orders',    kind:'nav', target:'orders' },
  { id:'go-stock',     icon:'📦', title:'Go to Stock',     kind:'nav', target:'stock' },
  { id:'go-team',      icon:'👥', title:'Go to Team',      kind:'nav', target:'team' },
  { id:'go-resellers', icon:'🤝', title:'Go to Resellers', kind:'nav', target:'resellers' },
  { id:'go-subs',      icon:'🔁', title:'Go to Subscriptions', kind:'nav', target:'subscriptions' },
  { id:'go-chats',     icon:'💬', title:'Go to Chatbot',   kind:'nav', target:'chats' },
  { id:'go-reports',   icon:'📈', title:'Go to Reports',   kind:'nav', target:'reports' },
  { id:'go-settings',  icon:'⚙️', title:'Go to Settings',  kind:'nav', target:'settings' },
  { id:'add-stock',    icon:'➕', title:'Add Stock Batch', kind:'action', action: () => { document.querySelector('.nav-link[data-view="stock"]').click(); setTimeout(() => document.getElementById('addStockBtn')?.click(), 300); } },
  { id:'add-reseller', icon:'🤝', title:'Add Reseller (super only)', kind:'action', action: () => { document.querySelector('.nav-link[data-view="resellers"]').click(); setTimeout(() => document.getElementById('newResellerBtn')?.click(), 300); } },
  { id:'view-store',   icon:'↗',  title:'Open Storefront in new tab', kind:'action', action: () => window.open('/', '_blank') },
  { id:'refresh',      icon:'↻',  title:'Refresh Dashboard', kind:'action', action: () => loadDashboard() },
  { id:'export-sales', icon:'⬇️', title:'Export Daily Sales CSV', kind:'action', action: () => document.getElementById('exportDailyCsv')?.click() },
  { id:'export-orders',icon:'⬇️', title:'Export Orders CSV', kind:'action', action: () => document.getElementById('exportOrdersCsv')?.click() },
  { id:'logout',       icon:'🚪', title:'Sign Out', kind:'action', action: () => logout() },
];

function openCmdk() {
  document.getElementById('cmdk').hidden = false;
  const inp = document.getElementById('cmdkInput');
  inp.value = '';
  renderCmdk('');
  setTimeout(() => inp.focus(), 50);
}
function closeCmdk() {
  document.getElementById('cmdk').hidden = true;
}
async function renderCmdk(q) {
  const wrap = document.getElementById('cmdkResults');
  const ql = q.toLowerCase().trim();
  // commands first (matched)
  const cmds = CMDK_COMMANDS.filter(c => !ql || c.title.toLowerCase().includes(ql));
  let html = '';
  if (cmds.length) {
    html += '<div class="cmdk-group"><div class="cmdk-label">Commands</div>';
    html += cmds.map((c, i) => `
      <button class="cmdk-item" data-cmd="${c.id}" data-idx="${i}">
        <span class="cmdk-i">${c.icon}</span>
        <span class="cmdk-t">${c.title}</span>
        <span class="cmdk-k">${c.kind}</span>
      </button>
    `).join('');
    html += '</div>';
  }
  // Then live search if query
  if (ql.length >= 2) {
    try {
      const s = await api('/api/admin/search?q=' + encodeURIComponent(ql));
      if (s.orders.length) {
        html += '<div class="cmdk-group"><div class="cmdk-label">Orders</div>';
        html += s.orders.map(o => `
          <button class="cmdk-item" data-order="${o.id}">
            <span class="cmdk-i">🛒</span>
            <span class="cmdk-t"><strong>${o.order_no}</strong> · ${o.customer_name || '—'} · ₹${o.total}</span>
            <span class="cmdk-k">${o.status}</span>
          </button>`).join('');
        html += '</div>';
      }
      if (s.products.length) {
        html += '<div class="cmdk-group"><div class="cmdk-label">Products</div>';
        html += s.products.map(p => `
          <button class="cmdk-item" data-product="${p.id}">
            <span class="cmdk-i">☕</span>
            <span class="cmdk-t"><strong>${p.name}</strong> · ₹${p.price}</span>
            <span class="cmdk-k">stock ${p.stock}</span>
          </button>`).join('');
        html += '</div>';
      }
      if (s.resellers.length) {
        html += '<div class="cmdk-group"><div class="cmdk-label">Resellers</div>';
        html += s.resellers.map(r => `
          <button class="cmdk-item" data-reseller="${r.ref_code}">
            <span class="cmdk-i">🤝</span>
            <span class="cmdk-t"><strong>${r.ref_code}</strong> · ${r.name} ${r.city ? '· ' + r.city : ''}</span>
            <span class="cmdk-k">reseller</span>
          </button>`).join('');
        html += '</div>';
      }
    } catch (e) {}
  }
  if (!html) html = '<div class="cmdk-empty">No matches — try a different search.</div>';
  wrap.innerHTML = html;

  // wire up clicks
  wrap.querySelectorAll('.cmdk-item').forEach(el => {
    el.addEventListener('click', () => handleCmdkItem(el));
  });
}
function handleCmdkItem(el) {
  closeCmdk();
  if (el.dataset.cmd) {
    const c = CMDK_COMMANDS.find(x => x.id === el.dataset.cmd);
    if (!c) return;
    if (c.kind === 'nav') document.querySelector(`.nav-link[data-view="${c.target}"]`)?.click();
    if (c.kind === 'action') c.action();
  }
  if (el.dataset.order) {
    document.querySelector('.nav-link[data-view="orders"]').click();
    setTimeout(() => showOrderModal(el.dataset.order), 400);
  }
  if (el.dataset.product) {
    document.querySelector('.nav-link[data-view="stock"]').click();
  }
  if (el.dataset.reseller) {
    document.querySelector('.nav-link[data-view="resellers"]').click();
  }
}
document.getElementById('cmdkTrigger')?.addEventListener('click', openCmdk);
document.getElementById('cmdkBackdrop')?.addEventListener('click', closeCmdk);
document.getElementById('cmdkInput')?.addEventListener('input', e => renderCmdk(e.target.value));
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openCmdk();
  }
  if (e.key === 'Escape' && !document.getElementById('cmdk').hidden) {
    closeCmdk();
  }
});

// ============================================
// INVOICE / RECEIPT MODAL
// ============================================
function openInvoice(o) {
  const itemRows = o.items.map(i => `
    <tr>
      <td>${i.product_name}</td>
      <td class="num">${i.qty}</td>
      <td class="num">${INR(i.unit_price)}</td>
      <td class="num">${INR(i.line_total)}</td>
    </tr>
  `).join('');
  document.getElementById('invoiceBody').innerHTML = `
    <div class="invoice">
      <header class="inv-head">
        <div class="inv-brand">
          <span class="inv-logo">FUKU</span>
          <span class="inv-tag">coffee</span>
          <p>Roasted in Piplod, Surat<br/>+91 95743 23011 · hello@fukucoffee.in</p>
        </div>
        <div class="inv-meta">
          <h2>RECEIPT</h2>
          <p><strong>${o.order_no}</strong></p>
          <p>${formatDate(o.created_at)}</p>
          <p class="inv-status pill pill-${o.status}">${o.status}</p>
        </div>
      </header>

      <section class="inv-cust">
        <div><strong>Bill To</strong><br/>${o.customer_name || '—'}<br/>+91 ${o.customer_phone || ''}<br/>${o.customer_email || ''}</div>
        <div><strong>Deliver To</strong><br/>${(o.shipping_address || '—').replace(/,/g, ',<br/>')}</div>
        <div><strong>Payment</strong><br/>${o.payment_method || '—'} · <em>${o.payment_status}</em>${o.payment_confirmed_by ? '<br/>by ' + teamName(o.payment_confirmed_by) : ''}${o.payment_reference ? '<br/>ref: ' + o.payment_reference : ''}</div>
      </section>

      <table class="inv-table">
        <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead>
        <tbody>${itemRows}</tbody>
      </table>

      <section class="inv-totals">
        <div><span>Subtotal</span><strong>${INR(o.subtotal)}</strong></div>
        <div><span>Delivery</span><strong>${o.shipping ? INR(o.shipping) : 'FREE'}</strong></div>
        ${o.discount ? `<div><span>Discount</span><strong>− ${INR(o.discount)}</strong></div>` : ''}
        <div class="inv-grand"><span>TOTAL</span><strong>${INR(o.total)}</strong></div>
      </section>

      ${o.reseller_ref ? `<p class="inv-note">Sold via reseller <strong>${o.reseller_ref}</strong></p>` : ''}
      ${o.porter_order_id ? `<p class="inv-note">Porter delivery: <strong>${o.porter_order_id}</strong> · ${o.porter_status || ''}</p>` : ''}
      <footer class="inv-foot">Thank you for choosing FUKU Coffee. ☕ <br/><small>Receipt generated ${new Date().toLocaleString('en-IN')}</small></footer>
    </div>
  `;
  document.getElementById('invoiceModal').hidden = false;
}
document.getElementById('invoiceModalClose')?.addEventListener('click', () => document.getElementById('invoiceModal').hidden = true);
document.querySelector('#invoiceModal .modal-backdrop')?.addEventListener('click', () => document.getElementById('invoiceModal').hidden = true);
document.getElementById('invoicePrintBtn')?.addEventListener('click', () => window.print());

// ============================================
// SOCIAL PLANNER  +  CALENDAR
// ============================================
let SOCIAL_MONTH = new Date().toISOString().slice(0, 7);   // YYYY-MM
let SOCIAL_PARTNERS = [];

const CONTENT_TYPE_META = {
  post:      { icon: '📷', cls: 'ct-post',  label: 'Post' },
  story:     { icon: '📱', cls: 'ct-story', label: 'Story' },
  reel:      { icon: '🎬', cls: 'ct-reel',  label: 'Reel' },
  promotion: { icon: '📣', cls: 'ct-promo', label: 'Promo' },
  collab:    { icon: '🤝', cls: 'ct-collab',label: 'Collab' },
};

function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}
function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

async function loadSocial() {
  const [analytics, cal] = await Promise.all([
    api('/api/admin/social/analytics'),
    api('/api/admin/social/calendar?month=' + SOCIAL_MONTH),
  ]);
  SOCIAL_PARTNERS = [];

  // KPIs
  const t = analytics.totals || {};
  document.getElementById('socialKpis').innerHTML = `
    <div class="kpi"><p class="kpi-label">Posted (all time)</p><h3 class="kpi-value">${intf(t.posts || 0)}</h3><p class="kpi-meta">${intf(analytics.upcoming || 0)} upcoming</p></div>
    <div class="kpi"><p class="kpi-label">Total Reach</p><h3 class="kpi-value">${intf(t.total_reach || 0)}</h3><p class="kpi-meta">across all platforms</p></div>
    <div class="kpi"><p class="kpi-label">Total Likes</p><h3 class="kpi-value">${intf(t.total_likes || 0)}</h3><p class="kpi-meta">${intf(t.total_comments || 0)} comments</p></div>
    <div class="kpi kpi-alt"><p class="kpi-label">Promo Spend</p><h3 class="kpi-value">${INR(t.total_spend || 0)}</h3><p class="kpi-meta">paid promotions</p></div>
    <div class="kpi"><p class="kpi-label">Cost / 1k reach</p><h3 class="kpi-value">${(t.total_reach > 0 ? INR(Math.round(t.total_spend * 1000 / t.total_reach)) : '—')}</h3><p class="kpi-meta">CPM</p></div>
    <div class="kpi"><p class="kpi-label">Engagement Rate</p><h3 class="kpi-value">${(t.total_reach > 0 ? ((t.total_likes + t.total_comments) * 100 / t.total_reach).toFixed(1) + '%' : '—')}</h3><p class="kpi-meta">likes+comments / reach</p></div>
  `;

  // Calendar
  document.getElementById('socialMonthLabel').textContent = monthLabel(SOCIAL_MONTH);
  document.getElementById('socialCalTitle').textContent = monthLabel(SOCIAL_MONTH);
  renderCalendar(cal);

}

function renderCalendar(cal) {
  const wrap = document.getElementById('socialCal');
  const firstWd = (cal.first_weekday || 1) - 1;   // shift Mon=0
  const days = cal.days_in_month;
  const map  = cal.posts_by_date || {};
  const today = new Date().toISOString().slice(0,10);
  let html = '<div class="cal-head">' + ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => `<span>${d}</span>`).join('') + '</div>';
  html += '<div class="cal-grid">';
  for (let i = 0; i < firstWd; i++) html += '<div class="cal-cell cal-blank"></div>';
  for (let d = 1; d <= days; d++) {
    const dateStr = `${cal.month}-${String(d).padStart(2,'0')}`;
    const posts = map[dateStr] || [];
    const isToday = dateStr === today;
    html += `
      <button class="cal-cell ${isToday ? 'cal-today' : ''} ${posts.length ? 'cal-has' : ''}" data-date="${dateStr}">
        <span class="cal-num">${d}</span>
        ${posts.slice(0,3).map(p => {
          const meta = CONTENT_TYPE_META[p.content_type] || { icon:'·', cls:'' };
          return `<span class="cal-pip ${meta.cls}" title="${p.title}">${meta.icon} ${p.title.substring(0,16)}</span>`;
        }).join('')}
        ${posts.length > 3 ? `<span class="cal-more">+${posts.length - 3} more</span>` : ''}
      </button>
    `;
  }
  html += '</div>';
  wrap.innerHTML = html;

  // click cell → open modal pre-filled with that date
  wrap.querySelectorAll('.cal-cell[data-date]').forEach(c => {
    c.addEventListener('click', () => {
      const posts = map[c.dataset.date] || [];
      if (posts.length === 1) openSocialModal(posts[0]);
      else if (posts.length) {
        // simple disambiguation — pick first
        openSocialModal(posts[0]);
      } else {
        openSocialModal(null, c.dataset.date);
      }
    });
  });

  // Upcoming list
  const all = Object.entries(map).flatMap(([d, ps]) => ps).sort((a,b) =>
    (a.scheduled_date + ' ' + (a.scheduled_time||'')).localeCompare(b.scheduled_date + ' ' + (b.scheduled_time||''))
  );
  const upWrap = document.getElementById('socialUpcomingList');
  upWrap.innerHTML = all.length ? all.map(p => {
    const meta = CONTENT_TYPE_META[p.content_type] || { icon:'·', cls:'', label:p.content_type };
    return `
      <button class="up-row ${meta.cls}" data-post-id="${p.id}">
        <span class="up-icon">${meta.icon}</span>
        <div class="up-body">
          <strong>${p.title}</strong>
          <small>${p.scheduled_date}${p.scheduled_time ? ' · ' + p.scheduled_time : ''} · ${meta.label} ${p.partner_handle ? '· ' + p.partner_handle : ''}</small>
        </div>
        <span class="up-status pill pill-${p.status === 'posted' ? 'delivered' : p.status === 'cancelled' ? 'cancelled' : p.status === 'draft' ? 'pending' : 'confirmed'}">${p.status}</span>
      </button>
    `;
  }).join('') : `<p style="padding:20px;color:var(--ink-3);text-align:center">No posts planned for ${monthLabel(cal.month)} yet. Click any day or "+ Plan Post".</p>`;

  upWrap.querySelectorAll('[data-post-id]').forEach(el => {
    el.addEventListener('click', async () => {
      const id = el.dataset.postId;
      const all = await api('/api/admin/social/posts?month=' + cal.month);
      const post = all.find(x => String(x.id) === String(id));
      if (post) openSocialModal(post);
    });
  });
}

function openSocialModal(post, defaultDate) {
  const isEdit = !!post;
  document.getElementById('socialModalTitle').textContent = isEdit ? `Edit Post — ${post.title}` : 'Plan a Post';

  // Partner field is now a free-text input (no preset partners)

  // Populate assignee
  const assigneeSel = document.getElementById('spAssignee');
  assigneeSel.innerHTML = '<option value="">— unassigned —</option>'
    + TEAM.map(t => `<option value="${t.id}">${t.name} — ${t.role}</option>`).join('');

  // Reset / populate
  document.getElementById('spId').value          = post?.id || '';
  document.getElementById('spTitle').value       = post?.title || '';
  document.getElementById('spType').value        = post?.content_type || 'post';
  document.getElementById('spPlatform').value    = post?.platform || 'instagram';
  document.getElementById('spPartner').value     = post?.partner_handle || '';
  document.getElementById('spDate').value        = post?.scheduled_date || defaultDate || new Date().toISOString().slice(0,10);
  document.getElementById('spTime').value        = post?.scheduled_time || '';
  document.getElementById('spAssignee').value    = post?.assigned_to || '';
  document.getElementById('spCost').value        = post?.cost || 0;
  document.getElementById('spCaption').value     = post?.caption || '';
  document.getElementById('spHashtags').value    = post?.hashtags || '';
  document.getElementById('spMedia').value       = post?.media_notes || '';
  document.getElementById('spStatus').value      = post?.status || 'scheduled';
  document.getElementById('spNotes').value       = post?.notes || '';

  document.getElementById('spUrl').value         = post?.posted_url || '';
  document.getElementById('spPostedAt').value    = post?.posted_at?.replace(' ', 'T').slice(0,16) || '';
  document.getElementById('spReach').value       = post?.reach || 0;
  document.getElementById('spLikes').value       = post?.likes || 0;
  document.getElementById('spComments').value    = post?.comments || 0;
  document.getElementById('spShares').value      = post?.shares || 0;
  document.getElementById('spSaves').value       = post?.saves || 0;
  document.getElementById('spClicks').value      = post?.link_clicks || 0;

  // Show perf block only when status === posted
  function syncPerf() {
    document.getElementById('spPerf').hidden = document.getElementById('spStatus').value !== 'posted';
  }
  document.getElementById('spStatus').onchange = syncPerf;
  syncPerf();

  // Delete only when editing
  const delBtn = document.getElementById('spDeleteBtn');
  delBtn.hidden = !isEdit;
  delBtn.onclick = async () => {
    if (!confirm('Delete this post?')) return;
    await api('/api/admin/social/posts/' + post.id, { method: 'DELETE' });
    showToast('Post deleted');
    closeSocialModal();
    loadSocial();
  };

  document.getElementById('socialModal').hidden = false;
}
function closeSocialModal() { document.getElementById('socialModal').hidden = true; }

document.getElementById('socialModalClose')?.addEventListener('click', closeSocialModal);
document.getElementById('spCancelBtn')?.addEventListener('click', closeSocialModal);
document.querySelector('#socialModal .modal-backdrop')?.addEventListener('click', closeSocialModal);
document.getElementById('newPostBtn')?.addEventListener('click', () => openSocialModal(null));
document.getElementById('socialPrevMonth')?.addEventListener('click', () => { SOCIAL_MONTH = shiftMonth(SOCIAL_MONTH, -1); loadSocial(); });
document.getElementById('socialNextMonth')?.addEventListener('click', () => { SOCIAL_MONTH = shiftMonth(SOCIAL_MONTH, +1); loadSocial(); });
document.getElementById('socialTodayBtn')?.addEventListener('click', () => { SOCIAL_MONTH = new Date().toISOString().slice(0,7); loadSocial(); });

document.getElementById('socialPostForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('spId').value;
  const body = {
    title:           document.getElementById('spTitle').value.trim(),
    content_type:    document.getElementById('spType').value,
    platform:        document.getElementById('spPlatform').value,
    partner_handle:  document.getElementById('spPartner').value || null,
    scheduled_date:  document.getElementById('spDate').value,
    scheduled_time:  document.getElementById('spTime').value || null,
    status:          document.getElementById('spStatus').value,
    caption:         document.getElementById('spCaption').value,
    hashtags:        document.getElementById('spHashtags').value,
    media_notes:     document.getElementById('spMedia').value,
    assigned_to:     document.getElementById('spAssignee').value || null,
    cost:            parseInt(document.getElementById('spCost').value, 10) || 0,
    notes:           document.getElementById('spNotes').value,
    posted_url:      document.getElementById('spUrl').value || null,
    posted_at:       document.getElementById('spPostedAt').value || null,
    reach:           parseInt(document.getElementById('spReach').value, 10) || 0,
    likes:           parseInt(document.getElementById('spLikes').value, 10) || 0,
    comments:        parseInt(document.getElementById('spComments').value, 10) || 0,
    shares:          parseInt(document.getElementById('spShares').value, 10) || 0,
    saves:           parseInt(document.getElementById('spSaves').value, 10) || 0,
    link_clicks:     parseInt(document.getElementById('spClicks').value, 10) || 0,
  };
  try {
    if (id) {
      await api('/api/admin/social/posts/' + id, { method: 'PUT', body: JSON.stringify(body) });
      showToast('Post updated');
    } else {
      await api('/api/admin/social/posts', { method: 'POST', body: JSON.stringify(body) });
      showToast('Post saved to calendar');
    }
    closeSocialModal();
    loadSocial();
  } catch (e) { showToast(e.message); }
});

// ============================================
// SETTINGS  +  RESET / GO LIVE
// ============================================
async function loadSettings() {
  // Current user
  const me = CURRENT_USER || await api('/api/admin/me').catch(() => null);
  const meEl = document.getElementById('settingsMe');
  if (me) {
    meEl.innerHTML = `
      <div class="settings-me-card">
        <div class="cu-avatar big">${(me.name || '?')[0]}</div>
        <div>
          <h4>${me.name || me.username}</h4>
          <p>${me.role || ''}</p>
          <span class="settings-uname">@${me.username}</span>
        </div>
      </div>`;
  }

  // Accounts
  try {
    const accounts = await api('/api/admin/accounts');
    document.getElementById('settingsAccounts').innerHTML = accounts.map(a => `
      <div class="account-row ${a.username === (me && me.username) ? 'is-me' : ''}">
        <div class="account-avatar ${a.is_super ? 'is-super' : ''}">${a.name[0]}</div>
        <div class="account-info">
          <strong>${a.name} ${a.is_super ? '<span class="cu-super">🛡️ SUPER</span>' : ''}</strong>
          <span>${a.role}</span>
        </div>
        <code class="account-uname">@${a.username}</code>
        ${a.username === (me && me.username) ? '<span class="account-you">you</span>' : ''}
      </div>
    `).join('');
  } catch (e) { /* ignore */ }
}

async function doReset(mode) {
  const labels = {
    transactions: 'This will permanently DELETE all orders and chatbot logs.\nProducts and stock are kept.',
    full: 'FULL RESET — this will permanently DELETE all orders, chats, stock batches & history, and set every product\'s stock to 0.\n\nUse this to go live.',
  };
  if (!confirm(labels[mode] + '\n\nContinue?')) return;
  const typed = prompt('Type  RESET  (in capitals) to confirm:');
  if (typed !== 'RESET') { showToast('Reset cancelled'); return; }
  try {
    const r = await api('/api/admin/reset', {
      method: 'POST',
      body: JSON.stringify({ mode, confirm: 'RESET' }),
    });
    showToast(mode === 'full' ? 'Full reset done — you\'re live! Add stock next.' : 'Orders & chats cleared.');
    // Refresh everything
    loadDashboard();
    if (mode === 'full') { setTimeout(() => location.reload(), 1200); }
  } catch (e) { showToast(e.message); }
}
document.getElementById('resetTxnBtn')?.addEventListener('click', () => doReset('transactions'));
document.getElementById('resetFullBtn')?.addEventListener('click', () => doReset('full'));

// ============================================
// RESELLERS
// ============================================
async function loadResellers() {
  const rows = await api('/api/admin/resellers');
  const tbody = document.querySelector('#resellersTable tbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--ink-3)">No resellers yet — click "+ Add Reseller" to invite your first partner.</td></tr>`;
    return;
  }
  // make share URL use current host instead of localhost
  const origin = location.origin;
  tbody.innerHTML = rows.map(r => {
    const url = `${origin}/?ref=${r.ref_code}`;
    return `
      <tr>
        <td><span class="order-no">${r.ref_code}</span></td>
        <td>
          <div class="customer-name">${r.name}</div>
          ${r.notes ? `<div class="customer-meta">${r.notes}</div>` : ''}
        </td>
        <td>${r.city || '—'}</td>
        <td>+91 ${r.phone}</td>
        <td>${r.commission_pct}%</td>
        <td class="num">${intf(r.orders_count)}</td>
        <td class="num">${INR(r.revenue)}</td>
        <td class="num" style="color:var(--green);font-weight:700">${INR(r.commission_due)}</td>
        <td>
          <button class="btn-ghost rs-copy" data-url="${url}">📋 Copy Link</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.rs-copy').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.url);
        showToast('Reseller link copied!');
      } catch { showToast(btn.dataset.url); }
    });
  });
}
document.getElementById('refreshResellersBtn')?.addEventListener('click', loadResellers);

// ============================================
// ACCOUNTS + VYAPAR INTEGRATION
// ============================================
async function loadAccounts() {
  const data = await api('/api/admin/accounts/summary');

  // KPI strip
  const t = data.today, m = data.month, a = data.all_time;
  document.getElementById('accountsKpis').innerHTML = `
    <div class="kpi"><p class="kpi-label">Revenue · Today</p><h3 class="kpi-value">${INR(t.revenue)}</h3><p class="kpi-meta">${intf(t.orders)} orders</p></div>
    <div class="kpi"><p class="kpi-label">Collected · Today</p><h3 class="kpi-value" style="color:var(--green)">${INR(t.collected)}</h3><p class="kpi-meta">Pending: ${INR(t.pending)}</p></div>
    <div class="kpi"><p class="kpi-label">Revenue · Month</p><h3 class="kpi-value">${INR(m.revenue)}</h3><p class="kpi-meta">${intf(m.orders)} orders</p></div>
    <div class="kpi"><p class="kpi-label">Collected · Month</p><h3 class="kpi-value" style="color:var(--green)">${INR(m.collected)}</h3><p class="kpi-meta">Pending: ${INR(m.pending)}</p></div>
    <div class="kpi"><p class="kpi-label">Cash (month)</p><h3 class="kpi-value">${INR(m.cash)}</h3><p class="kpi-meta">${m.revenue > 0 ? Math.round(m.cash*100/m.revenue) : 0}% of revenue</p></div>
    <div class="kpi"><p class="kpi-label">Online (month)</p><h3 class="kpi-value">${INR(m.online)}</h3><p class="kpi-meta">${m.revenue > 0 ? Math.round(m.online*100/m.revenue) : 0}% of revenue</p></div>
  `;

  // GST table
  const gstRows = [
    { label: 'Today',    ...data.today.gst },
    { label: 'This Month', ...data.month.gst },
    { label: 'All Time', ...data.all_time.gst },
  ];
  document.getElementById('gstTable').innerHTML = `
    <table class="data-table">
      <thead><tr><th>Period</th><th>Taxable Amount</th><th>GST (18%)</th><th>Total</th></tr></thead>
      <tbody>
        ${gstRows.map(r => `
          <tr>
            <td><strong>${r.label}</strong></td>
            <td class="num">${INR(r.base)}</td>
            <td class="num" style="color:var(--orange)">${INR(r.gst)}</td>
            <td class="num">${INR(r.total)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  // Payment split chart
  destroyChart('paymentSplit');
  charts.paymentSplit = new Chart(document.getElementById('paymentSplitChart'), {
    type: 'doughnut',
    data: {
      labels: ['💵 Cash', '🌐 Online', '⏳ Pending'],
      datasets: [{
        data: [m.cash, m.online, m.pending],
        backgroundColor: ['#F59E0B','#3B82F6','#E5E7EB'],
        borderWidth: 3, borderColor: '#fff',
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '58%',
      plugins: {
        legend: { position: 'bottom', labels: { color: COLORS.ink3, font: { size: 12, family: 'Inter' }, padding: 14 } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${INR(ctx.parsed)}` } },
      },
    },
  });

  // Top products table
  document.querySelector('#accountsTopTable tbody').innerHTML = data.top_products.length
    ? data.top_products.map(p => {
        const gst  = Math.round(p.rev - p.rev * 100 / 118);
        const base = p.rev - gst;
        return `<tr>
          <td class="customer-name">${p.product_name}</td>
          <td class="num">${intf(p.qty)}</td>
          <td class="num">${INR(p.rev)}</td>
          <td class="num" style="color:var(--orange)">${INR(gst)}</td>
          <td class="num">${INR(base)}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--ink-3)">No data for this month yet.</td></tr>`;

  // Unpaid orders
  document.querySelector('#unpaidTable tbody').innerHTML = data.unpaid_orders.length
    ? data.unpaid_orders.map(o => `
        <tr>
          <td><span class="order-no">${o.order_no}</span></td>
          <td>${o.customer_name||'—'}</td>
          <td>${o.customer_phone||'—'}</td>
          <td class="num"><strong>${INR(o.total)}</strong></td>
          <td>${o.payment_method||'—'}</td>
          <td>${formatDate(o.created_at)}</td>
          <td><button class="btn-ghost" onclick="showOrderModal(${o.id})">View</button></td>
        </tr>`).join('')
    : `<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--green)">🎉 All orders paid!</td></tr>`;
}

// Vyapar CSV download
function downloadVyaparCSV(from, to) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to)   params.set('to',   to);
  const url = `/api/admin/accounts/vyapar-csv?${params}`;
  const a = document.createElement('a');
  a.href = url; a.click();
  showToast('Downloading Vyapar CSV…');
}

document.getElementById('refreshAccountsBtn')?.addEventListener('click', loadAccounts);

document.getElementById('vExportBtn')?.addEventListener('click', () => {
  const from = document.getElementById('vExportFrom').value;
  const to   = document.getElementById('vExportTo').value;
  downloadVyaparCSV(from || null, to || null);
});

document.querySelectorAll('.vyapar-quick').forEach(btn => {
  btn.addEventListener('click', () => {
    const range = btn.dataset.range;
    const today = new Date().toISOString().slice(0,10);
    let from = null, to = today;
    if (range === 'today') { from = today; }
    else if (range === 'week') {
      const d = new Date(); d.setDate(d.getDate() - 6);
      from = d.toISOString().slice(0,10);
    } else if (range === 'month') {
      from = new Date().toISOString().slice(0,8) + '01';
    }
    downloadVyaparCSV(from, range === 'all' ? null : to);
  });
});

// Reseller modal
const rsModal = document.getElementById('resellerModal');
function openResellerModal() {
  document.getElementById('addResellerForm').reset();
  document.getElementById('rsComm').value = 10;
  rsModal.hidden = false;
}
function closeResellerModal() { rsModal.hidden = true; }
document.getElementById('newResellerBtn')?.addEventListener('click', openResellerModal);
document.getElementById('resellerModalClose')?.addEventListener('click', closeResellerModal);
document.getElementById('rsCancel')?.addEventListener('click', closeResellerModal);
document.querySelector('#resellerModal .modal-backdrop')?.addEventListener('click', closeResellerModal);
document.getElementById('addResellerForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const body = {
    ref_code:        document.getElementById('rsRefCode').value.trim().toUpperCase(),
    name:            document.getElementById('rsName').value.trim(),
    phone:           document.getElementById('rsPhone').value.trim(),
    city:            document.getElementById('rsCity').value.trim(),
    commission_pct:  parseFloat(document.getElementById('rsComm').value) || 10,
    notes:           document.getElementById('rsNotes').value.trim(),
  };
  try {
    const r = await api('/api/admin/resellers', { method: 'POST', body: JSON.stringify(body) });
    closeResellerModal();
    showToast(`Reseller ${r.ref_code} created`);
    loadResellers();
  } catch (e) { showToast(e.message); }
});

// ============================================
// SUBSCRIPTIONS
// ============================================
async function loadSubscriptions() {
  const subs = await api('/api/admin/subscriptions');
  const tbody = document.querySelector('#subsTable tbody');
  if (!subs.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--ink-3)">No subscriptions yet. They appear here when customers subscribe on the storefront.</td></tr>`;
    return;
  }
  tbody.innerHTML = subs.map(s => `
    <tr data-sid="${s.id}">
      <td><span class="order-no">#${s.id}</span></td>
      <td><strong>${s.plan}</strong><br/><span class="customer-meta">every ${s.frequency_days}d</span></td>
      <td>${s.customer_name || '—'}</td>
      <td>${s.customer_phone || '—'}</td>
      <td>${s.next_delivery || '—'}</td>
      <td>
        <select class="status-select sub-status" data-id="${s.id}">
          ${['requested','active','paused','cancelled','completed'].map(st =>
            `<option value="${st}" ${st===s.status?'selected':''}>${st}</option>`
          ).join('')}
        </select>
      </td>
      <td style="font-size:11.5px;color:var(--ink-3)">${formatDate(s.created_at)}</td>
      <td style="font-size:12px;color:var(--ink-3)">${s.notes || '—'}</td>
    </tr>
  `).join('');
  tbody.querySelectorAll('.sub-status').forEach(sel => {
    sel.addEventListener('change', async () => {
      try {
        await api(`/api/admin/subscriptions/${sel.dataset.id}/status`, {
          method: 'PUT',
          body: JSON.stringify({ status: sel.value }),
        });
        showToast('Subscription updated');
      } catch (e) { showToast(e.message); }
    });
  });
}
document.getElementById('refreshSubsBtn')?.addEventListener('click', loadSubscriptions);

// ============================================
// PORTER DELIVERY INTEGRATION
// ============================================
function zoneInfo(zone) {
  return {
    surat:         { label: 'Surat',           tip: 'Confirm delivery cost on WhatsApp',  cls: 'zone-free',  icon: '🛵' },
    outside_surat: { label: 'Outside Surat',   tip: 'Confirm courier & cost on WhatsApp first',  cls: 'zone-out',  icon: '📦' },
    unknown:       { label: 'Zone unknown',    tip: 'No pincode found — add an address first',   cls: 'zone-unknown', icon: '❓' },
  }[zone] || { label: zone, tip: '', cls: '', icon: '' };
}

function renderPorterSection(o) {
  const booked = !!o.porter_order_id;
  const zone   = zoneInfo(o.delivery_zone || 'unknown');
  if (!booked) {
    return `
      <section class="porter-card">
        <header class="porter-head">
          <div>
            <h4>🚚 Porter Delivery</h4>
            <p>${zone.tip}</p>
          </div>
          <span class="zone-pill ${zone.cls}">${zone.icon} ${zone.label}</span>
        </header>
        <div id="porterQuoteResult"></div>
        <div class="porter-actions">
          <button type="button" class="btn-ghost" id="porterQuoteBtn">Get Quote</button>
          <button type="button" class="btn-primary-modal" id="porterBookBtn">${o.delivery_zone === 'surat' ? 'Book Porter (optional)' : 'Book Porter →'}</button>
        </div>
      </section>
    `;
  }
  const statusClass = {
    'open':'idle','accepted':'active','rider_assigned':'active',
    'picked_up':'active','in_transit':'active',
    'delivered':'done','cancelled':'cancel',
  }[o.porter_status] || 'idle';
  const statusLabel = (o.porter_status || 'pending').replace(/_/g,' ');
  return `
    <section class="porter-card porter-card-booked">
      <header class="porter-head">
        <div>
          <h4>🚚 Porter Delivery</h4>
          <p>${o.porter_vehicle || ''} · booked ${o.porter_booked_at ? formatDate(o.porter_booked_at) : '—'}</p>
        </div>
        <span class="porter-badge porter-badge-${statusClass}">${statusLabel}</span>
      </header>
      <div class="porter-grid">
        <div><span class="ml">Porter ID</span><span class="mv"><code>${o.porter_order_id}</code></span></div>
        <div><span class="ml">Fare</span><span class="mv">${INR(o.porter_fare || 0)}</span></div>
        <div><span class="ml">ETA</span><span class="mv">${o.porter_eta_minutes ? minutesPretty(o.porter_eta_minutes) : '—'}</span></div>
        <div><span class="ml">Vehicle</span><span class="mv">${o.porter_vehicle || '—'}</span></div>
      </div>
      <div class="porter-actions">
        <a class="btn-ghost" href="${o.porter_tracking_url || '#'}" target="_blank" rel="noopener">↗ Track on Porter</a>
        <button type="button" class="btn-ghost" id="porterRefreshBtn">↻ Refresh Status</button>
        <button type="button" class="btn-ghost porter-danger" id="porterCancelBtn">Cancel Booking</button>
      </div>
    </section>
  `;
}

function minutesPretty(min) {
  if (!min) return '—';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min/60), m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function wirePorterHandlers() {
  const o = CURRENT_ORDER;
  const $ = id => document.getElementById(id);

  $('porterQuoteBtn')?.addEventListener('click', async () => {
    $('porterQuoteResult').innerHTML = '<div class="porter-loading">Fetching quote…</div>';
    try {
      const r = await api(`/api/admin/porter/quote/${o.id}`, { method: 'POST' });
      const q = r.quote;
      $('porterQuoteResult').innerHTML = `
        <div class="porter-quote">
          <div><strong>${INR(q.fare_inr)}</strong><span>Fare</span></div>
          <div><strong>${minutesPretty(q.eta_minutes)}</strong><span>ETA</span></div>
          <div><strong>${q.vehicle_type || '—'}</strong><span>Vehicle</span></div>
          <div><strong>${q.distance_km || '—'} km</strong><span>Distance</span></div>
          ${q.mock ? '<div class="porter-mock">MOCK MODE</div>' : ''}
        </div>
      `;
    } catch (e) { showToast(e.message); }
  });

  $('porterBookBtn')?.addEventListener('click', async () => {
    if (!confirm('Book this order with Porter for delivery?')) return;
    try {
      const r = await api(`/api/admin/porter/book/${o.id}`, { method: 'POST', body: '{}' });
      CURRENT_ORDER = r.order;
      showToast(`Booked! Porter ID: ${r.booking.order_id}`);
      renderOrderModal();
      loadOrders();
    } catch (e) { showToast(e.message); }
  });

  $('porterRefreshBtn')?.addEventListener('click', async () => {
    try {
      const r = await api(`/api/admin/porter/status/${o.id}`, { method: 'GET' });
      // re-fetch order with updated porter_status
      CURRENT_ORDER = await api(`/api/admin/orders/${o.id}`);
      showToast(`Status: ${r.status.status}`);
      renderOrderModal();
      loadOrders();
    } catch (e) { showToast(e.message); }
  });

  $('porterCancelBtn')?.addEventListener('click', async () => {
    if (!confirm('Cancel this Porter booking?')) return;
    try {
      await api(`/api/admin/porter/cancel/${o.id}`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'admin cancelled' }),
      });
      CURRENT_ORDER = await api(`/api/admin/orders/${o.id}`);
      showToast('Porter booking cancelled');
      renderOrderModal();
      loadOrders();
    } catch (e) { showToast(e.message); }
  });
}
document.getElementById('orderModalClose').addEventListener('click', () => {
  document.getElementById('orderModal').hidden = true;
});
document.querySelector('#orderModal .modal-backdrop').addEventListener('click', () => {
  document.getElementById('orderModal').hidden = true;
});

// ============================================
// STOCK VIEW
// ============================================
async function loadStock() {
  const products = await api('/api/products');
  window.__FUKU_PRODUCTS__ = products;
  // tabulate
  const tbody = document.querySelector('#stockTable tbody');
  tbody.innerHTML = products.map(p => {
    const status = p.stock === 0
      ? `<span class="pill pill-cancelled">Out</span>`
      : p.low_stock
        ? `<span class="pill pill-pending">Low</span>`
        : `<span class="pill pill-delivered">OK</span>`;
    const validityLabel = p.validity_days >= 365 ? '1 yr +' : `${p.validity_days} days`;
    let expiryCell;
    if (p.next_expiry == null) {
      expiryCell = `<span class="expiry-pill none">no batch</span>`;
    } else if (p.days_until_expiry < 0) {
      expiryCell = `<span class="expiry-pill expired">expired</span>`;
    } else {
      const cls = p.expiry_critical ? 'critical' : (p.expiry_warning ? 'warning' : 'ok');
      expiryCell = `<span class="expiry-pill ${cls}">${p.days_until_expiry}d · ${shortDate(p.next_expiry)}</span>`;
    }
    return `
    <tr data-pid="${p.id}">
      <td>
        <div class="customer-name">${p.name}</div>
        <div class="customer-meta">${p.id}</div>
      </td>
      <td><span class="source-tag">${p.cat}</span></td>
      <td>
        <input type="number" class="stock-input price-input" data-id="${p.id}" value="${p.price}" />
      </td>
      <td>
        <input type="number" class="stock-input stock-input-field" data-id="${p.id}" value="${p.stock}" />
      </td>
      <td><span style="font-family:var(--font-mono);font-size:12px;color:var(--ink-3)">${validityLabel}</span></td>
      <td>${expiryCell}</td>
      <td>
        <div class="stock-adjust">
          <button data-id="${p.id}" data-delta="-10">−10</button>
          <button data-id="${p.id}" data-delta="-1">−1</button>
          <button data-id="${p.id}" data-delta="1">+1</button>
          <button data-id="${p.id}" data-delta="10">+10</button>
          <button data-id="${p.id}" data-delta="50">+50</button>
        </div>
      </td>
      <td>${status}</td>
    </tr>
  `;
  }).join('');

  // Stock save on blur
  tbody.querySelectorAll('.stock-input-field').forEach(inp => {
    inp.addEventListener('change', async () => {
      try {
        await api(`/api/admin/products/${inp.dataset.id}`, {
          method: 'PUT',
          body: JSON.stringify({ stock: parseInt(inp.value, 10), stock_reason: 'admin edit' }),
        });
        showToast('Stock updated');
        loadStock();
        loadDashboard();
      } catch (e) { showToast(e.message); }
    });
  });
  tbody.querySelectorAll('.price-input').forEach(inp => {
    inp.addEventListener('change', async () => {
      try {
        await api(`/api/admin/products/${inp.dataset.id}`, {
          method: 'PUT',
          body: JSON.stringify({ price: parseInt(inp.value, 10) }),
        });
        showToast('Price updated');
      } catch (e) { showToast(e.message); }
    });
  });
  tbody.querySelectorAll('.stock-adjust button').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const r = await api('/api/admin/stock/adjust', {
          method: 'POST',
          body: JSON.stringify({
            product_id: btn.dataset.id,
            delta: parseInt(btn.dataset.delta, 10),
            reason: 'quick adjust',
          }),
        });
        showToast(`Stock → ${r.new_stock}`);
        loadStock();
        loadDashboard();
      } catch (e) { showToast(e.message); }
    });
  });

  // low stock list
  const low = await api('/api/admin/stock/low');
  const lowList = document.getElementById('lowStockList');
  lowList.innerHTML = low.length ? low.map(p => `
    <div class="low-item ${p.stock === 0 ? 'danger' : ''}">
      <div>
        <div class="li-name">${p.name}</div>
        <div class="li-sub">${p.cat} · threshold ${p.low_stock_threshold}</div>
      </div>
      <div class="li-stock">${p.stock}</div>
    </div>
  `).join('') : `<p style="color:var(--ink-3);padding:20px 0;text-align:center">All products stocked. 🎉</p>`;

  // stock log
  const log = await api('/api/admin/stock/log?limit=15');
  const logList = document.getElementById('stockLogList');
  logList.innerHTML = log.map(l => `
    <div class="log-row">
      <div>
        <div class="log-name">${l.product_name || l.product_id}</div>
        <div class="log-reason">${l.reason || '—'} · <span class="log-by">by ${teamName(l.changed_by) || l.changed_by || 'system'}</span></div>
      </div>
      <div>
        <div class="log-delta ${l.delta >= 0 ? 'pos' : 'neg'}">${l.delta >= 0 ? '+' : ''}${l.delta}</div>
        <div class="log-time">${formatDate(l.created_at)}</div>
      </div>
    </div>
  `).join('');

  // expiring soon
  const expiring = await api('/api/admin/stock/expiring?days=14');
  const expList = document.getElementById('expiringList');
  expList.innerHTML = expiring.length ? expiring.map(b => {
    const days = b.days_until_expiry;
    const danger = days <= 3;
    return `
      <div class="low-item ${danger ? 'danger' : ''}">
        <div>
          <div class="li-name">${b.product_name}</div>
          <div class="li-sub">${b.qty_added} units · expires ${shortDate(b.expiry_date)}</div>
        </div>
        <div class="li-stock">${days}d</div>
      </div>
    `;
  }).join('') : `<p style="color:var(--ink-3);padding:20px 0;text-align:center">Nothing expiring soon. 🎉</p>`;

  // batches table
  const batches = await api('/api/admin/stock/batches?limit=100');
  const bbody = document.querySelector('#batchesTable tbody');
  bbody.innerHTML = batches.length ? batches.map(b => {
    let expiryCls = 'ok';
    let daysText  = `${b.days_until_expiry}d`;
    if (b.expired) { expiryCls = 'expired'; daysText = 'EXPIRED'; }
    else if (b.critical) expiryCls = 'critical';
    else if (b.warning)  expiryCls = 'warning';
    return `
      <tr>
        <td><span class="batch-num">#${b.id}</span></td>
        <td>
          <div class="customer-name">${b.product_name || b.product_id}</div>
          <div class="customer-meta">${b.category || ''}</div>
        </td>
        <td class="num">+${b.qty_added}</td>
        <td>${shortDate(b.batch_date)}</td>
        <td>${shortDate(b.expiry_date)}</td>
        <td><span class="expiry-pill ${expiryCls}">${daysText}</span></td>
        <td style="color:var(--ink-3);font-size:12px">${b.notes || '—'}</td>
        <td style="font-size:11.5px;color:var(--ink-3)">${formatDate(b.created_at)}</td>
      </tr>
    `;
  }).join('') : `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--ink-3)">No batches yet. Click "+ Add Stock" to log your first batch.</td></tr>`;
}

document.getElementById('refreshStockBtn').addEventListener('click', loadStock);

// ============================================
// ADD-STOCK MODAL
// ============================================
const stockModal = document.getElementById('stockModal');
function openStockModal() {
  const products = window.__FUKU_PRODUCTS__ || [];
  const sel = document.getElementById('addStockProduct');
  sel.innerHTML = products.map(p =>
    `<option value="${p.id}" data-validity="${p.validity_days}">${p.name} (stock: ${p.stock})</option>`
  ).join('');
  document.getElementById('addStockDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('addStockQty').value = 50;
  document.getElementById('addStockNotes').value = '';
  updateExpiryHint();
  stockModal.hidden = false;
}
function closeStockModal() { stockModal.hidden = true; }

function updateExpiryHint() {
  const sel = document.getElementById('addStockProduct');
  const opt = sel.options[sel.selectedIndex];
  if (!opt) return;
  const v = parseInt(opt.dataset.validity, 10);
  document.getElementById('addStockValidity').textContent = `Shelf life: ${v} days`;
  const dateVal = document.getElementById('addStockDate').value;
  if (dateVal) {
    const d = new Date(dateVal);
    d.setDate(d.getDate() + v);
    const e = document.getElementById('addStockExpiry');
    e.textContent = `Will expire on ${d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})} (${v} days from batch date)`;
    e.classList.toggle('warn', v <= 14);
  }
}

document.getElementById('addStockBtn').addEventListener('click', openStockModal);
document.getElementById('stockModalClose').addEventListener('click', closeStockModal);
document.getElementById('addStockCancel').addEventListener('click', closeStockModal);
document.querySelector('#stockModal .modal-backdrop').addEventListener('click', closeStockModal);
document.getElementById('addStockProduct').addEventListener('change', updateExpiryHint);
document.getElementById('addStockDate').addEventListener('change', updateExpiryHint);

document.getElementById('addStockForm').addEventListener('submit', async e => {
  e.preventDefault();
  const pid   = document.getElementById('addStockProduct').value;
  const qty   = parseInt(document.getElementById('addStockQty').value, 10);
  const bdate = document.getElementById('addStockDate').value;
  const notes = document.getElementById('addStockNotes').value;
  try {
    const r = await api('/api/admin/stock/batch', {
      method: 'POST',
      body: JSON.stringify({ product_id: pid, qty, batch_date: bdate, notes }),
    });
    showToast(`Batch #${r.batch_id} added — expires ${shortDate(r.expiry_date)}`);
    closeStockModal();
    loadStock();
    loadDashboard();
  } catch (e) { showToast(e.message); }
});

// ============================================
// PRODUCTS VIEW
// ============================================
async function loadProducts() {
  const products = await api('/api/products');
  window.__FUKU_PRODUCTS__ = products;
  const tbody = document.querySelector('#productsTable tbody');
  tbody.innerHTML = products.map(p => `
    <tr data-pid="${p.id}">
      <td>
        <button class="prod-thumb" data-pid="${p.id}" title="Click to change photo">
          ${p.image_url
            ? `<img src="${p.image_url}?t=${Date.now()}" alt="${p.name}" />`
            : '<span class="prod-thumb-empty">📷</span>'}
        </button>
      </td>
      <td>
        <div class="customer-name">${p.name}</div>
        <div class="customer-meta">${p.id} · ${(p.description || '').substring(0, 60)}…</div>
      </td>
      <td><span class="source-tag">${p.cat}</span></td>
      <td class="num">${INR(p.price)}</td>
      <td class="num" style="color:var(--ink-3);text-decoration:line-through">${p.was ? INR(p.was) : '—'}</td>
      <td class="num">${intf(p.stock)}</td>
      <td>${p.bestseller ? '⭐' : '—'}</td>
      <td>${p.active ? '<span class="pill pill-delivered">Active</span>' : '<span class="pill pill-cancelled">Inactive</span>'}</td>
      <td><button class="btn-ghost prod-edit" data-pid="${p.id}">Edit</button></td>
    </tr>
  `).join('');

  // Click thumbnail → open modal & focus on photo
  tbody.querySelectorAll('.prod-thumb').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = products.find(x => x.id === btn.dataset.pid);
      openProductModal(p, /*focusPhoto=*/true);
    });
  });
  // Click Edit → open modal
  tbody.querySelectorAll('.prod-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = products.find(x => x.id === btn.dataset.pid);
      openProductModal(p);
    });
  });
}
document.getElementById('refreshProductsBtn')?.addEventListener('click', loadProducts);

// ============================================
// PRODUCT EDIT MODAL  (with photo upload)
// ============================================
let PM_PENDING_PHOTO = null;   // base64 data URL waiting to upload

function openProductModal(p, focusPhoto) {
  PM_PENDING_PHOTO = null;
  document.getElementById('pmId').value         = p.id;
  document.getElementById('pmName').value       = p.name || '';
  document.getElementById('pmCat').value        = p.cat || 'beans';
  document.getElementById('pmShort').value      = p.short || '';
  document.getElementById('pmSub').value        = p.sub || '';
  document.getElementById('pmDesc').value       = p.description || '';
  document.getElementById('pmPrice').value      = p.price || 0;
  document.getElementById('pmWas').value        = p.was || '';
  document.getElementById('pmRoast').value      = p.roast || '';
  document.getElementById('pmBadge').value      = p.badge || '';
  document.getElementById('pmStock').value      = p.stock || 0;
  document.getElementById('pmValidity').value   = p.validity_days || 60;
  document.getElementById('pmBestseller').checked = !!p.bestseller;
  document.getElementById('pmActive').checked     = !!p.active;
  document.getElementById('productModalTitle').textContent = `Edit · ${p.name}`;

  const img = document.getElementById('pmPhotoImg');
  const empty = document.querySelector('.pm-photo-empty');
  if (p.image_url) {
    img.src = p.image_url + '?t=' + Date.now();
    img.style.display = '';
    empty.style.display = 'none';
  } else {
    img.src = ''; img.style.display = 'none';
    empty.style.display = '';
  }
  document.getElementById('pmPhotoSaveBtn').hidden = true;
  document.getElementById('pmPhotoHint').textContent = 'JPG / PNG / WebP · max 6 MB · ideal 1000×1000';
  document.getElementById('pmPhotoFile').value = '';

  document.getElementById('productModal').hidden = false;
  if (focusPhoto) setTimeout(() => document.querySelector('.pm-photo-block').scrollIntoView({block:'center'}), 100);
}
function closeProductModal() { document.getElementById('productModal').hidden = true; }

document.getElementById('productModalClose')?.addEventListener('click', closeProductModal);
document.getElementById('pmCancelBtn')?.addEventListener('click', closeProductModal);
document.querySelector('#productModal .modal-backdrop')?.addEventListener('click', closeProductModal);

// File picker → preview → enable save
document.getElementById('pmPhotoFile')?.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 6 * 1024 * 1024) {
    showToast('Image too large (max 6 MB). Compress and retry.');
    e.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    PM_PENDING_PHOTO = reader.result;       // data:image/...;base64,...
    document.getElementById('pmPhotoImg').src = PM_PENDING_PHOTO;
    document.getElementById('pmPhotoImg').style.display = '';
    document.querySelector('.pm-photo-empty').style.display = 'none';
    document.getElementById('pmPhotoSaveBtn').hidden = false;
    document.getElementById('pmPhotoHint').textContent =
      `New photo ready: ${file.name} (${Math.round(file.size/1024)} KB) — click "Upload & Save" or submit the form.`;
  };
  reader.readAsDataURL(file);
});

// Direct "Upload & Save" — just photo, doesn't touch other fields
document.getElementById('pmPhotoSaveBtn')?.addEventListener('click', async () => {
  if (!PM_PENDING_PHOTO) return;
  const pid = document.getElementById('pmId').value;
  try {
    const r = await api(`/api/admin/products/${pid}/image`, {
      method: 'POST',
      body: JSON.stringify({ data: PM_PENDING_PHOTO }),
    });
    showToast(`Photo uploaded (${r.size_kb} KB) ✓`);
    PM_PENDING_PHOTO = null;
    document.getElementById('pmPhotoSaveBtn').hidden = true;
    document.getElementById('pmPhotoHint').textContent = 'Saved · live on the storefront now.';
    loadProducts();
  } catch (e) { showToast(e.message); }
});

// Save All — pushes photo (if pending) + all field updates
document.getElementById('productEditForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const pid = document.getElementById('pmId').value;

  // 1) Photo first (if changed)
  if (PM_PENDING_PHOTO) {
    try {
      await api(`/api/admin/products/${pid}/image`, {
        method: 'POST', body: JSON.stringify({ data: PM_PENDING_PHOTO }),
      });
    } catch (e) {
      showToast('Photo upload failed: ' + e.message);
      return;
    }
  }

  // 2) Field updates
  const body = {
    name:           document.getElementById('pmName').value.trim(),
    cat:            document.getElementById('pmCat').value,
    short:          document.getElementById('pmShort').value.trim(),
    sub:            document.getElementById('pmSub').value.trim(),
    description:    document.getElementById('pmDesc').value.trim(),
    price:          parseInt(document.getElementById('pmPrice').value, 10) || 0,
    was:            parseInt(document.getElementById('pmWas').value, 10) || 0,
    roast:          document.getElementById('pmRoast').value.trim(),
    badge:          document.getElementById('pmBadge').value.trim(),
    stock:          parseInt(document.getElementById('pmStock').value, 10) || 0,
    low_stock_threshold: 10,
    bestseller:     document.getElementById('pmBestseller').checked ? 1 : 0,
    active:         document.getElementById('pmActive').checked ? 1 : 0,
  };
  try {
    await api(`/api/admin/products/${pid}`, { method: 'PUT', body: JSON.stringify(body) });
    showToast('Product saved');
    closeProductModal();
    loadProducts();
  } catch (e) { showToast(e.message); }
});

// ============================================
// CHATS VIEW
// ============================================
async function loadChats() {
  const log = await api('/api/admin/chat/log?limit=100');
  const listEl = document.getElementById('chatLogList');
  listEl.innerHTML = log.length ? log.slice(0, 50).map(c => `
    <div class="chat-row">
      <div class="chat-row-head">
        <span class="chat-row-intent">${c.intent || 'unknown'}</span>
        <span class="chat-row-time">${formatDate(c.created_at)}</span>
      </div>
      <div class="chat-msg-block user">
        <span class="label">User:</span> ${escapeHtml(c.user_msg || '')}
      </div>
      <div class="chat-msg-block bot">
        <span class="label">Bot:</span> <span class="text">${escapeHtml((c.bot_msg || '').substring(0, 220))}${(c.bot_msg || '').length > 220 ? '…' : ''}</span>
      </div>
    </div>
  `).join('') : `<p style="color:var(--ink-3);padding:30px 0;text-align:center">No chats yet.</p>`;

  // Intent stats
  const intentCounts = {};
  log.forEach(c => {
    const k = c.intent || 'unknown';
    intentCounts[k] = (intentCounts[k] || 0) + 1;
  });
  const sorted = Object.entries(intentCounts).sort((a, b) => b[1] - a[1]);

  destroyChart('intent');
  charts.intent = new Chart(document.getElementById('intentChart'), {
    type: 'bar',
    data: {
      labels: sorted.map(([k]) => k),
      datasets: [{
        data: sorted.map(([, v]) => v),
        backgroundColor: PURPLE_PALETTE,
        borderRadius: 6,
      }],
    },
    options: chartBase({
      plugins: { legend: { display: false } },
    }),
  });

  const totalChats = log.length;
  const uniqueSessions = new Set(log.map(c => c.session_id)).size;
  const escalates = log.filter(c => c.intent === 'escalate').length;
  document.getElementById('chatStats').innerHTML = `
    <div class="cs-row"><span>Total messages</span><span>${intf(totalChats)}</span></div>
    <div class="cs-row"><span>Unique sessions</span><span>${intf(uniqueSessions)}</span></div>
    <div class="cs-row"><span>WhatsApp handoffs</span><span>${intf(escalates)}</span></div>
    <div class="cs-row"><span>Top intent</span><span style="font-size:14px">${sorted[0]?.[0] || '—'}</span></div>
  `;
}
document.getElementById('refreshChatsBtn').addEventListener('click', loadChats);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// ============================================
// REPORTS VIEW
// ============================================
async function loadReports() {
  const data90 = await api('/api/admin/sales/daily?days=90');
  destroyChart('r90');
  const ctx = document.getElementById('report90').getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 420);
  grad.addColorStop(0, 'rgba(74, 26, 142, 0.4)');
  grad.addColorStop(1, 'rgba(74, 26, 142, 0)');
  charts.r90 = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data90.map(d => shortDate(d.date)),
      datasets: [{
        label: 'Revenue (₹)',
        data: data90.map(d => d.revenue),
        borderColor: COLORS.purple,
        backgroundColor: grad,
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 0,
      }],
    },
    options: chartBase({
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: COLORS.ink3, font: { size: 10 }, maxTicksLimit: 18 } },
        y: { grid: { color: '#F0EAF8' }, ticks: { callback: v => '₹' + (v / 1000).toFixed(0) + 'k' }, beginAtZero: true },
      },
    }),
  });

  const data30 = await api('/api/admin/sales/daily?days=30');
  destroyChart('rOrders30');
  charts.rOrders30 = new Chart(document.getElementById('reportOrders30'), {
    type: 'bar',
    data: {
      labels: data30.map(d => shortDate(d.date)),
      datasets: [{
        label: 'Orders',
        data: data30.map(d => d.order_count),
        backgroundColor: COLORS.purple,
        borderRadius: 5,
      }],
    },
    options: chartBase({ plugins: { legend: { display: false } } }),
  });

  destroyChart('rUnits30');
  charts.rUnits30 = new Chart(document.getElementById('reportUnits30'), {
    type: 'bar',
    data: {
      labels: data30.map(d => shortDate(d.date)),
      datasets: [{
        label: 'Units sold',
        data: data30.map(d => d.units),
        backgroundColor: COLORS.orange,
        borderRadius: 5,
      }],
    },
    options: chartBase({ plugins: { legend: { display: false } } }),
  });
}

// ====== CSV EXPORT ======
document.getElementById('exportDailyCsv').addEventListener('click', async () => {
  const data = await api('/api/admin/sales/daily?days=90');
  const csv = 'Date,Orders,Revenue,Units\n' +
    data.map(d => `${d.date},${d.order_count},${d.revenue},${d.units}`).join('\n');
  downloadCSV(csv, 'fuku-daily-sales.csv');
});
document.getElementById('exportOrdersCsv').addEventListener('click', async () => {
  const data = await api('/api/admin/orders?limit=500');
  const headers = 'Order No,Customer,Phone,Email,Address,Subtotal,Shipping,Total,Status,Source,Date,Items';
  const rows = data.map(o => [
    o.order_no,
    `"${(o.customer_name || '').replace(/"/g, '""')}"`,
    o.customer_phone || '',
    o.customer_email || '',
    `"${(o.shipping_address || '').replace(/"/g, '""')}"`,
    o.subtotal, o.shipping, o.total,
    o.status, o.source, o.created_at,
    `"${o.items.map(i => `${i.qty}× ${i.product_name}`).join(' | ').replace(/"/g, '""')}"`,
  ].join(','));
  downloadCSV(headers + '\n' + rows.join('\n'), 'fuku-orders.csv');
});

function downloadCSV(text, filename) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  showToast(`Downloaded ${filename}`);
}

// ============================================
// INIT
// ============================================
if (TOKEN) {
  // Validate token + restore user, then show app
  api('/api/admin/me')
    .then(me => { CURRENT_USER = me; localStorage.setItem(USER_KEY, JSON.stringify(me)); showApp(); })
    .catch(showLogin);
} else {
  showLogin();
}

// Auto refresh dashboard every 60s when visible
setInterval(() => {
  if (!document.hidden && document.querySelector('.view.active')?.dataset.view === 'dashboard') {
    loadDashboard();
  }
}, 60000);
