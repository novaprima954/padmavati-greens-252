/* ═══════════════════════════════════════════════════
   PADMAVATI GREENS — app.js
═══════════════════════════════════════════════════ */

// ── CONFIG ───────────────────────────────────────
const API_URL = 'https://script.google.com/macros/s/AKfycby-NBAs_wufuPXhU0cLEokkyWmMIYA3OLj6D_mA2UEYJdHAR2a45QxzlWDaXG6aEZFK/exec'; // ← Replace after deploying Apps Script

// ── STATE ────────────────────────────────────────
let session     = null;   // { token, userID, username, name, role }
let allPlots    = [];
let allBookings = [];
let plotFilter  = 'All';
let selPlotNo   = null;
let toastTimer  = null;
let bookingCols = [];

// ── INIT ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Restore session from localStorage
  const saved = localStorage.getItem('pg_session');
  if (saved) {
    try { session = JSON.parse(saved); bootApp(); }
    catch(e) { localStorage.removeItem('pg_session'); }
  }

  // Login
  document.getElementById('loginBtn').addEventListener('click', doLogin);
  document.getElementById('loginPass').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });

  // Nav tabs
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab, btn));
  });

  // User pill → logout
  document.getElementById('userPill').addEventListener('click', doLogout);

  // Plot filter chips
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => setChip(chip.dataset.filter, chip));
  });

  // Plot search + filters
  document.getElementById('plotSearch').addEventListener('input', filterPlots);
  document.getElementById('zoneFilter').addEventListener('change', filterPlots);

  // Booking form submit
  document.getElementById('bookingForm').addEventListener('submit', submitBooking);

  // Status lookup
  document.getElementById('lookupBtn').addEventListener('click', lookupReceipt);
  document.getElementById('receiptInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') lookupReceipt();
  });

  // Bookings search/filter
  document.getElementById('bSearch').addEventListener('input', filterBookings);
  document.getElementById('bStatusFilter').addEventListener('change', filterBookings);

  // Modal close buttons
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeOverlay(btn.dataset.close));
  });
  document.querySelectorAll('.overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target === o) closeOverlay(o.id); });
  });

  // Print button in success modal
  document.getElementById('printBtn').addEventListener('click', () => window.print());
});

// ═══════════════════════════════════════════════════
// LOGIN / LOGOUT
// ═══════════════════════════════════════════════════
async function doLogin() {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  const errEl    = document.getElementById('loginError');
  const btn      = document.getElementById('loginBtn');

  if (!username || !password) {
    showLoginError('Please enter username and password.');
    return;
  }

  btn.textContent = 'Logging in…';
  btn.disabled    = true;
  errEl.style.display = 'none';

  try {
    const res = await apiGet({ action: 'login', username, password });
    if (res.error) { showLoginError(res.error); return; }
    session = res;
    localStorage.setItem('pg_session', JSON.stringify(session));
    bootApp();
  } catch(e) {
    showLoginError('Cannot reach server. Check your internet connection.');
  } finally {
    btn.textContent = 'Login';
    btn.disabled    = false;
  }
}

function showLoginError(msg) {
  const el = document.getElementById('loginError');
  el.textContent  = msg;
  el.style.display = 'block';
}

function doLogout() {
  if (!confirm('Log out of Padmavati Greens?')) return;
  localStorage.removeItem('pg_session');
  session = null;
  allPlots    = [];
  allBookings = [];
  selPlotNo   = null;
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appShell').classList.remove('visible');
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
  document.getElementById('loginError').style.display = 'none';
}

function bootApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appShell').classList.add('visible');

  // Set user info
  const name = session.name || session.username;
  document.getElementById('userName').textContent   = name;
  document.getElementById('userRole').textContent   = session.role;
  document.getElementById('userAvatar').textContent = name.charAt(0).toUpperCase();

  // Load all data
  loadPlots();
  loadStats();
  loadBookings();
}

// ═══════════════════════════════════════════════════
// API HELPERS
// ═══════════════════════════════════════════════════
async function apiGet(params) {
  if (session) params.token = session.token;
  const res = await fetch(API_URL + '?' + new URLSearchParams(params));
  const data = await res.json();
  if (data.error === 'Unauthorized. Please login again.') { doLogout(); return data; }
  return data;
}

