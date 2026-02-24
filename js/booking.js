// js/app/booking.js
let allPlots  = [];
let selPlotNo = null;

document.addEventListener('DOMContentLoaded', () => {
  Header.init('booking');
  Utils.setupOverlays();
  loadPlots();
  document.getElementById('bookingForm').addEventListener('submit', submitBooking);
});

async function loadPlots() {
  try {
    const data = await API.get({ action: 'getPlots' });
    if (data.error) throw new Error(data.error);
    allPlots = data.plots;
    renderBplotGrid(allPlots);

    // Pre-select plot if passed via URL ?plot=XX
    const params  = new URLSearchParams(window.location.search);
    const plotParam = params.get('plot');
    if (plotParam) selectBplot(plotParam);
  } catch(e) {
    document.getElementById('bplotGrid').innerHTML =
      `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${e.message}</p></div>`;
  }
}

function renderBplotGrid(plots) {
  const grid = document.getElementById('bplotGrid');
  if (!plots.length) { grid.innerHTML = '<div style="font-size:.8rem;color:var(--grey);padding:10px;">No plots found</div>'; return; }

  grid.innerHTML = plots.map(p => {
    const status = p['Status'] || 'Available';
    const cls    = status === 'Available' ? 'av' : status === 'Booked' ? 'bk' : 'rs';
    const dis    = status !== 'Available' ? 'disabled' : '';
    const area   = p['Area SqFt'] ? p['Area SqFt']+'sqft' : p['Area SqM'] ? p['Area SqM']+'sqm' : '';
    return `<button class="bplot-btn ${cls}" ${dis} data-plot="${p['Plot No']}"
      id="bp-${p['Plot No']}"
      title="Plot ${p['Plot No']} · Zone ${p['Zone']||'—'} · ${area}">
      ${p['Plot No']}<br><small style="font-size:.58rem;font-weight:400;">${area}</small>
    </button>`;
  }).join('');

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
  selPlotNo = String(plotNo);
  const btn = document.getElementById('bp-' + selPlotNo);
  if (btn) { btn.classList.add('sel'); btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }

  const p = allPlots.find(x => String(x['Plot No']) === selPlotNo);
  if (!p) return;

  const sqm    = p['Area SqM'], sqft = p['Area SqFt'];
  const total  = p['Total Amount'], ppsqft = p['Price per sqft'];

  document.getElementById('psSummary').innerHTML = [
    ['Sr. No',    p['Sr No'] || '—'],
    ['Plot No',   'Plot ' + p['Plot No']],
    ['Area SqM',  sqm  ? sqm  + ' SqM'  : '—'],
    ['Area SqFt', sqft ? sqft + ' SqFt' : '—'],
    ['Zone',      p['Zone']   || '—'],
    ['Corner',    p['Corner'] === 'Yes' ? '★ Yes' : 'No'],
    ['Rate',      ppsqft ? '₹'+Utils.fmtNum(ppsqft)+'/sqft' : '—'],
  ].map(([l,v]) =>
    `<div class="ps-row"><span class="ps-label">${l}</span><span class="ps-value">${v}</span></div>`
  ).join('') + `
    <div class="ps-row">
      <span class="ps-label">Total Price</span>
      <span class="ps-value ps-price">${total ? '₹'+Utils.fmtNum(total) : 'On Request'}</span>
    </div>`;

  document.getElementById('submitBtn').disabled = false;
}

async function submitBooking(e) {
  e.preventDefault();
  if (!selPlotNo) { Utils.toast('Please select a plot first', 'err'); return; }

  const btn = document.getElementById('submitBtn');
  btn.disabled    = true;
  btn.textContent = '⏳ Processing…';

  const session = Auth.getSession();
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
    const res = await API.post(payload);
    if (res.error) throw new Error(res.error);

    document.getElementById('successReceiptNo').textContent = res.receiptNo;
    document.getElementById('successDetails').innerHTML =
      `<strong>${res.customerName}</strong><br>` +
      `Plot ${res.plotNo}${res.plotPrice ? ' · ₹'+Utils.fmtNum(res.plotPrice) : ''}<br>` +
      `Token: ₹${Utils.fmtNum(res.tokenAmount)}<br>` +
      `Date: ${res.bookingDate} · By: ${session.name || session.username}`;
    Utils.openOverlay('successModal');

    // Reset form & grid
    document.getElementById('bookingForm').reset();
    const bBtn = document.getElementById('bp-' + selPlotNo);
    if (bBtn) { bBtn.classList.remove('sel','av'); bBtn.classList.add('bk'); bBtn.disabled = true; }
    selPlotNo = null;
    document.getElementById('psSummary').innerHTML =
      '<div class="ps-empty">No plot selected.<br>Choose from the grid above.</div>';
    document.getElementById('submitBtn').disabled = true;

  } catch(err) {
    Utils.toast(err.message, 'err');
  } finally {
    btn.disabled    = false;
    btn.textContent = '📋 Confirm Booking';
  }
}