async function apiPost(data) {
  if (session) data.token = session.token;
  const res = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (json.error === 'Unauthorized. Please login again.') { doLogout(); return json; }
  return json;
}

// ═══════════════════════════════════════════════════
// PLOTS
// ═══════════════════════════════════════════════════
async function loadPlots() {
  try {
    const data = await apiGet({ action: 'getPlots' });
    if (data.error) throw new Error(data.error);
    allPlots = data.plots;
    populateZoneFilter(allPlots);
    filterPlots();
    renderBplotGrid(allPlots);
  } catch(e) {
    document.getElementById('plotGrid').innerHTML =
      `<div class="empty-state" style="grid-column:1/-1;">
         <div class="empty-icon">⚠️</div>
         <p>Could not load plots.<br><small style="color:#bbb;">${e.message}</small></p>
       </div>`;
  }
}

async function loadStats() {
  try {
    const data = await apiGet({ action: 'getStats' });
    if (!data.success) return;
    const s = data.stats;
    document.getElementById('s-total').textContent  = s.total;
    document.getElementById('s-avail').textContent  = s.available;
    document.getElementById('s-booked').textContent = s.booked;
    document.getElementById('s-res').textContent    = s.reserved;
    document.getElementById('s-rev').textContent    = '₹' + fmtNum(s.totalRevenue);
  } catch(e) {}
}

function populateZoneFilter(plots) {
  const zones = [...new Set(plots.map(p => p['Zone']).filter(Boolean))].sort();
  const sel   = document.getElementById('zoneFilter');
  // Keep first option, replace rest
  sel.innerHTML = '<option value="">All Zones</option>' +
    zones.map(z => `<option value="${z}">Zone ${z}</option>`).join('');
}

function renderPlots(plots) {
  const grid = document.getElementById('plotGrid');
  document.getElementById('plotCount').textContent = plots.length + ' plots';

  if (!plots.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">🔍</div><p>No plots match your filter</p></div>';
    return;
  }

  grid.innerHTML = plots.map(p => {
    const status   = p['Status'] || 'Available';
    const isCorner = p['Corner'] === 'Yes';
    const price    = p['Total Amount'];
    const ppsqft   = p['Price per sqft'];
    const sqft     = p['Area SqFt'];
    const sqm      = p['Area SqM'];

    let areaLine = '';
    if (sqm)  areaLine += sqm + ' SqM';
    if (sqft) areaLine += (areaLine ? ' / ' : '') + sqft + ' SqFt';

    let priceLine = '';
    if (price)  priceLine = '₹' + fmtNum(price);
    else if (ppsqft) priceLine = '₹' + fmtNum(ppsqft) + '/sqft';

    return `
      <div class="plot-card ${status}" onclick="openPlotModal('${p['Plot No']}')">
        ${isCorner ? '<span class="corner-tag">★ Corner</span>' : ''}
        ${p['Sr No'] ? `<div class="pc-srno">Sr. ${p['Sr No']}</div>` : ''}
        <div class="pc-num">Plot ${p['Plot No']}</div>
        ${areaLine ? `<div class="pc-area">${areaLine}</div>` : ''}
        ${p['Zone'] ? `<div class="pc-zone">Zone ${p['Zone']}</div>` : ''}
        <div class="${priceLine ? 'pc-price' : 'pc-price none'}">
          ${priceLine || 'Price on request'}
        </div>
        <span class="pc-badge">${status}</span>
      </div>`;
  }).join('');
}

function filterPlots() {
  const q    = document.getElementById('plotSearch').value.toLowerCase().trim();
  const zone = document.getElementById('zoneFilter').value;

  const filtered = allPlots.filter(p => {
    const status = p['Status'] || 'Available';
    const matchFilter =
      plotFilter === 'All'      ? true :
      plotFilter === 'Corner'   ? p['Corner'] === 'Yes' :
                                  status === plotFilter;
    const matchQ    = !q    || String(p['Plot No']).includes(q) || (p['Zone']||'').toLowerCase().includes(q) || (p['Sr No']||'').toString().includes(q);
    const matchZone = !zone || p['Zone'] === zone;
    return matchFilter && matchQ && matchZone;
  });
  renderPlots(filtered);
}

function setChip(filter, btn) {
  plotFilter = filter;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
  btn.classList.add('on');
  filterPlots();
}

// ── Plot Detail Modal ──────────────────────────────
function openPlotModal(plotNo) {
  const p = allPlots.find(x => String(x['Plot No']) === String(plotNo));
  if (!p) return;

  document.getElementById('plotModalTitle').textContent = `Plot ${p['Plot No']}`;

  const status   = p['Status'] || 'Available';
  const sqm      = p['Area SqM'];
  const sqft     = p['Area SqFt'];
  const ppsqft   = p['Price per sqft'];
  const total    = p['Total Amount'];

  const rows = [
    ['Sr. No',       p['Sr No'] || '—'],
    ['Plot No',      p['Plot No']],
    ['Area',         [sqm ? sqm+' SqM' : '', sqft ? sqft+' SqFt' : ''].filter(Boolean).join(' / ') || '—'],
    ['Zone',         p['Zone'] || '—'],
    ['Corner Plot',  p['Corner'] === 'Yes' ? '★ Yes' : 'No'],
    ['Notes',        p['Notes'] || '—'],
  ];

  let body = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
    ${rows.map(([l,v]) =>
      `<div>
        <div style="font-size:.7rem;color:var(--grey);margin-bottom:2px;">${l}</div>
        <div style="font-size:.9rem;font-weight:500;">${v}</div>
      </div>`
    ).join('')}
  </div>`;

  // Pricing block
  if (total || ppsqft) {
    body += `<div style="background:var(--mist);border-radius:10px;padding:14px;margin-bottom:14px;">`;
    if (ppsqft) body += `<div style="font-size:.75rem;color:var(--grey);margin-bottom:2px;">Rate</div>
      <div style="font-size:.95rem;font-weight:600;color:var(--forest);">₹${fmtNum(ppsqft)} / SqFt</div>`;
    if (total)  body += `<div style="font-size:.75rem;color:var(--grey);margin-top:${ppsqft?8:0}px;margin-bottom:2px;">Total Amount</div>
      <div style="font-family:'Cormorant Garamond',serif;font-size:1.9rem;font-weight:700;color:var(--forest);">₹${fmtNum(total)}</div>`;
    body += `</div>`;
  }

  // Status block
  const statusCfg = {
    Available: { bg: 'var(--leaf-l)',  fg: '#2e7d32',     msg: '✅ Available for booking' },
    Booked:    { bg: 'var(--red-l)',   fg: 'var(--red)',  msg: `✗ Booked by ${p['Booked By']||'N/A'} on ${p['Booking Date']||''}` },
    Reserved:  { bg: 'var(--amber-l)', fg: 'var(--amber)',msg: '⏳ Currently reserved' }
  };
  const cfg = statusCfg[status] || statusCfg.Available;
  body += `<div style="background:${cfg.bg};color:${cfg.fg};border-radius:8px;padding:10px 14px;font-size:.85rem;font-weight:600;">${cfg.msg}</div>`;

  document.getElementById('plotModalBody').innerHTML = body;

  const actionsEl = document.getElementById('plotModalActions');
  if (status === 'Available') {
    actionsEl.innerHTML = `<button class="btn-submit" style="margin-top:16px;" onclick="selectPlotAndBook('${p['Plot No']}')">📝 Book This Plot</button>`;
  } else {
    actionsEl.innerHTML = '';
  }

  openOverlay('plotModal');
}

function selectPlotAndBook(plotNo) {
  closeOverlay('plotModal');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-tab="booking"]').classList.add('active');
  showTab('booking');
  selectBplot(plotNo);
}

// ═══════════════════════════════════════════════════
// BOOKING
// ═══════════════════════════════════════════════════
function renderBplotGrid(plots) {
  const grid = document.getElementById('bplotGrid');
  if (!plots.length) { grid.innerHTML = '<div class="loading-block" style="font-size:.8rem;color:var(--grey);">No plots</div>'; return; }

  grid.innerHTML = plots.map(p => {
    const status = p['Status'] || 'Available';
    const cls    = status === 'Available' ? 'av' : status === 'Booked' ? 'bk' : 'rs';
    const dis    = status !== 'Available' ? 'disabled' : '';
    return `<button class="bplot-btn ${cls}" ${dis}
      id="bp-${p['Plot No']}"
      data-plot="${p['Plot No']}"
      title="Plot ${p['Plot No']} · ${p['Area SqM']||''} SqM · Zone ${p['Zone']||'—'}">
      ${p['Plot No']}<br><small style="font-size:.58rem;font-weight:400;">${p['Area SqFt']||p['Area SqM']||''}${p['Area SqFt']?'sqft':'sqm'}</small>
    </button>`;
  }).join('');

  // Attach click events
  grid.querySelectorAll('.bplot-btn.av').forEach(btn => {
    btn.addEventListener('click', () => selectBplot(btn.dataset.plot));
  });
}

function selectBplot(plotNo) {
  // Deselect previous
  if (selPlotNo) {
    const prev = document.getElementById('bp-' + selPlotNo);
    if (prev) prev.classList.remove('sel');
  }
  selPlotNo = plotNo;
  const btn = document.getElementById('bp-' + plotNo);
  if (btn) { btn.classList.add('sel'); btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }

  const p = allPlots.find(x => String(x['Plot No']) === String(plotNo));
  if (!p) return;

  const sqm   = p['Area SqM'];
  const sqft  = p['Area SqFt'];
  const total = p['Total Amount'];
  const ppsqft= p['Price per sqft'];

  document.getElementById('psSummary').innerHTML = [
    ['Sr. No',       p['Sr No'] || '—'],
    ['Plot No',      'Plot ' + p['Plot No']],
    ['Area SqM',     sqm  ? sqm  + ' SqM'  : '—'],
    ['Area SqFt',    sqft ? sqft + ' SqFt' : '—'],
    ['Zone',         p['Zone'] || '—'],
    ['Corner',       p['Corner'] === 'Yes' ? '★ Yes' : 'No'],
    ['Rate',         ppsqft ? '₹' + fmtNum(ppsqft) + '/sqft' : '—'],
  ].map(([l,v]) =>
    `<div class="ps-row"><span class="ps-label">${l}</span><span class="ps-value">${v}</span></div>`
  ).join('') +
  `<div class="ps-row">
    <span class="ps-label">Total Price</span>
    <span class="ps-value ps-price">${total ? '₹'+fmtNum(total) : 'On Request'}</span>
  </div>`;

  document.getElementById('submitBtn').disabled = false;
}

async function submitBooking(e) {
  e.preventDefault();
  if (!selPlotNo) { toast('Please select a plot first', 'err'); return; }

  const btn = document.getElementById('submitBtn');
  btn.disabled    = true;
  btn.textContent = '⏳ Processing…';

  const payload = {
    action:       'createBooking',
    plotNo:       selPlotNo,
    customerName: document.getElementById('f-name').value.trim(),
    phone:        document.getElementById('f-phone').value.trim(),
    aadhaar:      document.getElementById('f-aadhaar').value.trim(),
    pan:          document.getElementById('f-pan').value.trim().toUpperCase(),
    address:      document.getElementById('f-address').value.trim(),
    receiptNo1:   document.getElementById('f-receipt1').value.trim(),
    tokenAmount:  document.getElementById('f-token').value,
    paymentMode:  document.getElementById('f-paymode').value,
    paymentRef:   document.getElementById('f-payref').value.trim(),
    referredBy:   document.getElementById('f-refby').value.trim(),
    remarks:      document.getElementById('f-remarks').value.trim()
  };

  try {
    const res = await apiPost(payload);
    if (res.error) throw new Error(res.error);

    // Show success
    document.getElementById('successReceiptNo').textContent = res.receiptNo;
    document.getElementById('successDetails').innerHTML =
      `<strong>${res.customerName}</strong><br>` +
      `Plot ${res.plotNo}` +
      (res.plotPrice ? ` · ₹${fmtNum(res.plotPrice)}` : '') +
      `<br>Token: ₹${fmtNum(res.tokenAmount)}<br>` +
      `Date: ${res.bookingDate} · By: ${session.name}`;
    openOverlay('successModal');

    // Reset form
    document.getElementById('bookingForm').reset();
    if (selPlotNo) {
      const b = document.getElementById('bp-' + selPlotNo);
      if (b) { b.classList.remove('sel', 'av'); b.classList.add('bk'); b.disabled = true; }
      selPlotNo = null;
    }
    document.getElementById('psSummary').innerHTML =
      '<div class="ps-empty">No plot selected.<br>Choose from the grid above.</div>';
    document.getElementById('submitBtn').disabled = true;

    // Refresh
    await Promise.all([loadPlots(), loadStats(), loadBookings()]);

  } catch(err) {
    toast(err.message, 'err');
  } finally {
    btn.disabled    = false;
    btn.textContent = '📋 Confirm Booking';
  }
}

// ═══════════════════════════════════════════════════
// STATUS LOOKUP
// ═══════════════════════════════════════════════════
async function lookupReceipt() {
  const receiptNo = document.getElementById('receiptInput').value.trim();
  if (!receiptNo) { toast('Enter a receipt number', 'err'); return; }

  try {
    const data = await apiGet({ action: 'getBookingByReceipt', receiptNo });
    if (data.error) throw new Error(data.error);
    renderReceipt(data.booking, data.limited);
    document.getElementById('statusHint').style.display = 'none';
  } catch(e) {
    toast(e.message, 'err');
    document.getElementById('receiptCard').classList.remove('show');
    document.getElementById('statusHint').style.display = 'block';
  }
}

function renderReceipt(b, limited) {
  const card   = document.getElementById('receiptCard');
  const isCxl  = (b['Status'] || '').toLowerCase() === 'cancelled';

  let html = `
    <div class="rc-head">
      <div>
        <div class="rc-tag">Booking Receipt · Padmavati Greens</div>
        <h3>${b['Receipt No']}</h3>
        <p>${b['Booking Date'] || ''}${b['Booking Time'] ? ' at ' + b['Booking Time'] : ''}</p>
      </div>
      <span class="rc-status ${isCxl ? 'cancelled' : ''}">${b['Status'] || 'Active'}</span>
    </div>
    <div class="rc-body">`;

  if (limited) {
    html += `<div class="limited-note">⚠️ Limited view — full details only visible for your own bookings.</div>`;
  }

  if (!limited) {
    html += `
      <div class="rc-section">
        <div class="rc-section-title">Customer</div>
        <div class="rc-grid">
          <div class="rc-field"><label>Full Name</label><span>${b['Customer Full Name']||'—'}</span></div>
          <div class="rc-field"><label>Phone</label><span>${b['Phone Number']||'—'}</span></div>
          <div class="rc-field"><label>Aadhaar</label><span>${b['Aadhaar Number']||'—'}</span></div>
          <div class="rc-field"><label>PAN</label><span>${b['PAN Number']||'—'}</span></div>
        </div>
        ${b['Address'] ? `<div class="rc-field" style="margin-top:8px;"><label>Address</label><span>${b['Address']}</span></div>` : ''}
      </div>`;
  }

  html += `
    <div class="rc-section">
      <div class="rc-section-title">Plot & Payment</div>
      <div class="rc-grid">
        <div class="rc-field"><label>Plot No.</label><span><strong>Plot ${b['Plot No']}</strong></span></div>
        <div class="rc-field"><label>Plot Price</label><span>${b['Plot Price'] ? '₹'+fmtNum(b['Plot Price']) : '—'}</span></div>
        <div class="rc-field"><label>Payment Mode</label><span>${b['Payment Mode']||'—'}</span></div>
        <div class="rc-field"><label>Payment Ref</label><span>${b['Payment Reference']||'—'}</span></div>
        ${!limited && b['Receipt Number 1'] ? `<div class="rc-field"><label>Receipt No. 1</label><span>${b['Receipt Number 1']}</span></div>` : ''}
        ${!limited && b['Referred By']      ? `<div class="rc-field"><label>Referred By</label><span>${b['Referred By']}</span></div>` : ''}
      </div>
    </div>`;

  if (!limited) {
    html += `
      <div class="rc-section">
        <div class="rc-section-title">Booked By</div>
        <div class="rc-grid">
          <div class="rc-field"><label>Name</label><span>${b['Booked By Name']||'—'}</span></div>
          <div class="rc-field"><label>User ID</label><span>${b['Booked By (User ID)']||'—'}</span></div>
        </div>
      </div>`;
  }

  html += `
      <div class="rc-amount">
        <span class="rc-amount-label">Token Amount Paid</span>
        <span class="rc-amount-value">₹${fmtNum(b['Token Amount'])}</span>
      </div>
      ${b['Remarks'] ? `<p style="margin-top:12px;font-size:.8rem;color:var(--grey);">📝 ${b['Remarks']}</p>` : ''}
    </div>
    <button class="btn-print" onclick="window.print()">🖨 Print Receipt</button>`;

  card.innerHTML = html;
  card.classList.add('show');
}

// ═══════════════════════════════════════════════════
// BOOKINGS LIST
// ═══════════════════════════════════════════════════
async function loadBookings() {
  try {
    const data = await apiGet({ action: 'getBookings' });
    if (data.error) throw new Error(data.error);
    allBookings = data.bookings;
    buildBookingsTable(data.role);
    filterBookings();
  } catch(e) {
    document.getElementById('bookingsTbody').innerHTML =
      `<tr><td colspan="10" style="padding:30px;text-align:center;color:var(--grey);">${e.message}</td></tr>`;
  }
}

function buildBookingsTable(role) {
  const isAdmin = role === 'admin';
  if (isAdmin) {
    bookingCols = [
      'Receipt No', 'Booking Date', 'Booking Time', 'Booked By Name',
      'Customer Full Name', 'Phone Number', 'Plot No', 'Plot Price',
      'Token Amount', 'Payment Mode', 'Receipt Number 1',
      'Referred By', 'Status', 'Action'
    ];
  } else {
    bookingCols = [
      'Receipt No', 'Booking Date', 'Booking Time',
      'Booked By Name', 'Plot No', 'Token Amount',
      'Payment Mode', 'Status'
    ];
  }
  document.getElementById('bookingsThead').innerHTML =
    '<tr>' + bookingCols.map(c => `<th>${c}</th>`).join('') + '</tr>';
}

function filterBookings() {
  const q  = document.getElementById('bSearch').value.toLowerCase();
  const st = document.getElementById('bStatusFilter').value;

  const filtered = allBookings.filter(b => {
    const matchQ  = !q  || Object.values(b).some(v => String(v).toLowerCase().includes(q));
    const matchSt = !st || (b['Status'] || '') === st;
    return matchQ && matchSt;
  });

  document.getElementById('bCount').textContent = filtered.length + ' records';

  const tbody = document.getElementById('bookingsTbody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="${bookingCols.length}" class="empty-state" style="padding:40px;text-align:center;color:var(--grey);">No bookings found</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(b => {
    return '<tr>' + bookingCols.map(col => {
      if (col === 'Action') {
        return (b['Status'] !== 'Cancelled')
          ? `<td><button class="btn-cancel" data-receipt="${b['Receipt No']}">Cancel</button></td>`
          : '<td>—</td>';
      }
      if (col === 'Status') {
        const cls = (b['Status']||'').toLowerCase() === 'cancelled' ? 'cancelled' : 'active';
        return `<td><span class="st-badge ${cls}">${b['Status']||'—'}</span></td>`;
      }
      if (col === 'Token Amount' || col === 'Plot Price') {
        return `<td>${b[col] ? '₹'+fmtNum(b[col]) : '—'}</td>`;
      }
      const val = b[col];
      return `<td>${(val !== undefined && val !== '') ? val : '—'}</td>`;
    }).join('') + '</tr>';
  }).join('');

  // Attach cancel button events
  tbody.querySelectorAll('.btn-cancel').forEach(btn => {
    btn.addEventListener('click', () => cancelBooking(btn.dataset.receipt));
  });
}

async function cancelBooking(receiptNo) {
  const reason = prompt('Reason for cancellation (required):');
  if (!reason || !reason.trim()) return;
  if (!confirm(`Cancel booking ${receiptNo}?\nPlot will be released back to Available.`)) return;

  try {
    const res = await apiPost({ action: 'cancelBooking', receiptNo, reason: reason.trim() });
    if (res.error) throw new Error(res.error);
    toast('Booking cancelled. Plot released.', 'ok');
    await Promise.all([loadBookings(), loadPlots(), loadStats()]);
  } catch(e) { toast(e.message, 'err'); }
}

// ═══════════════════════════════════════════════════
// TAB NAVIGATION
// ═══════════════════════════════════════════════════
function showTab(tab, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  if (btn) btn.classList.add('active');
  else {
    const navBtn = document.querySelector(`[data-tab="${tab}"]`);
    if (navBtn) navBtn.classList.add('active');
  }
}

// ═══════════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════════
function openOverlay(id)  { document.getElementById(id).classList.add('show'); }
function closeOverlay(id) { document.getElementById(id).classList.remove('show'); }

// ═══════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════
function fmtNum(n) {
  if (n === '' || n === null || n === undefined) return '0';
  return Number(n).toLocaleString('en-IN');
}

function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = (type ? type + ' ' : '') + 'show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}
